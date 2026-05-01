import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { AppShell } from '@/components/layout/app-shell'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  if (user.status === 'exited') {
    redirect('/login?error=account_exited')
  }

  // Check bootstrap state — redirect to setup if not operational
  const adminClient = createAdminClient()
  const { data: stateRow } = await adminClient
    .from('system_state')
    .select('bootstrap_state')
    .single()

  if (
    stateRow?.bootstrap_state &&
    stateRow.bootstrap_state !== 'operational'
  ) {
    redirect('/setup')
  }

  // Fetch teams this user leads (for capability derivation)
  const { data: ledTeams } = await adminClient
    .from('teams')
    .select('id')
    .eq('team_lead_id', user.id)

  // Fetch team memberships for capability scope resolution
  const { data: allMembers } = await adminClient
    .from('team_members')
    .select('user_id, team_id')
    .is('left_at', null)

  const ledTeamIds = (ledTeams ?? []).map((t) => t.id)
  const membersByTeam: Record<string, string[]> = {}
  for (const m of allMembers ?? []) {
    if (!membersByTeam[m.team_id]) membersByTeam[m.team_id] = []
    membersByTeam[m.team_id].push(m.user_id)
  }

  return (
    <AppShell
      currentUser={user}
      ledTeamIds={ledTeamIds}
      membersByTeam={membersByTeam}
    >
      {children}
    </AppShell>
  )
}
