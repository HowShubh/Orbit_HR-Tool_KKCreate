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
    : { data: [] as { id: string; full_name: string }[] }
  const leadMap = new Map((leads ?? []).map((l) => [l.id, l.full_name]))

  return teams.map((t) => ({
    ...t,
    member_count: counts.get(t.id) ?? 0,
    team_lead_name: t.team_lead_id ? leadMap.get(t.team_lead_id) ?? null : null,
  }))
}
