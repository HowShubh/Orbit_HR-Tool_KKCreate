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
