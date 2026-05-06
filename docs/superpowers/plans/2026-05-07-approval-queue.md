# Approval Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the row-per-leave HR approval table with a shared `<ApprovalQueue>` that groups multi-day requests into one card and shows the team's roster for the requested days. Used by both HR Console and Dashboard.

**Architecture:** New `lib/queries/leave-requests.ts` returns `LeaveRequestWithDays[]` (one row per request, days nested). New `components/approvals/` houses a server `<ApprovalQueue>` that fetches pending requests + per-day conflict counts eagerly, plus a client `<ApprovalCard>` that lazy-loads the team roster on expand. Existing `approveLeave` / `rejectLeave` actions already approve grouped requests atomically (via `request_id`), so no action changes.

**Tech Stack:** Next.js 14 App Router · TypeScript · Supabase admin client · Tailwind · Radix UI · existing `lib/store` toast pattern.

**Verification model:** This codebase has no test framework. Each task verifies via `npm run typecheck`, `npm run lint`, and (where stated) a manual browser walk-through on `npm run dev`.

---

## File Structure

**Create:**
- `lib/queries/leave-requests.ts` — query layer (3 functions)
- `lib/actions/approvals.ts` — server action wrapper for lazy roster fetch
- `components/approvals/approval-queue.tsx` — server component (mount point)
- `components/approvals/approval-queue-client.tsx` — client wrapper holding queue state
- `components/approvals/approval-card.tsx` — condensed card
- `components/approvals/approval-card-expanded.tsx` — expanded panel + roster
- `components/approvals/team-roster-grid.tsx` — people-rows × days-columns grid
- `components/approvals/conflict-pill.tsx` — "⚠ N teammate(s) also out" inline warning
- `components/approvals/request-history-table.tsx` — collapsible history below the queue
- `components/approvals/leave-request-types.ts` — shared TS types

**Modify:**
- `components/hr/all-leaves-tab.tsx` — replace pending list with `<ApprovalQueue scope="hr">` + history table; keep search & Backdate Leave header
- `components/hr/hr-console-client.tsx` — pass current user role/id through to `AllLeavesTab` if not already
- `components/dashboard/dashboard-client.tsx` — replace `PendingLeaveApprovalsCard` with `<ApprovalQueue>` mount; delete old grouping helper
- `app/(app)/hr/page.tsx` — fetch reviewer/scope data, pass to console
- `app/(app)/page.tsx` — pass current user info needed by `<ApprovalQueue>` if not already available

---

## Task 1: Shared types file

**Files:**
- Create: `components/approvals/leave-request-types.ts`

- [ ] **Step 1: Create the types module**

```ts
// components/approvals/leave-request-types.ts
import type { Tables } from '@/lib/supabase/database.types'

export type LeaveDayType = 'wfh' | 'leave' | 'compoff_wfh' | 'compoff_leave'
export type LeaveRequestStatus = Tables<'leave_requests'>['status']

export type LeaveRequestDay = {
  leave_id: string
  date: string                  // YYYY-MM-DD
  type: LeaveDayType
  days_deducted: number
  half_day_position: 'first_half' | 'second_half' | null
}

export type LeaveRequestSummary = {
  leave_days: number            // sum of days_deducted for {leave, compoff_leave}
  wfh_days: number              // sum for {wfh, compoff_wfh}
  start_date: string
  end_date: string
}

export type LeaveRequestConflict = {
  date: string
  teammate_count: number        // distinct other teammates with active|pending leave/wfh covering this date
}

export type LeaveRequestWithDays = {
  id: string                    // leave_requests.id, or `legacy:<leave_id>` for ungrouped legacy rows
  user_id: string
  user_full_name: string
  user_team_id: string | null
  user_team_name: string | null
  status: LeaveRequestStatus
  reason: string | null
  created_at: string
  decided_at: string | null
  days: LeaveRequestDay[]
  summary: LeaveRequestSummary
  conflicts: LeaveRequestConflict[]
  /** ID to pass to approveLeave/rejectLeave. For grouped requests, any leave_id works (action follows request_id). */
  decision_leave_id: string
}

export type RosterCellType = LeaveDayType | 'holiday'

export type RosterCell = {
  user_id: string
  user_full_name: string
  date: string                  // YYYY-MM-DD
  type: RosterCellType
  half_day_position: 'first_half' | 'second_half' | null
}

export type ApprovalQueueScope = 'hr' | 'team'
```

- [ ] **Step 2: Type-check**

Run: `npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add components/approvals/leave-request-types.ts
git commit -m "feat(approvals): add shared leave-request types"
```

---

## Task 2: Query — `listPendingApprovalsForReviewer`

**Files:**
- Create: `lib/queries/leave-requests.ts`

- [ ] **Step 1: Stub out the query module**

```ts
// lib/queries/leave-requests.ts
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  LeaveRequestWithDays,
  LeaveRequestDay,
  LeaveRequestConflict,
  ApprovalQueueScope,
  RosterCell,
} from '@/components/approvals/leave-request-types'

const ACTIVE_STATUSES = ['active', 'pending', 'delete_requested'] as const
```

- [ ] **Step 2: Add `listPendingApprovalsForReviewer`**

