import { getCurrentUser } from '@/lib/auth/get-current-user'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDashboardData } from '@/lib/queries/dashboard'
import { listMyNotifications } from '@/lib/queries/notifications'
import { DashboardClient } from '@/components/dashboard/dashboard-client'

export default async function DashboardPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const adminClient = createAdminClient()
  const [{ data: ledTeams }, { data: allMembers }] = await Promise.all([
    adminClient.from('teams').select('id').eq('team_lead_id', user.id),
    adminClient.from('team_members').select('user_id, team_id').is('left_at', null),
  ])
  const ledTeamIds = (ledTeams ?? []).map((t) => t.id)
  const membersByTeam: Record<string, string[]> = {}
  for (const m of allMembers ?? []) {
    if (!membersByTeam[m.team_id]) membersByTeam[m.team_id] = []
    membersByTeam[m.team_id].push(m.user_id)
  }

  const [data, notifications] = await Promise.all([
    getDashboardData(user.id, ledTeamIds, membersByTeam),
    listMyNotifications(user.id, 20),
  ])

  return (
    <DashboardClient currentUser={user} data={data} notifications={notifications} />
  )
}
