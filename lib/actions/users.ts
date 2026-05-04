'use server'

import { ActionError } from './errors'

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { seedDefaultBalances } from '@/lib/db/seed-balances'
import {
  requireCapability,
  revalidateHR,
  writeAudit,
} from './_helpers'

const CURRENT_LEAVE_YEAR = 2026

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

  const { data: authData, error: authError } =
    await adminClient.auth.admin.createUser({
      email: parsed.email,
      password: parsed.password,
      email_confirm: true,
    })

  if (authError || !authData.user) {
    throw new ActionError(authError?.message ?? 'Auth create failed')
  }

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

  await adminClient.rpc('recompute_role_bundles', {
    p_user_id: userRow.id,
    p_new_role: parsed.role,
  })

  // Seed pro-rated leave balances based on join date
  await seedDefaultBalances(
    adminClient,
    userRow.id,
    CURRENT_LEAVE_YEAR,
    userRow.joined_at
  )

  if (parsed.primary_team_id) {
    await adminClient.from('team_members').insert({
      user_id: userRow.id,
      team_id: parsed.primary_team_id,
      is_primary: true,
    })
  }

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

  await revalidateHR()
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

  if (parsed.email && parsed.email !== before.email) {
    await adminClient.auth.admin.updateUserById(id, { email: parsed.email })
  }

  if (parsed.role && parsed.role !== before.role) {
    await adminClient.rpc('recompute_role_bundles', {
      p_user_id: id,
      p_new_role: parsed.role,
    })
  }

  await writeAudit(actor.id, 'user.update', 'user', id, { before, after })
  await revalidateHR()
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
  await revalidateHR()
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
  await revalidateHR()
}
