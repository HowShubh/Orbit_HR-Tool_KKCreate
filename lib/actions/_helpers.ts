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

  if (isFounder || isHR) return user
  if (targetUserId === user.id) return user

  if (isTeamLead && targetUserId) {
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

export async function revalidateHR() {
  revalidatePath('/hr')
}
