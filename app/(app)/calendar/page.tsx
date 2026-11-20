import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { listUsers } from '@/lib/queries/users'
import { listTeams } from '@/lib/queries/teams'
import { listHolidays } from '@/lib/queries/holidays'
import { listLeavesInRange } from '@/lib/queries/leaves'
import { istMonthStart, istMonthEnd } from '@/lib/date'
import { CalendarClient } from '@/components/calendar/calendar-client'

export default async function CalendarPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  // 2 months back through 3 months ahead, resolved against the IST calendar.
  const start = istMonthStart(-2)
  const end = istMonthEnd(2)

  const [users, teams, holidays, leaves] = await Promise.all([
    listUsers(),
    listTeams(),
    listHolidays(),
    // viewerId: the person's own rows keep the name they applied under; everyone
    // else's show the policy's public name.
    listLeavesInRange(start, end, { viewerId: user.id }),
  ])

  return (
    <CalendarClient
      currentUser={user}
      users={users}
      teams={teams}
      holidays={holidays}
      allLeaves={leaves}
    />
  )
}
