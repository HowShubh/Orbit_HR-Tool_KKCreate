import { requireUser } from '@/lib/actions/_helpers'
import { listUsers } from '@/lib/queries/users'
import { listTeams } from '@/lib/queries/teams'
import { listHolidays } from '@/lib/queries/holidays'
import { listBalancesForYear, listCompoffBalances } from '@/lib/queries/balances'
import { listCompoffGrants } from '@/lib/queries/compoff'
import { listLeaveRequestHistory, listPendingApprovalsForReviewer } from '@/lib/queries/leave-requests'
import { HRConsoleClient } from '@/components/hr/hr-console-client'

const CURRENT_LEAVE_YEAR = 2026

export default async function HRConsolePage() {
  const me = await requireUser()
  const [users, teams, holidays, balances, compoffBalances, grants, pendingRequests, history] =
    await Promise.all([
      listUsers(),
      listTeams(),
      listHolidays(),
      listBalancesForYear(CURRENT_LEAVE_YEAR),
      listCompoffBalances(),
      listCompoffGrants(),
      listPendingApprovalsForReviewer(me.id, 'hr'),
      listLeaveRequestHistory(me.id, 'hr', { limit: 200 }),
    ])

  return (
    <HRConsoleClient
      users={users}
      teams={teams}
      holidays={holidays}
      balances={balances}
      compoffBalances={compoffBalances}
      grants={grants}
      leaveYear={CURRENT_LEAVE_YEAR}
      pendingRequests={pendingRequests}
      history={history}
    />
  )
}