```ts
export async function listPendingApprovalsForReviewer(
  reviewerUserId: string,
  scope: ApprovalQueueScope
): Promise<LeaveRequestWithDays[]> {
  const adminClient = createAdminClient()

  // Step A: figure out which user_ids are visible to this reviewer
  let visibleUserIds: string[] | null = null   // null = all users (HR scope)
  if (scope === 'team') {
    const { data: ledTeams } = await adminClient
      .from('teams')
      .select('id')
      .eq('team_lead_id', reviewerUserId)
    const teamIds = (ledTeams ?? []).map((t) => t.id)

    const { data: members } = teamIds.length
      ? await adminClient
          .from('team_members')
          .select('user_id')
          .in('team_id', teamIds)
          .is('left_at', null)
      : { data: [] as { user_id: string }[] }

    const { data: directReports } = await adminClient
      .from('users')
      .select('id')
      .eq('manager_id', reviewerUserId)

    const ids = new Set<string>()
    for (const m of members ?? []) ids.add(m.user_id)
    for (const u of directReports ?? []) ids.add(u.id)
    ids.delete(reviewerUserId) // never approve own
    visibleUserIds = Array.from(ids)
    if (visibleUserIds.length === 0) return []
  }

  // Step B: pull pending leaves (grouped + legacy)
  let leavesQuery = adminClient
    .from('leaves')
    .select('id, request_id, user_id, type, start_date, end_date, days_deducted, half_day_position, status, reason, created_at')
    .in('status', ['pending', 'delete_requested'])
    .order('start_date', { ascending: true })
  if (visibleUserIds) leavesQuery = leavesQuery.in('user_id', visibleUserIds)

  const { data: leaves } = await leavesQuery
  if (!leaves || leaves.length === 0) return []

  // Step C: fetch parent requests for grouped rows
  const requestIds = Array.from(
    new Set(leaves.map((l) => l.request_id).filter((id): id is string => !!id))
  )
  const { data: requests } = requestIds.length
    ? await adminClient
        .from('leave_requests')
        .select('id, user_id, status, reason, created_at, decided_at')
        .in('id', requestIds)
    : { data: [] as Array<{
        id: string
        user_id: string
        status: LeaveRequestWithDays['status']
        reason: string | null
        created_at: string
        decided_at: string | null
      }> }
  const requestById = new Map((requests ?? []).map((r) => [r.id, r]))

  // Step D: applicant info (name + primary team)
  const applicantIds = Array.from(new Set(leaves.map((l) => l.user_id)))
  const { data: users } = await adminClient
    .from('users')
    .select('id, full_name')
    .in('id', applicantIds)
  const userNameById = new Map((users ?? []).map((u) => [u.id, u.full_name]))

  const { data: primaryMemberships } = await adminClient
    .from('team_members')
    .select('user_id, team_id, is_primary, teams:team_id(id, name)')
    .in('user_id', applicantIds)
    .is('left_at', null)
    .order('is_primary', { ascending: false })
  const teamByUser = new Map<string, { id: string; name: string } | null>()
  for (const m of primaryMemberships ?? []) {
    if (teamByUser.has(m.user_id)) continue
    const team = (m as unknown as { teams: { id: string; name: string } | null }).teams
    teamByUser.set(m.user_id, team ? { id: team.id, name: team.name } : null)
  }

  // Step E: bucket leaves by request_id (or per-leave for legacy)
  const buckets = new Map<string, typeof leaves>()
  for (const l of leaves) {
    const key = l.request_id ?? `legacy:${l.id}`
    const arr = buckets.get(key) ?? []
    arr.push(l)
    buckets.set(key, arr)
  }

  // Step F: compute conflicts in one batch query
  const allDates = Array.from(new Set(leaves.map((l) => l.start_date)))
  const minDate = allDates.reduce((a, b) => (a < b ? a : b))
  const maxDate = allDates.reduce((a, b) => (a > b ? a : b))
  const { data: teammateLeaves } = await adminClient
    .from('leaves')
    .select('user_id, start_date, end_date')
    .in('status', ACTIVE_STATUSES as unknown as string[])
    .lte('start_date', maxDate)
    .gte('end_date', minDate)

  // Step G: assemble LeaveRequestWithDays[]
  const result: LeaveRequestWithDays[] = []
  for (const [key, group] of buckets) {
    const first = group[0]
    const team = teamByUser.get(first.user_id) ?? null
    const parent = first.request_id ? requestById.get(first.request_id) : null

    const days: LeaveRequestDay[] = group.map((l) => ({
      leave_id: l.id,
      date: l.start_date,
      type: l.type as LeaveRequestDay['type'],
      days_deducted: Number(l.days_deducted ?? 0),
      half_day_position: l.half_day_position as LeaveRequestDay['half_day_position'],
    }))
    days.sort((a, b) => a.date.localeCompare(b.date))

    const leaveDays = days
      .filter((d) => d.type === 'leave' || d.type === 'compoff_leave')
      .reduce((s, d) => s + d.days_deducted, 0)
    const wfhDays = days
      .filter((d) => d.type === 'wfh' || d.type === 'compoff_wfh')
      .reduce((s, d) => s + d.days_deducted, 0)

    const conflicts: LeaveRequestConflict[] = []
    for (const d of days) {
      const overlap = (teammateLeaves ?? []).filter(
        (t) =>
          t.user_id !== first.user_id &&
          (team === null || true) && // team filter applied below for HR scope too
          t.start_date <= d.date &&
          t.end_date >= d.date
      )
      // Restrict to applicant's primary team members when team is known
      const filtered = team
        ? overlap.filter((t) =>
            (primaryMemberships ?? []).some(
              (pm) => pm.user_id === t.user_id && pm.team_id === team.id
            )
          )
        : overlap
      if (filtered.length > 0) {
        conflicts.push({ date: d.date, teammate_count: filtered.length })
      }
    }

    result.push({
      id: key,
      user_id: first.user_id,
      user_full_name: userNameById.get(first.user_id) ?? 'Unknown',
      user_team_id: team?.id ?? null,
      user_team_name: team?.name ?? null,
      status: (parent?.status ?? first.status) as LeaveRequestWithDays['status'],
      reason: parent?.reason ?? first.reason ?? null,
      created_at: parent?.created_at ?? first.created_at,
      decided_at: parent?.decided_at ?? null,
      days,
      summary: {
        leave_days: leaveDays,
        wfh_days: wfhDays,
        start_date: days[0].date,
        end_date: days[days.length - 1].date,
      },
      conflicts,
      decision_leave_id: first.id,
    })
  }

  result.sort((a, b) => a.created_at.localeCompare(b.created_at))
  return result
}
```

