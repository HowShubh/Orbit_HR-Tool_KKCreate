import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AppShell } from '@/components/layout/app-shell'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    redirect('/login')
  }

  const adminClient = createAdminClient()
  const { data: stateRow } = await adminClient
    .from('system_state')
    .select('bootstrap_state')
    .single()

  // If bootstrap is not operational, send to setup (regardless of whether users row exists)
  if (
    stateRow?.bootstrap_state &&
    stateRow.bootstrap_state !== 'operational'
  ) {
    redirect('/setup')
  }

  const user = await getCurrentUser()

  // Authed but no users row, and bootstrap is operational → not onboarded
  if (!user) {
    redirect('/login?error=not_onboarded')
  }

  if (user.status === 'exited') {
    redirect('/login?error=account_exited')
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
