import { requireUser } from '@/lib/actions/_helpers'
import { listUsers } from '@/lib/queries/users'
import { listTeams } from '@/lib/queries/teams'
import { listHolidays } from '@/lib/queries/holidays'
import { listBalancesForYear, listCompoffBalances, listBalanceYears } from '@/lib/queries/balances'
import { listCompoffGrants } from '@/lib/queries/compoff'
import { listLeaveRequestHistory, listPendingApprovalsForReviewer } from '@/lib/queries/leave-requests'
import { listLeaveTypes } from '@/lib/queries/leave-types'
import { currentFiscalYearStart } from '@/lib/date'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSlackSettings } from '@/lib/slack'
import { HRConsoleClient } from '@/components/hr/hr-console-client'

export default async function HRConsolePage() {
  const me = await requireUser()
  const currentLeaveYear = currentFiscalYearStart()
  const [users, teams, holidays, balances, compoffBalances, grants, leaveTypes, pendingRequests, history, balanceYears, slackSettings] =
    await Promise.all([
      listUsers(),
      listTeams(),
      listHolidays(),
      listBalancesForYear(currentLeaveYear),
      listCompoffBalances(),
      listCompoffGrants(),
      listLeaveTypes(),
      listPendingApprovalsForReviewer(me.id, 'hr'),
      listLeaveRequestHistory(me.id, 'hr', { limit: 1000 }),
      listBalanceYears(),
      getSlackSettings(createAdminClient()),
    ])

  return (
    <HRConsoleClient
      users={users}
      teams={teams}
      holidays={holidays}
      balances={balances}
      compoffBalances={compoffBalances}
      grants={grants}
      leaveTypes={leaveTypes}
      leaveYear={currentLeaveYear}
      availableYears={balanceYears}
      pendingRequests={pendingRequests}
      history={history}
      slackSettings={slackSettings}
    />
  )
}