- [ ] **Step 3: Type-check**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/queries/leave-requests.ts
git commit -m "feat(approvals): add listPendingApprovalsForReviewer query"
```

---

## Task 3: Query — `listRosterContext`

**Files:**
- Modify: `lib/queries/leave-requests.ts`

- [ ] **Step 1: Append `listRosterContext`**

```ts
export async function listRosterContext(
  teamId: string,
  startDate: string,
  endDate: string
): Promise<RosterCell[]> {
  const adminClient = createAdminClient()

  const { data: members } = await adminClient
    .from('team_members')
    .select('user_id, users:user_id(id, full_name)')
    .eq('team_id', teamId)
    .is('left_at', null)
  const memberIds = (members ?? []).map((m) => m.user_id)
  const memberNameById = new Map(
    (members ?? []).map((m) => {
      const u = (m as unknown as { users: { id: string; full_name: string } | null }).users
      return [m.user_id, u?.full_name ?? 'Unknown']
    })
  )
  if (memberIds.length === 0) return []

  const { data: leaves } = await adminClient
    .from('leaves')
    .select('user_id, start_date, end_date, type, half_day_position')
    .in('user_id', memberIds)
    .in('status', ACTIVE_STATUSES as unknown as string[])
    .lte('start_date', endDate)
    .gte('end_date', startDate)

  const { data: holidays } = await adminClient
    .from('holidays')
    .select('date, name')
    .gte('date', startDate)
    .lte('date', endDate)

  const cells: RosterCell[] = []

  for (const l of leaves ?? []) {
    // expand multi-day legacy leaves into per-day cells
    let cursor = l.start_date
    while (cursor <= l.end_date) {
      cells.push({
        user_id: l.user_id,
        user_full_name: memberNameById.get(l.user_id) ?? 'Unknown',
        date: cursor,
        type: l.type as RosterCell['type'],
        half_day_position: (l.half_day_position ?? null) as RosterCell['half_day_position'],
      })
      cursor = addOneDay(cursor)
    }
  }

  // Holidays appear as one cell per member per holiday date — caller renders as a column shade
  for (const h of holidays ?? []) {
    cells.push({
      user_id: '__holiday__',
      user_full_name: h.name,
      date: h.date,
      type: 'holiday',
      half_day_position: null,
    })
  }

  return cells
}

function addOneDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + 1)
  return dt.toISOString().slice(0, 10)
}
```

- [ ] **Step 2: Type-check**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/queries/leave-requests.ts
git commit -m "feat(approvals): add listRosterContext query"
```

---

## Task 4: Query — `listLeaveRequestHistory`

**Files:**
- Modify: `lib/queries/leave-requests.ts`

- [ ] **Step 1: Append history query that delegates to the pending function's grouping logic**

```ts
export async function listLeaveRequestHistory(
  reviewerUserId: string,
  scope: ApprovalQueueScope,
  options?: { limit?: number; statuses?: Array<LeaveRequestWithDays['status']> }
): Promise<LeaveRequestWithDays[]> {
  const adminClient = createAdminClient()
  const statuses = options?.statuses ?? (['active', 'rejected', 'deleted'] as const)
  const limit = options?.limit ?? 100

  // Resolve visible user_ids the same way as the pending query
  let visibleUserIds: string[] | null = null
  if (scope === 'team') {
    const { data: ledTeams } = await adminClient
      .from('teams')
      .select('id')
      .eq('team_lead_id', reviewerUserId)
    const teamIds = (ledTeams ?? []).map((t) => t.id)
    const { data: members } = teamIds.length
      ? await adminClient
          .from('team_members')
          .select('user_id')
          .in('team_id', teamIds)
          .is('left_at', null)
      : { data: [] as { user_id: string }[] }
    const { data: directReports } = await adminClient
      .from('users')
      .select('id')
      .eq('manager_id', reviewerUserId)
    const ids = new Set<string>()
    for (const m of members ?? []) ids.add(m.user_id)
    for (const u of directReports ?? []) ids.add(u.id)
    ids.delete(reviewerUserId)
    visibleUserIds = Array.from(ids)
    if (visibleUserIds.length === 0) return []
  }

  let q = adminClient
    .from('leaves')
    .select('id, request_id, user_id, type, start_date, end_date, days_deducted, half_day_position, status, reason, created_at')
    .in('status', statuses as unknown as string[])
    .order('start_date', { ascending: false })
    .limit(limit * 6) // a request can be up to ~6 days; over-fetch then group
  if (visibleUserIds) q = q.in('user_id', visibleUserIds)

  const { data: leaves } = await q
  if (!leaves || leaves.length === 0) return []

  // Reuse the same grouping shape as listPendingApprovalsForReviewer
  // (without conflicts — history doesn't need them)
  const userIds = Array.from(new Set(leaves.map((l) => l.user_id)))
  const { data: users } = await adminClient
    .from('users')
    .select('id, full_name')
    .in('id', userIds)
  const userNameById = new Map((users ?? []).map((u) => [u.id, u.full_name]))

  const requestIds = Array.from(
    new Set(leaves.map((l) => l.request_id).filter((id): id is string => !!id))
  )
  const { data: parents } = requestIds.length
    ? await adminClient
        .from('leave_requests')
        .select('id, status, reason, created_at, decided_at')
        .in('id', requestIds)
    : { data: [] as Array<{
        id: string
        status: LeaveRequestWithDays['status']
        reason: string | null
        created_at: string
        decided_at: string | null
      }> }
  const parentById = new Map((parents ?? []).map((p) => [p.id, p]))

  const buckets = new Map<string, typeof leaves>()
  for (const l of leaves) {
    const key = l.request_id ?? `legacy:${l.id}`
    const arr = buckets.get(key) ?? []
    arr.push(l)
    buckets.set(key, arr)
  }

  const out: LeaveRequestWithDays[] = []
  for (const [key, group] of buckets) {
    const first = group[0]
    const parent = first.request_id ? parentById.get(first.request_id) : null
    const days: LeaveRequestDay[] = group.map((l) => ({
      leave_id: l.id,
      date: l.start_date,
      type: l.type as LeaveRequestDay['type'],
      days_deducted: Number(l.days_deducted ?? 0),
      half_day_position: l.half_day_position as LeaveRequestDay['half_day_position'],
    }))
    days.sort((a, b) => a.date.localeCompare(b.date))
    const leaveDays = days
      .filter((d) => d.type === 'leave' || d.type === 'compoff_leave')
      .reduce((s, d) => s + d.days_deducted, 0)
    const wfhDays = days
      .filter((d) => d.type === 'wfh' || d.type === 'compoff_wfh')
      .reduce((s, d) => s + d.days_deducted, 0)
    out.push({
      id: key,
      user_id: first.user_id,
      user_full_name: userNameById.get(first.user_id) ?? 'Unknown',
      user_team_id: null,
      user_team_name: null,
      status: (parent?.status ?? first.status) as LeaveRequestWithDays['status'],
      reason: parent?.reason ?? first.reason ?? null,
      created_at: parent?.created_at ?? first.created_at,
      decided_at: parent?.decided_at ?? null,
      days,
      summary: {
        leave_days: leaveDays,
        wfh_days: wfhDays,
        start_date: days[0].date,
        end_date: days[days.length - 1].date,
      },
      conflicts: [],
      decision_leave_id: first.id,
    })
  }

  out.sort((a, b) => b.created_at.localeCompare(a.created_at))
  return out.slice(0, limit)
}
```

