# Phase 2A+2B: Data Layer + HR Console Real CRUD

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace HR Console mock data with real Supabase queries/mutations. Add Teams tab and Holidays tab. Keep other pages on mock data for now (Phase 2C).

**Architecture:** Server actions in `lib/actions/` for all mutations (revalidatePath after each). Server queries in `lib/queries/` for fetching. HR Console page becomes a server component that fetches data and passes to client tab components. Each tab has its own client island with form dialogs that call server actions via `useTransition`.

**Tech Stack:** Next.js 14 server actions, Supabase server client, Zod for input validation, react-hook-form for dialogs, shadcn/ui Dialog component.

---

## File Map

**Create:**
- `lib/actions/users.ts` — createUser, updateUser, deactivateUser, reactivateUser
- `lib/actions/teams.ts` — createTeam, updateTeam, deleteTeam, addMember, removeMember, setLead
- `lib/actions/holidays.ts` — createHoliday, updateHoliday, deleteHoliday, importHolidaysCsv
- `lib/actions/balances.ts` — upsertBalance
- `lib/actions/compoff.ts` — decideCompoff
- `lib/actions/annual-reset.ts` — runAnnualReset
- `lib/actions/_helpers.ts` — checkCapability + audit-log helpers used across actions
- `lib/queries/users.ts` — listUsers, getUserById, listUsersWithTeams
- `lib/queries/teams.ts` — listTeams, getTeamById, listTeamMembers
- `lib/queries/holidays.ts` — listHolidays
- `lib/queries/balances.ts` — listBalancesForYear
- `lib/queries/compoff.ts` — listCompoffGrants
- `components/hr/users-tab.tsx` — client tab with table + dialog
- `components/hr/teams-tab.tsx` — new tab
- `components/hr/holidays-tab.tsx` — new tab
- `components/hr/balances-tab.tsx` — wrap existing UI with real data
- `components/hr/compoff-tab.tsx` — wrap existing UI with real data
- `components/hr/annual-reset-tab.tsx` — wrap existing UI with real action
- `components/hr/user-form-dialog.tsx` — create/edit user
- `components/hr/team-form-dialog.tsx` — create/edit team
- `components/hr/holiday-form-dialog.tsx` — create/edit holiday

**Modify:**
- `app/(app)/hr/page.tsx` — convert to server component, fetch all data, pass to tabs
- `lib/types.ts` — keep mock User/Team types but add re-exports for DB types
- `lib/store.tsx` — accept teams/holidays seed from server (for non-HR pages still on mock)

---

## Task 1: Action helpers (capability check + audit log)

**Files:**
- Create: `lib/actions/_helpers.ts`

- [ ] **Step 1: Create `lib/actions/_helpers.ts`**

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database, Tables } from '@/lib/supabase/database.types'
import { revalidatePath } from 'next/cache'

export class ActionError extends Error {
  constructor(message: string, public code: string = 'error') {
    super(message)
  }
}

export async function requireUser(): Promise<Tables<'users'>> {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) throw new ActionError('Not authenticated', 'unauthenticated')

  const adminClient = createAdminClient()
  const { data: user } = await adminClient
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single()

  if (!user) throw new ActionError('User row not found', 'no_user_row')
  if (user.status === 'exited') throw new ActionError('Account exited', 'exited')
  return user
}

/**
 * Throws ActionError if the current user does not hold `capability`.
 * Mirrors the SQL `user_can()` rules client-side using role bundles.
 */
