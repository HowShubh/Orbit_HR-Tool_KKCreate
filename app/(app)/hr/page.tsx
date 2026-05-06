import { listUsers } from '@/lib/queries/users'
import { listTeams } from '@/lib/queries/teams'
import { listHolidays } from '@/lib/queries/holidays'
import { listBalancesForYear, listCompoffBalances } from '@/lib/queries/balances'
import { listCompoffGrants } from '@/lib/queries/compoff'
import { listLeavesInRange } from '@/lib/queries/leaves'
import { HRConsoleClient } from '@/components/hr/hr-console-client'

const CURRENT_LEAVE_YEAR = 2026

export default async function HRConsolePage() {
  const [users, teams, holidays, balances, compoffBalances, grants, leaves] =
    await Promise.all([
      listUsers(),
      listTeams(),
      listHolidays(),
      listBalancesForYear(CURRENT_LEAVE_YEAR),
      listCompoffBalances(),
      listCompoffGrants(),
      listLeavesInRange('2025-06-01', '2027-06-30', { statuses: 'all' }),
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
      leaves={leaves}
    />
  )
}
