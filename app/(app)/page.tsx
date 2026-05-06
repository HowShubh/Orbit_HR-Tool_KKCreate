import {
  getCurrentUser,
  getCurrentUserTeamContext,
} from '@/lib/auth/get-current-user'
import { redirect } from 'next/navigation'
import { getDashboardData } from '@/lib/queries/dashboard'
import { listMyNotifications } from '@/lib/queries/notifications'
import { DashboardClient } from '@/components/dashboard/dashboard-client'

export default async function DashboardPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  // Reuses the layout's already-cached team context — zero extra round-trips.
  const { ledTeamIds, membersByTeam } = await getCurrentUserTeamContext(user.id)

  const [data, notifications] = await Promise.all([
    getDashboardData(user.id, user.role, ledTeamIds, membersByTeam),
    listMyNotifications(user.id, 20),
  ])

  return (
    <DashboardClient currentUser={user} data={data} notifications={notifications} />
  )
}