export async function requireCapability(
  capability:
    | 'view_leaves' | 'edit_leaves'
    | 'view_balance' | 'edit_balance'
    | 'approve_compoff'
    | 'manage_holidays' | 'view_audit_log'
    | 'manage_users' | 'manage_capabilities'
    | 'run_annual_reset',
  targetUserId?: string
): Promise<Tables<'users'>> {
  const user = await requireUser()
  const role = user.role
  const isFounder = role === 'founder'
  const isHR = role === 'hr'
  const isTeamLead = role === 'team_lead'

  // Global caps
  if (capability === 'manage_capabilities') {
    if (!isFounder) throw new ActionError('Founders only', 'forbidden')
    return user
  }
  if (
    capability === 'manage_holidays' ||
    capability === 'manage_users' ||
    capability === 'view_audit_log' ||
    capability === 'run_annual_reset' ||
    capability === 'edit_balance' ||
    capability === 'edit_leaves'
  ) {
    if (!isFounder && !isHR) throw new ActionError('HR or founder only', 'forbidden')
    return user
  }

  // Scoped caps — view_leaves, view_balance, approve_compoff
  if (isFounder || isHR) return user
  if (targetUserId === user.id) return user

  if (isTeamLead && targetUserId) {
    // Verify target is in a team this user leads
    const adminClient = createAdminClient()
    const { data: ledTeams } = await adminClient
      .from('teams')
      .select('id')
      .eq('team_lead_id', user.id)
    const ledIds = (ledTeams ?? []).map((t) => t.id)
    if (ledIds.length === 0) throw new ActionError('No teams led', 'forbidden')

    const { data: tm } = await adminClient
      .from('team_members')
      .select('id')
      .eq('user_id', targetUserId)
      .in('team_id', ledIds)
      .is('left_at', null)
      .limit(1)

    if (!tm || tm.length === 0) {
      throw new ActionError('Target not in your teams', 'forbidden')
    }
    return user
  }

  throw new ActionError('Insufficient permissions', 'forbidden')
}

export async function writeAudit(
  actor_id: string,
  action: string,
  entity_type: string,
  entity_id: string,
  diff?: Database['public']['Tables']['audit_log']['Insert']['diff'],
  note?: string
): Promise<void> {
  const adminClient = createAdminClient()
  await adminClient.from('audit_log').insert({
    actor_id,
    action,
    entity_type,
    entity_id,
    diff: diff ?? null,
    note: note ?? null,
  })
}

export function revalidateHR() {
  revalidatePath('/hr')
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/actions/_helpers.ts
git commit -m "feat: add server-action helpers (requireUser, requireCapability, writeAudit)"
```

---

## Task 2: User actions

**Files:**
- Create: `lib/actions/users.ts`

- [ ] **Step 1: Create `lib/actions/users.ts`**

```typescript
'use server'

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  ActionError,
  requireCapability,
  revalidateHR,
  writeAudit,
} from './_helpers'

const RoleSchema = z.enum(['employee', 'team_lead', 'hr', 'founder'])

const CreateUserSchema = z.object({
  full_name: z.string().min(1, 'Name required'),
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be 8+ chars'),
  role: RoleSchema,
  manager_id: z.string().uuid().nullable().optional(),
  designation: z.string().optional().nullable(),
  primary_team_id: z.string().uuid().nullable().optional(),
  joined_at: z.string().optional(),
})

const UpdateUserSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: RoleSchema.optional(),
  manager_id: z.string().uuid().nullable().optional(),
  designation: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
})

export async function createUser(input: z.infer<typeof CreateUserSchema>) {
  const actor = await requireCapability('manage_users')
  const parsed = CreateUserSchema.parse(input)

  const adminClient = createAdminClient()

  // 1. Create auth user
  const { data: authData, error: authError } =
    await adminClient.auth.admin.createUser({
      email: parsed.email,
      password: parsed.password,
      email_confirm: true,
    })

  if (authError || !authData.user) {
    throw new ActionError(authError?.message ?? 'Auth create failed')
  }

  // 2. Insert users row
  const { data: userRow, error: userError } = await adminClient
    .from('users')
    .insert({
      id: authData.user.id,
      email: parsed.email,
      full_name: parsed.full_name,
      role: parsed.role,
      manager_id: parsed.manager_id ?? null,
      designation: parsed.designation ?? null,
      joined_at: parsed.joined_at ?? new Date().toISOString().split('T')[0],
    })
    .select()
    .single()

  if (userError || !userRow) {
    await adminClient.auth.admin.deleteUser(authData.user.id)
    throw new ActionError(userError?.message ?? 'User insert failed')
  }

  // 3. Apply role bundle
  await adminClient.rpc('recompute_role_bundles', {
    p_user_id: userRow.id,
    p_new_role: parsed.role,
  })

  // 4. Add to primary team if specified
  if (parsed.primary_team_id) {
    await adminClient.from('team_members').insert({
      user_id: userRow.id,
      team_id: parsed.primary_team_id,
      is_primary: true,
    })
  }

  // 5. Bootstrap state advancement
  if (parsed.role === 'hr') {
    const { data: stateRow } = await adminClient
      .from('system_state')
      .select('bootstrap_state')
      .single()
    if (stateRow?.bootstrap_state === 'awaiting_first_hr') {
      await adminClient
        .from('system_state')
        .update({ bootstrap_state: 'awaiting_first_team' })
        .eq('id', 1)
    }
  }

  await writeAudit(
    actor.id,
    'user.create',
    'user',
    userRow.id,
    { after: userRow }
  )

  revalidateHR()
  return userRow
}

