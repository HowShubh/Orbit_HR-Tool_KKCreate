import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { listLeavesInRange } from '@/lib/queries/leaves'
import { TeamClient } from '@/components/team/team-client'
import type { Tables } from '@/lib/supabase/database.types'
import type { LeaveWithUser } from '@/lib/queries/leaves'

export default async function TeamPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const adminClient = createAdminClient()

  const { data: myMemberships } = await adminClient
    .from('team_members')
    .select('team_id, is_primary')
    .eq('user_id', user.id)
    .is('left_at', null)

  const myTeamIds = (myMemberships ?? []).map((m) => m.team_id)
  const primaryTeamId =
    myMemberships?.find((m) => m.is_primary)?.team_id ?? myTeamIds[0] ?? null

  if (!primaryTeamId || myTeamIds.length === 0) {
    return (
      <TeamClient
        currentUser={user}
        myTeams={[]}
        initialTeamId={null}
        membersByTeam={{}}
        leadByTeam={{}}
        upcomingByTeam={{}}
      />
    )
  }

  const [teamsRes, allMembersRes] = await Promise.all([
    adminClient.from('teams').select('*').in('id', myTeamIds),
    adminClient
      .from('team_members')
      .select('user_id, team_id, is_primary')
      .in('team_id', myTeamIds)
      .is('left_at', null),
  ])

  const memberUserIds = Array.from(new Set((allMembersRes.data ?? []).map((m) => m.user_id)))
  const { data: memberUsers } = await adminClient
    .from('users')
    .select('*')
    .in('id', memberUserIds)

  const userById = new Map((memberUsers ?? []).map((u) => [u.id, u]))

  const membersByTeam: Record<string, Tables<'users'>[]> = {}
  for (const m of allMembersRes.data ?? []) {
    if (!membersByTeam[m.team_id]) membersByTeam[m.team_id] = []
    const u = userById.get(m.user_id)
    if (u) membersByTeam[m.team_id].push(u)
  }

  const leadByTeam: Record<string, Tables<'users'> | null> = {}
  for (const t of teamsRes.data ?? []) {
    leadByTeam[t.id] = t.team_lead_id ? userById.get(t.team_lead_id) ?? null : null
  }

  const today = new Date().toISOString().split('T')[0]
  const inThirty = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
  const upcomingByTeam: Record<string, LeaveWithUser[]> = {}

  for (const teamId of myTeamIds) {
    const ids = (membersByTeam[teamId] ?? []).map((u) => u.id)
    upcomingByTeam[teamId] = ids.length > 0 ? await listLeavesInRange(today, inThirty, { userIds: ids }) : []
  }

  return (
    <TeamClient
      currentUser={user}
      myTeams={teamsRes.data ?? []}
      initialTeamId={primaryTeamId}
      membersByTeam={membersByTeam}
      leadByTeam={leadByTeam}
      upcomingByTeam={upcomingByTeam}
    />
  )
}
