'use server'

import { ActionError } from './errors'

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { todayIST } from '@/lib/date'
import {
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
  off_days: WfoSchema,
  team_lead_id: z.string().uuid().nullable().optional(),
})

const UpdateTeamSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  wfo_pattern: WfoSchema.optional(),
  off_days: WfoSchema.optional(),
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
      off_days: parsed.off_days,
      team_lead_id: parsed.team_lead_id ?? null,
    })
    .select()
    .single()

  if (error || !team) throw new ActionError(error?.message ?? 'Create failed')

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
  await revalidateHR()
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
  await revalidateHR()
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
  await revalidateHR()
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
  await revalidateHR()
}

export async function removeTeamMember(membershipId: string) {
  const actor = await requireCapability('manage_users')
  const adminClient = createAdminClient()

  const { error } = await adminClient
    .from('team_members')
    .update({ left_at: todayIST() })
    .eq('id', membershipId)

  if (error) throw new ActionError(error.message)

  await writeAudit(actor.id, 'team_member.remove', 'team_member', membershipId)
  await revalidateHR()
}
