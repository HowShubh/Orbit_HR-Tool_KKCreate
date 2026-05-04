import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getCurrentUser,
  getCurrentUserTeamContext,
} from '@/lib/auth/get-current-user'
import { AppShell } from '@/components/layout/app-shell'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const adminClient = createAdminClient()

  // Bootstrap state needs to be checked before user lookup so we don't trip on missing users row
  const [stateResult, user] = await Promise.all([
    adminClient.from('system_state').select('bootstrap_state').single(),
    getCurrentUser(),
  ])

  const stateRow = stateResult.data

  // Hard-block only for the very first state — we need a founder before anything else
  if (stateRow?.bootstrap_state === 'awaiting_root_admin') {
    redirect('/setup')
  }

  if (!user) {
    redirect('/login?error=not_onboarded')
  }

  if (user.status === 'exited') {
    redirect('/login?error=account_exited')
  }

  const { ledTeamIds, membersByTeam } = await getCurrentUserTeamContext(user.id)

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