- [ ] **Step 2: Type-check**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/queries/leave-requests.ts
git commit -m "feat(approvals): add listLeaveRequestHistory query"
```

---

## Task 5: Server action wrapper for lazy roster fetch

**Files:**
- Create: `lib/actions/approvals.ts`

- [ ] **Step 1: Write the action**

```ts
// lib/actions/approvals.ts
'use server'

import { z } from 'zod'
import { requireUser } from './_helpers'
import { listRosterContext } from '@/lib/queries/leave-requests'
import type { RosterCell } from '@/components/approvals/leave-request-types'

const Schema = z.object({
  team_id: z.string().uuid(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export async function fetchRosterContext(
  input: z.infer<typeof Schema>
): Promise<RosterCell[]> {
  await requireUser()                    // any authed user can call
  const parsed = Schema.parse(input)
  return listRosterContext(parsed.team_id, parsed.start_date, parsed.end_date)
}
```

- [ ] **Step 2: Type-check**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/approvals.ts
git commit -m "feat(approvals): add fetchRosterContext server action"
```

---

## Task 6: `<ConflictPill>` component

**Files:**
- Create: `components/approvals/conflict-pill.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/approvals/conflict-pill.tsx
'use client'

import { format, parseISO } from 'date-fns'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LeaveRequestConflict } from './leave-request-types'

export function ConflictPill({
  conflicts,
  className,
}: {
  conflicts: LeaveRequestConflict[]
  className?: string
}) {
  if (conflicts.length === 0) return null

  // Show a short summary: "1 teammate also out Mon May 12" or "Conflicts on 3 days"
  const text =
    conflicts.length === 1
      ? `${conflicts[0].teammate_count} teammate${
          conflicts[0].teammate_count > 1 ? 's' : ''
        } also out ${format(parseISO(conflicts[0].date), 'EEE MMM d')}`
      : `Conflicts on ${conflicts.length} days`

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900 ring-1 ring-inset ring-amber-200',
        className
      )}
    >
      <AlertTriangle className="h-3 w-3" />
      {text}
    </span>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/approvals/conflict-pill.tsx
git commit -m "feat(approvals): add ConflictPill component"
```

---

## Task 7: `<TeamRosterGrid>` component

**Files:**
- Create: `components/approvals/team-roster-grid.tsx`

- [ ] **Step 1: Write the grid**

```tsx
// components/approvals/team-roster-grid.tsx
'use client'

import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import type { RosterCell, RosterCellType, LeaveRequestDay } from './leave-request-types'

interface Props {
  applicantId: string
  applicantName: string
  applicantDays: LeaveRequestDay[]   // the request itself, used to mark applicant cells with ✱
  rosterCells: RosterCell[]          // teammates + holidays returned by fetchRosterContext
  dateRange: { start: string; end: string }
  wfoPattern?: string                 // e.g. "MON,TUE,WED,THU,FRI,SAT" — defaults to MON-SAT
}

const DAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const

function dayCode(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return DAY_CODES[new Date(y, m - 1, d).getDay()]
}

function expandDates(start: string, end: string): string[] {
  const out: string[] = []
  let cur = start
  while (cur <= end) {
    out.push(cur)
    const [y, m, d] = cur.split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d))
    dt.setUTCDate(dt.getUTCDate() + 1)
    cur = dt.toISOString().slice(0, 10)
  }
  return out
}

function cellLabel(type: RosterCellType, half: 'first_half' | 'second_half' | null): string {
  const base =
    type === 'leave' || type === 'compoff_leave' ? 'L' :
    type === 'wfh' || type === 'compoff_wfh' ? 'W' :
    type === 'holiday' ? 'H' : ''
  return half ? `½${base}` : base
}

function cellClass(type: RosterCellType): string {
  switch (type) {
    case 'leave':
    case 'compoff_leave':
      return 'bg-orange-100 text-orange-800'
    case 'wfh':
    case 'compoff_wfh':
      return 'bg-blue-100 text-blue-800'
    case 'holiday':
      return 'bg-slate-200 text-slate-700'
    default:
      return ''
  }
}

export function TeamRosterGrid({
  applicantId,
  applicantName,
  applicantDays,
  rosterCells,
  dateRange,
  wfoPattern = 'MON,TUE,WED,THU,FRI,SAT',
}: Props) {
  const workDays = useMemo(() => {
    const allowed = new Set(wfoPattern.split(',').map((s) => s.trim().toUpperCase()))
    return expandDates(dateRange.start, dateRange.end).filter((d) => allowed.has(dayCode(d)))
  }, [dateRange.start, dateRange.end, wfoPattern])

  // index roster: user_id -> date -> cell
  const cellByUserDate = useMemo(() => {
    const map = new Map<string, Map<string, RosterCell>>()
    for (const c of rosterCells) {
      if (c.type === 'holiday') continue
      const inner = map.get(c.user_id) ?? new Map()
      inner.set(c.date, c)
      map.set(c.user_id, inner)
    }
    return map
  }, [rosterCells])

  const holidayDates = useMemo(() => {
    const set = new Set<string>()
    for (const c of rosterCells) if (c.type === 'holiday') set.add(c.date)
    return set
  }, [rosterCells])

  const applicantDayByDate = useMemo(() => {
    const map = new Map<string, LeaveRequestDay>()
    for (const d of applicantDays) map.set(d.date, d)
    return map
  }, [applicantDays])

  // member rows: applicant first, others alphabetical
  const otherUserIds = Array.from(cellByUserDate.keys()).filter((id) => id !== applicantId)
  const otherNames = new Map<string, string>()
  for (const c of rosterCells) {
    if (c.user_id !== applicantId && c.type !== 'holiday') {
      otherNames.set(c.user_id, c.user_full_name)
    }
  }
  otherUserIds.sort((a, b) =>
    (otherNames.get(a) ?? '').localeCompare(otherNames.get(b) ?? '')
  )

  const memberIds = [applicantId, ...otherUserIds]

  // bottom summary: count absent per day
  const absentCounts = workDays.map((date) => {
    let count = 0
    if (applicantDayByDate.has(date)) count += 1
    for (const id of otherUserIds) {
      if (cellByUserDate.get(id)?.has(date)) count += 1
    }
    return count
  })
  const totalMembers = memberIds.length
  const redThreshold = Math.max(2, Math.ceil(totalMembers * 0.3))

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="min-w-full text-sm">
        <thead className="bg-muted/40">
          <tr>
            <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-left text-[11px] font-medium text-muted-foreground">
              Member
            </th>
            {workDays.map((d) => (
              <th
                key={d}
                className={cn(
                  'px-2 py-2 text-center text-[11px] font-medium text-muted-foreground',
                  holidayDates.has(d) && 'bg-slate-200/60'
                )}
              >
                <div>{format(parseISO(d), 'EEE')}</div>
                <div>{format(parseISO(d), 'MMM d')}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {memberIds.map((id, idx) => {
            const name =
              id === applicantId ? applicantName : otherNames.get(id) ?? 'Unknown'
            return (
              <tr
                key={id}
                className={cn(
                  'border-t',
                  id === applicantId && 'bg-orange-50/40'
                )}
              >
                <td className="sticky left-0 z-10 bg-card px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Avatar name={name} size="sm" />
                    <span className="text-[12.5px] font-medium">
                      {name}
                      {id === applicantId && <span className="ml-1 text-orange-600">✱</span>}
                    </span>
                  </div>
                </td>
                {workDays.map((d) => {
                  const cell =
                    id === applicantId
                      ? applicantDayByDate.get(d)
                      : cellByUserDate.get(id)?.get(d)
                  const isHoliday = holidayDates.has(d)
                  if (isHoliday && !cell) {
                    return (
                      <td key={d} className="bg-slate-200/60 px-2 py-2 text-center text-[11px] text-slate-600">
                        H
                      </td>
                    )
                  }
                  if (!cell) {
                    return (
                      <td key={d} className="px-2 py-2 text-center text-[11px] text-muted-foreground">
                        —
                      </td>
                    )
                  }
                  const type = ('type' in cell ? cell.type : 'leave') as RosterCellType
                  const half =
                    ('half_day_position' in cell
                      ? cell.half_day_position
                      : null) as 'first_half' | 'second_half' | null
                  return (
                    <td key={d} className="px-2 py-2 text-center">
                      <span
                        className={cn(
                          'inline-flex h-6 min-w-[26px] items-center justify-center rounded px-1 text-[11px] font-semibold',
                          cellClass(type)
                        )}
                      >
                        {cellLabel(type, half)}
                      </span>
                    </td>
                  )
                })}
              </tr>
            )
          })}
          <tr className="border-t-2 bg-muted/30">
            <td className="sticky left-0 z-10 bg-muted/30 px-3 py-2 text-[11px] font-semibold text-muted-foreground">
              Absent
            </td>
            {absentCounts.map((c, i) => (
              <td
                key={workDays[i]}
                className={cn(
                  'px-2 py-2 text-center text-[12px] font-semibold tabular-nums',
                  c >= redThreshold ? 'text-rose-600' : 'text-muted-foreground'
                )}
              >
                {c}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/approvals/team-roster-grid.tsx
git commit -m "feat(approvals): add TeamRosterGrid component"
```

---

## Task 8: `<ApprovalCardExpanded>` (lazy roster + skeleton + error)

**Files:**
- Create: `components/approvals/approval-card-expanded.tsx`

- [ ] **Step 1: Write the expanded panel**

```tsx
// components/approvals/approval-card-expanded.tsx
'use client'

import { useEffect, useState } from 'react'
import { fetchRosterContext } from '@/lib/actions/approvals'
import { TeamRosterGrid } from './team-roster-grid'
import type {
  LeaveRequestWithDays,
  RosterCell,
} from './leave-request-types'

export function ApprovalCardExpanded({ request }: { request: LeaveRequestWithDays }) {
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'ready'; cells: RosterCell[] }
    | { kind: 'error'; message: string }
    | { kind: 'no-team' }
  >(() => (request.user_team_id ? { kind: 'loading' } : { kind: 'no-team' }))

  useEffect(() => {
    let cancelled = false
    if (!request.user_team_id) return
    setState({ kind: 'loading' })
    fetchRosterContext({
      team_id: request.user_team_id,
      start_date: request.summary.start_date,
      end_date: request.summary.end_date,
    })
      .then((cells) => {
        if (!cancelled) setState({ kind: 'ready', cells })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load team context'
          setState({ kind: 'error', message })
        }
      })
    return () => {
      cancelled = true
    }
  }, [request.user_team_id, request.summary.start_date, request.summary.end_date])

  if (state.kind === 'no-team') {
    return (
      <div className="border-t bg-muted/20 p-4 text-[12.5px] text-muted-foreground">
        No team context available for this employee.
      </div>
    )
  }
  if (state.kind === 'loading') {
    return (
      <div className="border-t bg-muted/20 p-4">
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-7 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
    )
  }
  if (state.kind === 'error') {
    return (
      <div className="border-t bg-muted/20 p-4 text-[12.5px] text-rose-600">
        Couldn't load team context — {state.message}.{' '}
        <button
          className="underline"
          onClick={() => setState({ kind: 'loading' })}
        >
          Retry
        </button>
      </div>
    )
  }
  return (
    <div className="border-t bg-muted/20 p-4">
      <TeamRosterGrid
        applicantId={request.user_id}
        applicantName={request.user_full_name}
        applicantDays={request.days}
        rosterCells={state.cells}
        dateRange={{ start: request.summary.start_date, end: request.summary.end_date }}
      />
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/approvals/approval-card-expanded.tsx
git commit -m "feat(approvals): add ApprovalCardExpanded with lazy roster"
```

---

## Task 9: `<ApprovalCard>` (condensed card with optimistic action)

**Files:**
- Create: `components/approvals/approval-card.tsx`

- [ ] **Step 1: Write the card**

```tsx
// components/approvals/approval-card.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { approveLeave, rejectLeave } from '@/lib/actions/leaves'
import { ConflictPill } from './conflict-pill'
import { ApprovalCardExpanded } from './approval-card-expanded'
import type { LeaveRequestWithDays } from './leave-request-types'

function summaryText(req: LeaveRequestWithDays): string {
  const parts: string[] = []
  if (req.summary.leave_days > 0) parts.push(`${formatDays(req.summary.leave_days)} Leave`)
  if (req.summary.wfh_days > 0) parts.push(`${formatDays(req.summary.wfh_days)} WFH`)
  const range =
    req.summary.start_date === req.summary.end_date
      ? format(parseISO(req.summary.start_date), 'MMM d, yyyy')
      : `${format(parseISO(req.summary.start_date), 'MMM d')} – ${format(
          parseISO(req.summary.end_date),
          'MMM d, yyyy'
        )}`
  return `${parts.join(' + ')} · ${range}`
}

function formatDays(n: number): string {
  return Number.isInteger(n) ? n.toFixed(0) : n.toFixed(1)
}

export function ApprovalCard({
  request,
  onDecided,
}: {
  request: LeaveRequestWithDays
  onDecided: (id: string) => void
}) {
  const router = useRouter()
  const { pushToast } = useStore()
  const [expanded, setExpanded] = useState(false)
  const [isPending, startTransition] = useTransition()
  const isDeleteRequest = request.status === 'delete_requested'

  function decide(decision: 'approve' | 'reject') {
    startTransition(async () => {
      try {
        if (decision === 'approve') {
          await approveLeave(request.decision_leave_id)
          pushToast({ title: 'Request approved', variant: 'success' })
        } else {
          await rejectLeave(request.decision_leave_id)
          pushToast({ title: 'Request rejected', variant: 'info' })
        }
        onDecided(request.id)
        router.refresh()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to update request'
        pushToast({ title: 'Error', body: msg, variant: 'error' })
      }
    })
  }

  return (
    <div className="overflow-hidden rounded-lg border border-amber-200 bg-white shadow-sm">
      <div
        className="flex cursor-pointer flex-wrap items-start gap-3 p-4 hover:bg-amber-50/40"
        onClick={() => setExpanded((v) => !v)}
      >
        <Avatar name={request.user_full_name} size="md" />
        <div className="min-w-[200px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold text-foreground">
              {request.user_full_name}
            </span>
            {isDeleteRequest ? (
              <Badge variant="warning">Delete request</Badge>
            ) : (
              <Badge variant="warning">Pending</Badge>
            )}
            {request.user_team_name && (
              <span className="text-[11px] text-muted-foreground">
                · {request.user_team_name}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[12.5px] text-muted-foreground">
            {summaryText(request)}
          </div>
          {request.reason && (
            <div
              className="mt-1 truncate text-[12px] text-muted-foreground"
              title={request.reason}
            >
              "{request.reason}"
            </div>
          )}
          {request.conflicts.length > 0 && (
            <div className="mt-2">
              <ConflictPill conflicts={request.conflicts} />
            </div>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => decide('reject')}
            className="border-rose-200 text-rose-700 hover:bg-rose-50"
          >
            Reject
          </Button>
          <Button size="sm" disabled={isPending} onClick={() => decide('approve')}>
            {isDeleteRequest ? 'Approve Delete' : 'Approve'}
          </Button>
          <button
            type="button"
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted',
            )}
            onClick={(e) => {
              e.stopPropagation()
              setExpanded((v) => !v)
            }}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {expanded && <ApprovalCardExpanded request={request} />}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/approvals/approval-card.tsx
git commit -m "feat(approvals): add ApprovalCard with optimistic actions"
```

---

## Task 10: `<ApprovalQueueClient>` (state holder)

**Files:**
- Create: `components/approvals/approval-queue-client.tsx`

- [ ] **Step 1: Write the client wrapper**

```tsx
// components/approvals/approval-queue-client.tsx
'use client'

import { useMemo, useState } from 'react'
import { ApprovalCard } from './approval-card'
import type { LeaveRequestWithDays } from './leave-request-types'

export function ApprovalQueueClient({
  initialRequests,
}: {
  initialRequests: LeaveRequestWithDays[]
}) {
  const [optimisticallyDecided, setDecided] = useState<Set<string>>(new Set())
  const visible = useMemo(
    () => initialRequests.filter((r) => !optimisticallyDecided.has(r.id)),
    [initialRequests, optimisticallyDecided]
  )

  if (visible.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-[13px] text-muted-foreground">
        All caught up — 0 pending approvals.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="text-[12px] font-medium text-muted-foreground">
        {visible.length} pending request{visible.length !== 1 ? 's' : ''}
      </div>
      {visible.map((req) => (
        <ApprovalCard
          key={req.id}
          request={req}
          onDecided={(id) =>
            setDecided((s) => {
              const next = new Set(s)
              next.add(id)
              return next
            })
          }
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/approvals/approval-queue-client.tsx
git commit -m "feat(approvals): add ApprovalQueueClient wrapper"
```

---

## Task 11: `<ApprovalQueue>` server component

**Files:**
- Create: `components/approvals/approval-queue.tsx`

- [ ] **Step 1: Write the server component**

```tsx
// components/approvals/approval-queue.tsx
import { listPendingApprovalsForReviewer } from '@/lib/queries/leave-requests'
import { ApprovalQueueClient } from './approval-queue-client'
import type { ApprovalQueueScope } from './leave-request-types'

export async function ApprovalQueue({
  reviewerUserId,
  scope,
}: {
  reviewerUserId: string
  scope: ApprovalQueueScope
}) {
  const requests = await listPendingApprovalsForReviewer(reviewerUserId, scope)
  return <ApprovalQueueClient initialRequests={requests} />
}
```

- [ ] **Step 2: Type-check**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/approvals/approval-queue.tsx
git commit -m "feat(approvals): add ApprovalQueue server component"
```

---

## Task 12: `<RequestHistoryTable>` collapsible

**Files:**
- Create: `components/approvals/request-history-table.tsx`

- [ ] **Step 1: Write the collapsible history**

```tsx
// components/approvals/request-history-table.tsx
'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import type { LeaveRequestWithDays, LeaveRequestStatus } from './leave-request-types'

const STATUS_LABEL: Record<LeaveRequestStatus, string> = {
  pending: 'Pending',
  active: 'Approved',
  rejected: 'Rejected',
  deleted: 'Deleted',
  delete_requested: 'Delete Requested',
}

const STATUS_VARIANT: Record<LeaveRequestStatus, 'success' | 'warning' | 'danger' | 'muted'> = {
  pending: 'warning',
  active: 'success',
  rejected: 'danger',
  deleted: 'muted',
  delete_requested: 'warning',
}

export function RequestHistoryTable({
  history,
}: {
  history: LeaveRequestWithDays[]
}) {
  const [open, setOpen] = useState(false)
  const counts = history.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1
      return acc
    },
    {} as Record<string, number>
  )
  const summary = `${counts.active ?? 0} approved · ${counts.rejected ?? 0} rejected · ${counts.deleted ?? 0} deleted`

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/40"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="text-[13px] font-semibold">Past requests</span>
          <span className="text-[12px] text-muted-foreground">· {summary}</span>
        </div>
      </button>
      {open && (
        <Card className="rounded-t-none border-0 border-t">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 text-left text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Employee</th>
                    <th className="px-4 py-2 font-medium">Summary</th>
                    <th className="px-4 py-2 font-medium">Dates</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Decided</th>
                  </tr>
                </thead>
                <tbody>
                  {history.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        No past requests.
                      </td>
                    </tr>
                  ) : (
                    history.map((r) => (
                      <tr key={r.id} className={cn('border-t', r.status === 'deleted' && 'opacity-50')}>
                        <td className="whitespace-nowrap px-4 py-2">
                          <div className="flex items-center gap-2">
                            <Avatar name={r.user_full_name} size="sm" />
                            <span className="font-medium">{r.user_full_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {r.summary.leave_days > 0 && `${r.summary.leave_days} Leave`}
                          {r.summary.leave_days > 0 && r.summary.wfh_days > 0 && ' + '}
                          {r.summary.wfh_days > 0 && `${r.summary.wfh_days} WFH`}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                          {r.summary.start_date === r.summary.end_date
                            ? format(parseISO(r.summary.start_date), 'MMM d, yyyy')
                            : `${format(parseISO(r.summary.start_date), 'MMM d')} – ${format(
                                parseISO(r.summary.end_date),
                                'MMM d, yyyy'
                              )}`}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2">
                          <Badge variant={STATUS_VARIANT[r.status] ?? 'muted'}>
                            {STATUS_LABEL[r.status] ?? r.status}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-[12px] text-muted-foreground">
                          {r.decided_at ? format(parseISO(r.decided_at), 'MMM d, yyyy') : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/approvals/request-history-table.tsx
git commit -m "feat(approvals): add collapsible RequestHistoryTable"
```

---

## Task 13: Wire `<ApprovalQueue>` into HR Console

**Files:**
- Modify: `app/(app)/hr/page.tsx`
- Modify: `components/hr/hr-console-client.tsx`
- Modify: `components/hr/all-leaves-tab.tsx`

- [ ] **Step 1: Update `app/(app)/hr/page.tsx` to fetch history + pass current user**

Current file ends with:
```tsx
listLeavesInRange('2025-06-01', '2027-06-30', { statuses: 'all' }),
```
Replace the file with:

```tsx
import { requireUser } from '@/lib/actions/_helpers'
import { listUsers } from '@/lib/queries/users'
import { listTeams } from '@/lib/queries/teams'
import { listHolidays } from '@/lib/queries/holidays'
import { listBalancesForYear, listCompoffBalances } from '@/lib/queries/balances'
import { listCompoffGrants } from '@/lib/queries/compoff'
import { listLeaveRequestHistory, listPendingApprovalsForReviewer } from '@/lib/queries/leave-requests'
import { HRConsoleClient } from '@/components/hr/hr-console-client'

const CURRENT_LEAVE_YEAR = 2026

export default async function HRConsolePage() {
  const me = await requireUser()
  const [users, teams, holidays, balances, compoffBalances, grants, pendingRequests, history] =
    await Promise.all([
      listUsers(),
      listTeams(),
      listHolidays(),
      listBalancesForYear(CURRENT_LEAVE_YEAR),
      listCompoffBalances(),
      listCompoffGrants(),
      listPendingApprovalsForReviewer(me.id, 'hr'),
      listLeaveRequestHistory(me.id, 'hr', { limit: 200 }),
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
      pendingRequests={pendingRequests}
      history={history}
    />
  )
}
```

- [ ] **Step 2: Update `components/hr/hr-console-client.tsx`**

Find the existing prop interface and the line passing `leaves={props.leaves}` to `<AllLeavesTab>`. Replace the relevant prop block with:

```tsx
// In the Props interface, replace `leaves: LeaveWithUser[]` with:
pendingRequests: LeaveRequestWithDays[]
history: LeaveRequestWithDays[]
```

Add the import at the top:
```tsx
import type { LeaveRequestWithDays } from '@/components/approvals/leave-request-types'
```

Replace the existing call:
```tsx
<AllLeavesTab leaves={props.leaves} users={props.users} />
```
with:
```tsx
<AllLeavesTab
  pendingRequests={props.pendingRequests}
  history={props.history}
  users={props.users}
/>
```

Remove unused `LeaveWithUser` import and the old `leaves` prop.

- [ ] **Step 3: Rewrite `components/hr/all-leaves-tab.tsx` to host `<ApprovalQueue>` + history**

Replace the entire file contents with:

```tsx
'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ApprovalQueueClient } from '@/components/approvals/approval-queue-client'
import { RequestHistoryTable } from '@/components/approvals/request-history-table'
import { BackdateLeaveDialog } from './backdate-leave-dialog'
import type { LeaveRequestWithDays } from '@/components/approvals/leave-request-types'
import type { UserWithMembership } from '@/lib/queries/users'

interface Props {
  pendingRequests: LeaveRequestWithDays[]
  history: LeaveRequestWithDays[]
  users: UserWithMembership[]
}

export function AllLeavesTab({ pendingRequests, history, users }: Props) {
  const [search, setSearch] = useState('')

  const filteredHistory = search.trim()
    ? history.filter((r) => {
        const q = search.toLowerCase()
        return (
          r.user_full_name.toLowerCase().includes(q) ||
          (r.reason ?? '').toLowerCase().includes(q) ||
          r.summary.start_date.includes(q) ||
          r.summary.end_date.includes(q)
        )
      })
    : history

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search history…"
              className="h-9 w-64 rounded-lg border border-border bg-card pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <span className="text-sm text-muted-foreground">
            {pendingRequests.length} pending
          </span>
        </div>
        <BackdateLeaveDialog
          users={users}
          trigger={<Button size="sm">Backdate Leave</Button>}
        />
      </div>

      <ApprovalQueueClient initialRequests={pendingRequests} />

      <RequestHistoryTable history={filteredHistory} />
    </div>
  )
}
```

- [ ] **Step 4: Type-check + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Manual verification**

Start dev server: `npm run dev`
1. Open `/hr` as an HR user. Confirm the All Leaves tab now shows pending request cards (one per request, not per leave row).
2. Click any card → roster grid opens below it within ~1s.
3. Click Approve on a card → toast appears, card disappears, count decrements.
4. Click "Past requests" → history table opens with grouped requests.
5. No console errors.

- [ ] **Step 6: Commit**

```bash
git add app/\(app\)/hr/page.tsx components/hr/hr-console-client.tsx components/hr/all-leaves-tab.tsx
git commit -m "feat(hr): wire ApprovalQueue into HR Console all-leaves tab"
```

---

## Task 14: Wire `<ApprovalQueue>` into Dashboard

**Files:**
- Modify: `lib/queries/dashboard.ts`
- Modify: `app/(app)/page.tsx`
- Modify: `components/dashboard/dashboard-client.tsx`

- [ ] **Step 1: Add `pendingApprovalRequests` to dashboard data**

Open `lib/queries/dashboard.ts`. In the `DashboardData` type, add:
```ts
pendingApprovalRequests: LeaveRequestWithDays[]
```
At the top of the file, import:
```ts
import { listPendingApprovalsForReviewer } from './leave-requests'
import type { LeaveRequestWithDays } from '@/components/approvals/leave-request-types'
```
Inside `getDashboardData`, after the existing pending leave queries, add:
```ts
const scope: 'hr' | 'team' = role === 'hr' || role === 'founder' ? 'hr' : 'team'
const pendingApprovalRequests = await listPendingApprovalsForReviewer(userId, scope)
```
And include `pendingApprovalRequests` in the returned object alongside `pendingLeaveApprovalsForMe`.

(Keep `pendingLeaveApprovalsForMe` for now to avoid breaking other dashboard cards in the same commit — it's removed in step 4.)

- [ ] **Step 2: Type-check**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Replace `PendingLeaveApprovalsCard` with `<ApprovalQueueClient>`**

In `components/dashboard/dashboard-client.tsx`:

1. Remove the `PendingLeaveApprovalsCard` JSX usage (around line 205) and replace with:
```tsx
{data.pendingApprovalRequests.length > 0 && (
  <Card className="border-amber-200 bg-amber-50/50 lg:col-span-2">
    <CardHeader>
      <CardTitle className="text-amber-900">Leave Approvals</CardTitle>
      <Badge variant="warning">{data.pendingApprovalRequests.length}</Badge>
    </CardHeader>
    <CardContent>
      <ApprovalQueueClient initialRequests={data.pendingApprovalRequests} />
    </CardContent>
  </Card>
)}
```
2. Add the import at the top:
```tsx
import { ApprovalQueueClient } from '@/components/approvals/approval-queue-client'
```
3. Delete the entire `PendingLeaveApprovalsCard` function definition (lines ~931–1054).
4. Remove now-unused imports: `approveLeave`, `approveLeaveDeletion`, `rejectLeave`, `rejectLeaveDeletion` (only the imports referenced solely by the deleted card; keep any used elsewhere). Run typecheck after to confirm.

- [ ] **Step 4: Drop unused `pendingLeaveApprovalsForMe` from `DashboardData`**

In `lib/queries/dashboard.ts`:
- Remove the `pendingLeaveApprovalsForMe` field from `DashboardData`.
- Remove the call computing it.
- Remove the related `listPendingLeaves` import if it has no remaining caller.

- [ ] **Step 5: Type-check + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6: Manual verification**

Start dev server: `npm run dev`
1. Log in as a team lead. Confirm the dashboard shows the new ApprovalQueue card.
2. Pending requests render as collapsed cards with conflict pills (when applicable).
3. Click → roster grid opens. Approve removes the card.
4. Log in as a founder. Same flow, but `scope='hr'` (sees org-wide pending).
5. Log in as a regular employee with no approver duties — the card is hidden (length === 0).
6. No console errors.

- [ ] **Step 7: Commit**

```bash
git add lib/queries/dashboard.ts app/\(app\)/page.tsx components/dashboard/dashboard-client.tsx
git commit -m "feat(dashboard): use ApprovalQueue for leave approvals"
```

---

## Task 15: Final integration check

**Files:** none changed.

- [ ] **Step 1: Full repo typecheck and lint**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all three PASS. The build is the most thorough check — fix any errors it surfaces.

- [ ] **Step 2: End-to-end manual walk-through**

Start dev server: `npm run dev`. Walk through these scenarios:

1. **Multi-day mixed request:** Apply for 3 Leave + 2 WFH days as user A. Log in as A's team lead → confirm one card with summary "3 Leave + 2 WFH · …" and a day-strip-equivalent shown on expand. Click Approve → all 5 leave rows in the DB go to status=active.
2. **Conflict pill:** Apply leaves for two teammates on the same day. The newer request should show "⚠ 1 teammate also out …" on the condensed card.
3. **Roster context:** Expand a card → confirm the applicant is row 1 with ✱, other team members below alphabetically, day columns fill the request range, half-days render as ½L / ½W, holidays as a shaded column with H.
4. **Scope split:** Founder dashboard sees all pending requests org-wide; team-lead dashboard sees only their team's. HR Console all-leaves tab matches founder view.
5. **History toggle:** Past requests collapses by default. Open it, confirm rows are grouped per request (one row per multi-day request).
6. **Empty state:** Find or set a state with no pending → "All caught up" copy renders.
7. **Failure path:** Temporarily change `team_id` in the DB to a bogus UUID for one applicant → expand their card → expect "Couldn't load team context" with retry button. Approve/Reject still work.
8. **Legacy single-day leaves:** Find a leave row where `request_id IS NULL` (created before migration 013) and verify it appears in the queue as a single-day card.

- [ ] **Step 3: Cleanup commit if anything was tweaked**

If the walk-through surfaced minor fixes:
```bash
git add -A
git commit -m "fix(approvals): adjustments from end-to-end review"
```

If nothing changed, skip this step.

---

## Self-review notes

**Spec coverage:**
- ✅ Group multi-day requests into one card (Task 2 + Task 9)
- ✅ Team roster grid with applicant pinned + ½ days + holidays (Task 7)
- ✅ Conflict pill on condensed card (Task 6 + Task 9)
- ✅ Lazy roster fetch with skeleton + error retry (Task 8)
- ✅ Whole-request approve/reject (existing actions, wired in Task 9)
- ✅ Both HR Console and Dashboard mount points (Task 13 + Task 14)
- ✅ Collapsible history table (Task 12 + Task 13)
- ✅ Empty state, optimistic UI (Task 10 + Task 9)
- ✅ Legacy ungrouped leaves treated as single-day requests (Task 2)

**Known compromises:**
- No automated tests — codebase has no test framework. Plan substitutes `tsc`, `lint`, `next build`, and a structured manual walk-through. If a test framework is added later, port the verification steps into automated tests.
- The 30%-of-team red threshold is hard-coded in `team-roster-grid.tsx`. Acceptable for MVP; surface as a setting later if needed.