export async function updateUser(input: z.infer<typeof UpdateUserSchema>) {
  const actor = await requireCapability('manage_users')
  const parsed = UpdateUserSchema.parse(input)

  const adminClient = createAdminClient()
  const { data: before } = await adminClient
    .from('users')
    .select('*')
    .eq('id', parsed.id)
    .single()

  if (!before) throw new ActionError('User not found')

  const { id, ...updates } = parsed
  const { data: after, error } = await adminClient
    .from('users')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error || !after) throw new ActionError(error?.message ?? 'Update failed')

  // Sync auth email if changed
  if (parsed.email && parsed.email !== before.email) {
    await adminClient.auth.admin.updateUserById(id, { email: parsed.email })
  }

  // Recompute role bundle if role changed
  if (parsed.role && parsed.role !== before.role) {
    await adminClient.rpc('recompute_role_bundles', {
      p_user_id: id,
      p_new_role: parsed.role,
    })
  }

  await writeAudit(actor.id, 'user.update', 'user', id, { before, after })
  revalidateHR()
  return after
}

export async function deactivateUser(userId: string) {
  const actor = await requireCapability('manage_users')
  if (userId === actor.id) {
    throw new ActionError("You can't deactivate yourself")
  }

  const adminClient = createAdminClient()
  const { data: after, error } = await adminClient
    .from('users')
    .update({
      status: 'exited',
      exited_at: new Date().toISOString().split('T')[0],
    })
    .eq('id', userId)
    .select()
    .single()

  if (error) throw new ActionError(error.message)

  await writeAudit(actor.id, 'user.deactivate', 'user', userId, { after })
  revalidateHR()
}

export async function reactivateUser(userId: string) {
  const actor = await requireCapability('manage_users')
  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('users')
    .update({ status: 'active', exited_at: null })
    .eq('id', userId)

  if (error) throw new ActionError(error.message)

  await writeAudit(actor.id, 'user.reactivate', 'user', userId)
  revalidateHR()
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/actions/users.ts
git commit -m "feat: add user CRUD server actions (create, update, deactivate, reactivate)"
```

---

## Task 3: Team actions

**Files:**
- Create: `lib/actions/teams.ts`

- [ ] **Step 1: Create `lib/actions/teams.ts`**

```typescript
'use server'

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  ActionError,
  requireCapability,
  revalidateHR,
  writeAudit,
} from './_helpers'

const WfoSchema = z
  .string()
  .regex(/^([A-Z]{3})(,[A-Z]{3})*$|^$/, 'Invalid WFO pattern')

const CreateTeamSchema = z.object({
  name: z.string().min(1),
  wfo_pattern: WfoSchema,
  team_lead_id: z.string().uuid().nullable().optional(),
})

const UpdateTeamSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  wfo_pattern: WfoSchema.optional(),
  team_lead_id: z.string().uuid().nullable().optional(),
})

export async function createTeam(input: z.infer<typeof CreateTeamSchema>) {
  const actor = await requireCapability('manage_users')
  const parsed = CreateTeamSchema.parse(input)

  const adminClient = createAdminClient()
  const { data: team, error } = await adminClient
    .from('teams')
    .insert({
      name: parsed.name,
      wfo_pattern: parsed.wfo_pattern,
      team_lead_id: parsed.team_lead_id ?? null,
    })
    .select()
    .single()

  if (error || !team) throw new ActionError(error?.message ?? 'Create failed')

  // If a team lead was set, recompute their role bundle in case they were team_lead
  if (parsed.team_lead_id) {
    const { data: leadUser } = await adminClient
      .from('users')
      .select('role')
      .eq('id', parsed.team_lead_id)
      .single()
    if (leadUser?.role === 'team_lead') {
      await adminClient.rpc('recompute_role_bundles', {
        p_user_id: parsed.team_lead_id,
        p_new_role: 'team_lead',
      })
    }
  }

  // Bootstrap state advancement
  const { data: stateRow } = await adminClient
    .from('system_state')
    .select('bootstrap_state')
    .single()
  if (stateRow?.bootstrap_state === 'awaiting_first_team') {
    await adminClient
      .from('system_state')
      .update({
        bootstrap_state: 'operational',
        bootstrapped_at: new Date().toISOString(),
        bootstrapped_by: actor.id,
      })
      .eq('id', 1)
  }

  await writeAudit(actor.id, 'team.create', 'team', team.id, { after: team })
  revalidateHR()
  return team
}

