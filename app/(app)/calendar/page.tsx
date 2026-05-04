import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { listUsers } from '@/lib/queries/users'
import { listTeams } from '@/lib/queries/teams'
import { listHolidays } from '@/lib/queries/holidays'
import { listLeavesInRange } from '@/lib/queries/leaves'
import { CalendarClient } from '@/components/calendar/calendar-client'

export default async function CalendarPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth() - 2, 1).toISOString().split('T')[0]
  const end = new Date(today.getFullYear(), today.getMonth() + 3, 0).toISOString().split('T')[0]

  const [users, teams, holidays, leaves] = await Promise.all([
    listUsers(),
    listTeams(),
    listHolidays(),
    listLeavesInRange(start, end),
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
