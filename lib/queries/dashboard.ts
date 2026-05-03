import { createAdminClient } from '@/lib/supabase/admin'
import type { Tables } from '@/lib/supabase/database.types'
import { listLeavesToday, listUpcomingLeaves, type LeaveWithUser } from './leaves'

export interface DashboardData {
  leavesToday: LeaveWithUser[]
  upcomingMine: LeaveWithUser[]
  upcomingTeam: LeaveWithUser[]
  myBalances: Tables<'leave_balances'>[]
  myCompoffBalance: Tables<'leave_balances'>[]
  pendingApprovalsForMe: Tables<'compoff_grants'>[]
  upcomingHolidays: Tables<'holidays'>[]
  unreadNotifications: number
}

const CURRENT_LEAVE_YEAR = 2026

export async function getDashboardData(
  currentUserId: string,
  ledTeamIds: string[],
  membersByTeam: Record<string, string[]>
): Promise<DashboardData> {
  const adminClient = createAdminClient()

  // Build the set of "my team's user_ids" for upcoming-team widget
  const teamUserIds = Array.from(
    new Set(ledTeamIds.flatMap((teamId) => membersByTeam[teamId] ?? []))
  ).filter((id) => id !== currentUserId)

  // Run as much as we can in parallel
  const todayDate = new Date().toISOString().split('T')[0]
  const futureDate = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]

  const [
    leavesToday,
    upcomingMine,
    upcomingTeam,
    balancesRes,
    compoffBalRes,
    approvalsRes,
    holidaysRes,
    notifRes,
  ] = await Promise.all([
    listLeavesToday(),
    listUpcomingLeaves(60, [currentUserId]),
    teamUserIds.length > 0 ? listUpcomingLeaves(30, teamUserIds) : Promise.resolve([]),
    adminClient
      .from('leave_balances')
      .select('*')
      .eq('user_id', currentUserId)
      .eq('leave_year', CURRENT_LEAVE_YEAR),
    adminClient
      .from('leave_balances')
      .select('*')
      .eq('user_id', currentUserId)
      .eq('leave_year', 0),
    adminClient
      .from('compoff_grants')
      .select('*')
      .eq('manager_id', currentUserId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    adminClient
      .from('holidays')
      .select('*')
      .gte('date', todayDate)
      .lte('date', futureDate)
      .order('date', { ascending: true }),
    adminClient
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', currentUserId)
      .is('read_at', null),
  ])

  return {
    leavesToday,
    upcomingMine,
    upcomingTeam,
    myBalances: balancesRes.data ?? [],
    myCompoffBalance: compoffBalRes.data ?? [],
    pendingApprovalsForMe: approvalsRes.data ?? [],
    upcomingHolidays: holidaysRes.data ?? [],
    unreadNotifications: notifRes.count ?? 0,
  }
}
