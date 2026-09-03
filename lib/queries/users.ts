import { createAdminClient } from '@/lib/supabase/admin'
import type { Tables } from '@/lib/supabase/database.types'

export type Membership = {
  id: string
  team_id: string
  is_primary: boolean
}

export type UserWithMembership = Tables<'users'> & {
  memberships: Membership[]
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
    .select('id, user_id, team_id, is_primary')
    .is('left_at', null)

  const byUser = new Map<string, Membership[]>()
  for (const m of memberships ?? []) {
    if (!byUser.has(m.user_id)) byUser.set(m.user_id, [])
    byUser.get(m.user_id)!.push({
      id: m.id,
      team_id: m.team_id,
      is_primary: m.is_primary,
    })
  }

  return users.map((u) => ({ ...u, memberships: byUser.get(u.id) ?? [] }))
}

export type ProfileTeam = {
  id: string
  name: string
  is_primary: boolean
}

export type MyProfileContext = {
  teams: ProfileTeam[]
  managerName: string | null
  directReports: { id: string; full_name: string }[]
}

/**
 * Lightweight context for the My Profile page: the teams the current user
 * belongs to (with primary flag) and their manager's display name.
 */
export async function getMyProfileContext(
  userId: string,
  managerId: string | null
): Promise<MyProfileContext> {
  const adminClient = createAdminClient()

  const [membershipsRes, managerRes, reportsRes] = await Promise.all([
    adminClient
      .from('team_members')
      .select('team_id, is_primary')
      .eq('user_id', userId)
      .is('left_at', null),
    managerId
      ? adminClient.from('users').select('full_name').eq('id', managerId).single()
      : Promise.resolve({ data: null }),
    adminClient
      .from('users')
      .select('id, full_name')
      .eq('manager_id', userId)
      .eq('status', 'active')
      .order('full_name', { ascending: true }),
  ])

  const memberships = membershipsRes.data ?? []
  const teamIds = memberships.map((m) => m.team_id)

  const { data: teamRows } = teamIds.length
    ? await adminClient.from('teams').select('id, name').in('id', teamIds)
    : { data: [] as { id: string; name: string }[] }

  const nameById = new Map((teamRows ?? []).map((t) => [t.id, t.name]))

  const teams: ProfileTeam[] = memberships
    .map((m) => {
      const name = nameById.get(m.team_id)
      if (!name) return null
      return { id: m.team_id, name, is_primary: m.is_primary }
    })
    .filter((t): t is ProfileTeam => t !== null)
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.name.localeCompare(b.name))

  return {
    teams,
    managerName: (managerRes.data as { full_name: string } | null)?.full_name ?? null,
    directReports: reportsRes.data ?? [],
  }
}