export async function updateTeam(input: z.infer<typeof UpdateTeamSchema>) {
  const actor = await requireCapability('manage_users')
  const parsed = UpdateTeamSchema.parse(input)

  const adminClient = createAdminClient()
  const { data: before } = await adminClient
    .from('teams')
    .select('*')
    .eq('id', parsed.id)
    .single()

  if (!before) throw new ActionError('Team not found')

  const { id, ...updates } = parsed
  const { data: after, error } = await adminClient
    .from('teams')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error || !after) throw new ActionError(error?.message ?? 'Update failed')

  // Recompute lead bundle if lead changed
  if (
    parsed.team_lead_id !== undefined &&
    parsed.team_lead_id !== before.team_lead_id
  ) {
    if (before.team_lead_id) {
      const { data: prev } = await adminClient
        .from('users')
        .select('role')
        .eq('id', before.team_lead_id)
        .single()
      if (prev) {
        await adminClient.rpc('recompute_role_bundles', {
          p_user_id: before.team_lead_id,
          p_new_role: prev.role,
        })
      }
    }
    if (parsed.team_lead_id) {
      const { data: next } = await adminClient
        .from('users')
        .select('role')
        .eq('id', parsed.team_lead_id)
        .single()
      if (next) {
        await adminClient.rpc('recompute_role_bundles', {
          p_user_id: parsed.team_lead_id,
          p_new_role: next.role,
        })
      }
    }
  }

  await writeAudit(actor.id, 'team.update', 'team', id, { before, after })
  revalidateHR()
  return after
}

export async function deleteTeam(teamId: string) {
  const actor = await requireCapability('manage_users')
  const adminClient = createAdminClient()

  const { count } = await adminClient
    .from('team_members')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', teamId)
    .is('left_at', null)

  if (count && count > 0) {
    throw new ActionError(
      `Cannot delete team with ${count} active members. Remove them first.`
    )
  }

  const { error } = await adminClient.from('teams').delete().eq('id', teamId)
  if (error) throw new ActionError(error.message)

  await writeAudit(actor.id, 'team.delete', 'team', teamId)
  revalidateHR()
}

export async function addTeamMember(input: {
  user_id: string
  team_id: string
  is_primary?: boolean
}) {
  const actor = await requireCapability('manage_users')
  const adminClient = createAdminClient()

  const { error } = await adminClient.from('team_members').insert({
    user_id: input.user_id,
    team_id: input.team_id,
    is_primary: input.is_primary ?? false,
  })

  if (error) throw new ActionError(error.message)

  await writeAudit(actor.id, 'team_member.add', 'team', input.team_id, {
    after: input,
  })
  revalidateHR()
}

export async function removeTeamMember(membershipId: string) {
  const actor = await requireCapability('manage_users')
  const adminClient = createAdminClient()

  const { error } = await adminClient
    .from('team_members')
    .update({ left_at: new Date().toISOString().split('T')[0] })
    .eq('id', membershipId)

  if (error) throw new ActionError(error.message)

  await writeAudit(actor.id, 'team_member.remove', 'team_member', membershipId)
  revalidateHR()
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/actions/teams.ts
git commit -m "feat: add team CRUD server actions (create, update, delete, add/remove members)"
```

---

## Task 4: Holiday actions

**Files:**
- Create: `lib/actions/holidays.ts`

- [ ] **Step 1: Create `lib/actions/holidays.ts`**

```typescript
'use server'

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  ActionError,
  requireCapability,
  revalidateHR,
  writeAudit,
} from './_helpers'

const HolidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  name: z.string().min(1),
})

export async function createHoliday(input: z.infer<typeof HolidaySchema>) {
  const actor = await requireCapability('manage_holidays')
  const parsed = HolidaySchema.parse(input)

  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('holidays')
    .insert(parsed)
    .select()
    .single()

  if (error || !data) throw new ActionError(error?.message ?? 'Create failed')
  await writeAudit(actor.id, 'holiday.create', 'holiday', data.id, { after: data })
  revalidateHR()
  return data
}

