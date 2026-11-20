import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

type AdminClient = SupabaseClient<Database>

/**
 * Single source of truth for "who handles this person's request".
 *
 * Model (decided 2026-06, see docs/MAINTENANCE_NOTES.md):
 *  - Founders → auto-approved (no approver).
 *  - Everyone else → their MANAGER is the sole approver.
 *  - Non-founder with no manager (misconfiguration) → HR/Founders as a safety net.
 *  - Team leads are informed (FYI) but do NOT approve unless they are the manager.
 *  - HR/Founder may override a manager's pending request (handled at the action,
 *    with a confirm prompt in the UI).
 */
export type LeaveApprovalRouting = {
  /** Founder requests are auto-approved (active immediately). */
  autoApprove: boolean
  /** Who must approve a pending request (manager, or HR/Founders as fallback). */
  approverIds: string[]
  /** Team leads to notify for awareness only (excludes approvers and self). */
  fyiLeadIds: string[]
}

/** Leads of every team the user is an active member of. */
async function teamLeadsForUser(admin: AdminClient, userId: string): Promise<string[]> {
  const { data: memberships } = await admin
    .from('team_members')
    .select('team_id')
    .eq('user_id', userId)
    .is('left_at', null)

  const teamIds = Array.from(new Set((memberships ?? []).map((m) => m.team_id)))
  if (teamIds.length === 0) return []

  const { data: teams } = await admin.from('teams').select('team_lead_id').in('id', teamIds)
  return Array.from(
    new Set((teams ?? []).map((t) => t.team_lead_id).filter((id): id is string => Boolean(id)))
  )
}

/** Active HR + Founder user ids (excluding the given user). */
async function hrAndFounderIds(admin: AdminClient, excludeId: string): Promise<string[]> {
  const { data } = await admin
    .from('users')
    .select('id')
    .in('role', ['hr', 'founder'] as unknown as ('hr' | 'founder')[])
    .eq('status', 'active')
  return (data ?? []).map((u) => u.id).filter((id) => id !== excludeId)
}

export async function resolveLeaveApprovalRouting(
  admin: AdminClient,
  user: { id: string; role: string; manager_id: string | null }
): Promise<LeaveApprovalRouting> {
  const leads = (await teamLeadsForUser(admin, user.id)).filter((id) => id !== user.id)

  if (user.role === 'founder') {
    return { autoApprove: true, approverIds: [], fyiLeadIds: leads }
  }

  const approverIds =
    user.manager_id && user.manager_id !== user.id
      ? [user.manager_id]
      : await hrAndFounderIds(admin, user.id) // safety net for missing manager

  const approverSet = new Set(approverIds)
  return {
    autoApprove: false,
    approverIds,
    fyiLeadIds: leads.filter((id) => !approverSet.has(id)),
  }
}

/**
 * People to notify that `userId` will be away once their request is active:
 * their direct reports (manager_id = userId) ∪ members of teams they lead.
 */
export async function downstreamAudienceForUser(
  admin: AdminClient,
  userId: string
): Promise<string[]> {
  const [{ data: reports }, { data: ledTeams }] = await Promise.all([
    admin.from('users').select('id').eq('manager_id', userId).eq('status', 'active'),
    admin.from('teams').select('id').eq('team_lead_id', userId),
  ])

  const ids = new Set<string>((reports ?? []).map((r) => r.id))
  const ledTeamIds = (ledTeams ?? []).map((t) => t.id)
  if (ledTeamIds.length > 0) {
    const { data: members } = await admin
      .from('team_members')
      .select('user_id')
      .in('team_id', ledTeamIds)
      .is('left_at', null)
    for (const m of members ?? []) ids.add(m.user_id)
  }
  ids.delete(userId)
  return Array.from(ids)
}

/** Users a reviewer manages directly (manager_id = reviewer) — the approval queue scope. */
export async function managedUserIds(admin: AdminClient, managerId: string): Promise<string[]> {
  const { data } = await admin
    .from('users')
    .select('id')
    .eq('manager_id', managerId)
    .eq('status', 'active')
  return (data ?? []).map((u) => u.id).filter((id) => id !== managerId)
}
