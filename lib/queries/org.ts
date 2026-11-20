import { createAdminClient } from '@/lib/supabase/admin'
import type { Tables } from '@/lib/supabase/database.types'

export type OrgTeamRef = { id: string; name: string; solo: boolean }

export type OrgNode = {
  user: Tables<'users'>
  /** Teams this person is the manager (team_lead) of. */
  ledTeams: OrgTeamRef[]
  /** Teams this person is a member of. */
  memberTeams: OrgTeamRef[]
  reports: OrgNode[]
}

export type OrgTree = {
  /** Top of the org — people with no manager (`manager_id = null`). */
  roots: OrgNode[]
  /**
   * Active people whose `manager_id` points at someone who is no longer active
   * (e.g. their manager exited and wasn't replaced). Surfaced separately so they
   * are never silently hidden from the chart — they need a manager reassigned.
   */
  orphans: OrgNode[]
}

/**
 * Builds the reporting tree purely from the `manager_id` chain (no hardcoded
 * "levels"). Each node is enriched with the teams the person leads / belongs to.
 * Cycle-safe, and anyone whose manager is missing/inactive is returned under
 * `orphans` rather than dropped.
 */
export async function getOrgTree(): Promise<OrgTree> {
  const adminClient = createAdminClient()

  const [usersRes, teamsRes, membersRes] = await Promise.all([
    adminClient
      .from('users')
      .select('*')
      .eq('status', 'active')
      .order('full_name', { ascending: true }),
    adminClient.from('teams').select('id, name, team_lead_id'),
    adminClient.from('team_members').select('user_id, team_id').is('left_at', null),
  ])

  const users = usersRes.data ?? []
  if (users.length === 0) return { roots: [], orphans: [] }

  const teams = teamsRes.data ?? []
  const memberships = membersRes.data ?? []

  // team_id -> active member count (to flag single-person "solo" teams)
  const teamSize = new Map<string, number>()
  for (const m of memberships) teamSize.set(m.team_id, (teamSize.get(m.team_id) ?? 0) + 1)

  const teamById = new Map(teams.map((t) => [t.id, t]))
  const teamRef = (id: string): OrgTeamRef | null => {
    const t = teamById.get(id)
    if (!t) return null
    return { id: t.id, name: t.name, solo: (teamSize.get(t.id) ?? 0) <= 1 }
  }

  // Per-user: teams they lead, and teams they belong to.
  const ledByUser = new Map<string, OrgTeamRef[]>()
  for (const t of teams) {
    if (!t.team_lead_id) continue
    const ref = teamRef(t.id)
    if (!ref) continue
    if (!ledByUser.has(t.team_lead_id)) ledByUser.set(t.team_lead_id, [])
    ledByUser.get(t.team_lead_id)!.push(ref)
  }
  const memberByUser = new Map<string, OrgTeamRef[]>()
  for (const m of memberships) {
    const ref = teamRef(m.team_id)
    if (!ref) continue
    if (!memberByUser.has(m.user_id)) memberByUser.set(m.user_id, [])
    memberByUser.get(m.user_id)!.push(ref)
  }

  const activeIds = new Set(users.map((u) => u.id))
  const byManager = new Map<string | null, Tables<'users'>[]>()
  for (const u of users) {
    const key = u.manager_id ?? null
    if (!byManager.has(key)) byManager.set(key, [])
    byManager.get(key)!.push(u)
  }

  function build(userId: string | null, seen: Set<string>): OrgNode[] {
    return (byManager.get(userId) ?? [])
      .filter((u) => !seen.has(u.id)) // cycle guard
      .map((u) => {
        const next = new Set(seen)
        next.add(u.id)
        return {
          user: u,
          ledTeams: ledByUser.get(u.id) ?? [],
          memberTeams: memberByUser.get(u.id) ?? [],
          reports: build(u.id, next),
        }
      })
  }

  const roots = build(null, new Set())

  // Orphans: manager_id is set but that manager isn't an active user.
  const orphans = users
    .filter((u) => u.manager_id !== null && !activeIds.has(u.manager_id))
    .map((u) => ({
      user: u,
      ledTeams: ledByUser.get(u.id) ?? [],
      memberTeams: memberByUser.get(u.id) ?? [],
      reports: build(u.id, new Set([u.id])),
    }))

  return { roots, orphans }
}