export async function updateHoliday(input: { id: string; date?: string; name?: string }) {
  const actor = await requireCapability('manage_holidays')
  const adminClient = createAdminClient()

  const { id, ...updates } = input
  const { data, error } = await adminClient
    .from('holidays')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new ActionError(error.message)

  await writeAudit(actor.id, 'holiday.update', 'holiday', id, { after: data })
  revalidateHR()
  return data
}

export async function deleteHoliday(id: string) {
  const actor = await requireCapability('manage_holidays')
  const adminClient = createAdminClient()
  const { error } = await adminClient.from('holidays').delete().eq('id', id)
  if (error) throw new ActionError(error.message)
  await writeAudit(actor.id, 'holiday.delete', 'holiday', id)
  revalidateHR()
}

const CsvRowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().min(1),
})

export async function importHolidaysCsv(rows: { date: string; name: string }[]) {
  const actor = await requireCapability('manage_holidays')
  const adminClient = createAdminClient()
  const errors: { row: number; error: string }[] = []
  const valid: { date: string; name: string }[] = []

  rows.forEach((row, i) => {
    const parsed = CsvRowSchema.safeParse(row)
    if (parsed.success) valid.push(parsed.data)
    else errors.push({ row: i + 1, error: parsed.error.message })
  })

  if (valid.length > 0) {
    const { error } = await adminClient
      .from('holidays')
      .upsert(valid, { onConflict: 'date' })
    if (error) errors.push({ row: -1, error: error.message })
  }

  await writeAudit(actor.id, 'holiday.import', 'holiday', 'batch', {
    after: { imported: valid.length, errors: errors.length },
  })
  revalidateHR()
  return { imported: valid.length, errors }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/actions/holidays.ts
git commit -m "feat: add holiday CRUD server actions including CSV import"
```

---

## Task 5: Balance, compoff, annual reset actions

**Files:**
- Create: `lib/actions/balances.ts`
- Create: `lib/actions/compoff.ts`
- Create: `lib/actions/annual-reset.ts`

- [ ] **Step 1: Create `lib/actions/balances.ts`**

```typescript
'use server'

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  ActionError,
  requireCapability,
  revalidateHR,
  writeAudit,
} from './_helpers'

const BalanceSchema = z.object({
  user_id: z.string().uuid(),
  leave_year: z.number().int(),
  type: z.enum(['wfh', 'leave', 'compoff_wfh', 'compoff_leave']),
  allocated: z.number(),
  used: z.number().optional(),
})

export async function upsertBalance(input: z.infer<typeof BalanceSchema>) {
  const actor = await requireCapability('edit_balance')
  const parsed = BalanceSchema.parse(input)

  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('leave_balances')
    .upsert(parsed, { onConflict: 'user_id,leave_year,type' })
    .select()
    .single()

  if (error) throw new ActionError(error.message)
  await writeAudit(actor.id, 'balance.upsert', 'leave_balance', data.id, {
    after: data,
  })
  revalidateHR()
  return data
}
```

- [ ] **Step 2: Create `lib/actions/compoff.ts`**

```typescript
'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  ActionError,
  requireCapability,
  revalidateHR,
  writeAudit,
} from './_helpers'

export async function decideCompoff(
  grantId: string,
  decision: 'approved' | 'rejected'
) {
  const adminClient = createAdminClient()
  const { data: grant } = await adminClient
    .from('compoff_grants')
    .select('*')
    .eq('id', grantId)
    .single()

  if (!grant) throw new ActionError('Compoff grant not found')

  const actor = await requireCapability('approve_compoff', grant.user_id)

  const { data: after, error } = await adminClient
    .from('compoff_grants')
    .update({
      status: decision,
      decided_at: new Date().toISOString(),
      decided_by: actor.id,
    })
    .eq('id', grantId)
    .select()
    .single()

  if (error) throw new ActionError(error.message)

  await writeAudit(actor.id, `compoff.${decision}`, 'compoff_grant', grantId, {
    before: grant,
    after,
  })
  revalidateHR()
  return after
}
```

- [ ] **Step 3: Create `lib/actions/annual-reset.ts`**

```typescript
'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  ActionError,
  requireCapability,
  revalidateHR,
  writeAudit,
} from './_helpers'

const ANNUAL_DEFAULTS = {
  leave: 18,
  wfh: 36,
}

export async function runAnnualReset(leaveYear: number) {
  const actor = await requireCapability('run_annual_reset')
  const adminClient = createAdminClient()

  // Idempotency check
  const { data: existing } = await adminClient
    .from('leave_year_resets')
    .select('id')
    .eq('leave_year', leaveYear)
    .maybeSingle()

  if (existing) {
    throw new ActionError(`Annual reset for ${leaveYear} already ran`)
  }

  // Get all active users
  const { data: users } = await adminClient
    .from('users')
    .select('id')
    .eq('status', 'active')

  if (!users || users.length === 0) {
    throw new ActionError('No active users to reset')
  }

  const rows = users.flatMap((u) => [
    {
      user_id: u.id,
      leave_year: leaveYear,
      type: 'leave' as const,
      allocated: ANNUAL_DEFAULTS.leave,
      used: 0,
    },
    {
      user_id: u.id,
      leave_year: leaveYear,
      type: 'wfh' as const,
      allocated: ANNUAL_DEFAULTS.wfh,
      used: 0,
    },
  ])

  const { error } = await adminClient
    .from('leave_balances')
    .upsert(rows, { onConflict: 'user_id,leave_year,type' })

  if (error) throw new ActionError(error.message)

  await adminClient.from('leave_year_resets').insert({
    leave_year: leaveYear,
    triggered_by: actor.id,
  })

  await writeAudit(actor.id, 'annual_reset.run', 'leave_year_reset', String(leaveYear), {
    after: { leave_year: leaveYear, users: users.length },
  })
  revalidateHR()
  return { resetCount: users.length }
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/actions/balances.ts lib/actions/compoff.ts lib/actions/annual-reset.ts
git commit -m "feat: add balance upsert, compoff decide, and annual reset server actions"
```

---

## Task 6: Server queries

**Files:**
- Create: `lib/queries/users.ts`
- Create: `lib/queries/teams.ts`
- Create: `lib/queries/holidays.ts`
- Create: `lib/queries/balances.ts`
- Create: `lib/queries/compoff.ts`

- [ ] **Step 1: Create `lib/queries/users.ts`**

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import type { Tables } from '@/lib/supabase/database.types'

export type UserWithMembership = Tables<'users'> & {
  memberships: { team_id: string; is_primary: boolean }[]
}

export async function listUsers(): Promise<UserWithMembership[]> {
  const adminClient = createAdminClient()
  const { data: users } = await adminClient
    .from('users')
    .select('*')
    .order('full_name', { ascending: true })

  if (!users) return []

  const { data: memberships } = await adminClient
    .from('team_members')
    .select('user_id, team_id, is_primary')
    .is('left_at', null)

  const byUser = new Map<string, { team_id: string; is_primary: boolean }[]>()
  for (const m of memberships ?? []) {
    if (!byUser.has(m.user_id)) byUser.set(m.user_id, [])
    byUser.get(m.user_id)!.push({ team_id: m.team_id, is_primary: m.is_primary })
  }

  return users.map((u) => ({ ...u, memberships: byUser.get(u.id) ?? [] }))
}
```

- [ ] **Step 2: Create `lib/queries/teams.ts`**

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import type { Tables } from '@/lib/supabase/database.types'

export type TeamWithMembers = Tables<'teams'> & {
  member_count: number
  team_lead_name: string | null
}

export async function listTeams(): Promise<TeamWithMembers[]> {
  const adminClient = createAdminClient()
  const { data: teams } = await adminClient
    .from('teams')
    .select('*')
    .order('name', { ascending: true })

  if (!teams) return []

  const { data: members } = await adminClient
    .from('team_members')
    .select('team_id')
    .is('left_at', null)

  const counts = new Map<string, number>()
  for (const m of members ?? []) {
    counts.set(m.team_id, (counts.get(m.team_id) ?? 0) + 1)
  }

  const leadIds = teams.map((t) => t.team_lead_id).filter(Boolean) as string[]
  const { data: leads } = leadIds.length
    ? await adminClient.from('users').select('id, full_name').in('id', leadIds)
    : { data: [] }
  const leadMap = new Map((leads ?? []).map((l) => [l.id, l.full_name]))

  return teams.map((t) => ({
    ...t,
    member_count: counts.get(t.id) ?? 0,
    team_lead_name: t.team_lead_id ? leadMap.get(t.team_lead_id) ?? null : null,
  }))
}
```

- [ ] **Step 3: Create `lib/queries/holidays.ts`**

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import type { Tables } from '@/lib/supabase/database.types'

export async function listHolidays(): Promise<Tables<'holidays'>[]> {
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('holidays')
    .select('*')
    .order('date', { ascending: true })
  return data ?? []
}
```

- [ ] **Step 4: Create `lib/queries/balances.ts`**

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import type { Tables } from '@/lib/supabase/database.types'

export async function listBalancesForYear(
  leaveYear: number
): Promise<Tables<'leave_balances'>[]> {
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('leave_balances')
    .select('*')
    .eq('leave_year', leaveYear)
  return data ?? []
}

export async function listCompoffBalances(): Promise<Tables<'leave_balances'>[]> {
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('leave_balances')
    .select('*')
    .eq('leave_year', 0)
  return data ?? []
}
```

- [ ] **Step 5: Create `lib/queries/compoff.ts`**

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import type { Tables } from '@/lib/supabase/database.types'

export async function listCompoffGrants(): Promise<Tables<'compoff_grants'>[]> {
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('compoff_grants')
    .select('*')
    .order('created_at', { ascending: false })
  return data ?? []
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/queries/
git commit -m "feat: add server-side query functions for users, teams, holidays, balances, compoff"
```

---

## Task 7: Refactor HR Console page to server component

**Files:**
- Modify: `app/(app)/hr/page.tsx`

The existing HR Console page is a client component. We need to convert it to a server component that fetches all data, then passes to client tab components.

- [ ] **Step 1: Read existing `app/(app)/hr/page.tsx`**

Read the file completely to understand the existing tab structure (subtabs, navigation, etc).

- [ ] **Step 2: Replace `app/(app)/hr/page.tsx`** with server component:

```tsx
import { listUsers } from '@/lib/queries/users'
import { listTeams } from '@/lib/queries/teams'
import { listHolidays } from '@/lib/queries/holidays'
import { listBalancesForYear, listCompoffBalances } from '@/lib/queries/balances'
import { listCompoffGrants } from '@/lib/queries/compoff'
import { HRConsoleClient } from '@/components/hr/hr-console-client'

const CURRENT_LEAVE_YEAR = 2026

export default async function HRConsolePage() {
  const [users, teams, holidays, balances, compoffBalances, grants] =
    await Promise.all([
      listUsers(),
      listTeams(),
      listHolidays(),
      listBalancesForYear(CURRENT_LEAVE_YEAR),
      listCompoffBalances(),
      listCompoffGrants(),
    ])

  return (
    <HRConsoleClient
      users={users}
      teams={teams}
      holidays={holidays}
      balances={balances}
      compoffBalances={compoffBalances}
      grants={grants}
      leaveYear={CURRENT_LEAVE_YEAR}
    />
  )
}
```

- [ ] **Step 3: Create `components/hr/hr-console-client.tsx`** with the existing tab UI shell, importing the new tab components (created in next tasks). Maintain tabs: Users, Teams, Holidays, Balances, Compoff, Annual Reset.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/hr/page.tsx" components/hr/hr-console-client.tsx
git commit -m "feat: convert HR Console to server component with real Supabase data"
```

---

## Task 8: Users tab with create/edit/deactivate

**Files:**
- Create: `components/hr/users-tab.tsx`
- Create: `components/hr/user-form-dialog.tsx`

Build a table-based UI showing all users with columns: Name, Email, Role, Manager, Designation, Status, Actions. Top-right "Add User" button. Each row has Edit + Deactivate buttons (or Reactivate if exited). All buttons trigger dialogs that call server actions via `useTransition`. Show toasts on success/error using existing `pushToast` from store.

The form dialog uses react-hook-form + zod, with fields for: full_name, email, password (only on create), role (select), manager_id (combobox of users), designation, primary_team_id (combobox of teams), joined_at (date).

- [ ] **Step 1: Build the dialog component**

Use shadcn `Dialog`, `Form`, `Input`, `Select`. Wire submit to `createUser` or `updateUser`. On success, call `onClose()` and `pushToast({ title: 'Saved', variant: 'success' })`.

- [ ] **Step 2: Build the table component**

Use existing table primitives in the codebase. Wire each row action to the corresponding server action via `useTransition`.

- [ ] **Step 3: Commit**

```bash
git add components/hr/users-tab.tsx components/hr/user-form-dialog.tsx
git commit -m "feat: HR Console Users tab with real CRUD"
```

---

## Task 9: Teams tab (NEW)

**Files:**
- Create: `components/hr/teams-tab.tsx`
- Create: `components/hr/team-form-dialog.tsx`
- Create: `components/hr/team-members-dialog.tsx`

Build a table showing all teams: Name, WFO Pattern, Team Lead, Members, Actions. Top-right "Add Team" button. Each row has Edit, Manage Members, and Delete (disabled if member_count > 0).

The form dialog allows setting name, wfo_pattern (multi-select day chips), team_lead_id (combobox of users).

The Members dialog shows current members with primary toggle and Remove button, plus an "Add Member" select.

- [ ] **Step 1: Build form + members dialogs**
- [ ] **Step 2: Build the table**
- [ ] **Step 3: Commit**

```bash
git add components/hr/teams-tab.tsx components/hr/team-form-dialog.tsx components/hr/team-members-dialog.tsx
git commit -m "feat: HR Console Teams tab (new) with real CRUD"
```

---

## Task 10: Holidays tab

**Files:**
- Create: `components/hr/holidays-tab.tsx`
- Create: `components/hr/holiday-form-dialog.tsx`
- Create: `components/hr/holiday-csv-import.tsx`

Build a table: Date, Name, Actions (Edit, Delete). Top-right: "Add Holiday" + "Import CSV". CSV import accepts a file with header `date,name` and pastes a preview before submit.

- [ ] **Step 1: Build form dialog and CSV import dialog**
- [ ] **Step 2: Build the table**
- [ ] **Step 3: Commit**

```bash
git add components/hr/holidays-tab.tsx components/hr/holiday-form-dialog.tsx components/hr/holiday-csv-import.tsx
git commit -m "feat: HR Console Holidays tab with real CRUD and CSV import"
```

---

## Task 11: Balances, Compoff, Annual Reset tabs (real data)

**Files:**
- Create: `components/hr/balances-tab.tsx`
- Create: `components/hr/compoff-tab.tsx`
- Create: `components/hr/annual-reset-tab.tsx`

These tabs already have UI in the existing HR Console — we're creating clean components that take real data as props and call real server actions.

**Balances tab:** Table with rows for each user × leave type. Inline edit allocated. Save button triggers `upsertBalance`.

**Compoff tab:** Table of pending grants. Approve/Reject buttons trigger `decideCompoff`.

**Annual Reset tab:** Year selector + big "Run Annual Reset" button. Confirms via dialog. Triggers `runAnnualReset`.

- [ ] **Step 1: Build all three tabs**
- [ ] **Step 2: Commit**

```bash
git add components/hr/balances-tab.tsx components/hr/compoff-tab.tsx components/hr/annual-reset-tab.tsx
git commit -m "feat: HR Console Balances/Compoff/AnnualReset tabs wired to real DB"
```

---

## Task 12: Wire tabs into HR Console client + verify

**Files:**
- Modify: `components/hr/hr-console-client.tsx`

Wire all 6 tabs: Users, Teams, Holidays, Balances, Compoff, Annual Reset. Tabs match the existing visual style.

- [ ] **Step 1: Update HRConsoleClient to render all 6 tabs**
- [ ] **Step 2: Verify TypeScript compiles**
```bash
npx tsc --noEmit
```
- [ ] **Step 3: Start dev server, navigate to /hr, click each tab**
- [ ] **Step 4: Test create/edit/delete flows for each entity**
- [ ] **Step 5: Verify bootstrap state advances correctly:**
  - After adding first HR user: state → `awaiting_first_team`
  - After creating first team: state → `operational`
- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: complete Phase 2A+2B - data layer and HR Console real CRUD"
```

---

## Self-Review

**Spec coverage:**
- ✅ All HR Console tabs (Users, Teams, Holidays, Balances, Compoff, Annual Reset)
- ✅ Server actions with capability checks and audit logging
- ✅ Bootstrap state advancement (awaiting_first_hr → awaiting_first_team → operational)
- ✅ Holiday CSV import (per addendum §17.7)
- ✅ Email sync when HR updates user email

**Deferred to Phase 2C+:**
- Dashboard real data
- My Leaves real CRUD (employees creating their own leaves)
- Compoff request flow (employees submitting compoff)
- Calendar real data
- Org chart real data
- Audit Log page real data
- Permissions UI
- Notifications (Realtime)
- CSV bulk import for users (only holidays in this slice)

---
