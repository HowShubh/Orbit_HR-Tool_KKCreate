import { createAdminClient } from '@/lib/supabase/admin'
import { todayIST, istDatePlusDays, istWeekRange, istMonthDay, istYearMonth, currentFiscalYearStart } from '@/lib/date'
import type { Tables } from '@/lib/supabase/database.types'
import {
  listLeavesToday,
  listUpcomingLeaves,
  type LeaveWithUser,
} from './leaves'
import { listPendingApprovalsForReviewer } from './leave-requests'
import { listLeaveTypes } from './leave-types'
import { isEligibleForPolicy, type LeaveTypePolicy } from '@/lib/leave-types'
import type { LeaveRequestWithDays } from '@/components/approvals/leave-request-types'

export type DashboardTeamMember = Pick<
  Tables<'users'>,
  'id' | 'email' | 'full_name' | 'designation' | 'role' | 'manager_id' | 'joined_at' | 'status'
>

export type DashboardTeam = Pick<
  Tables<'teams'>,
  'id' | 'name' | 'wfo_pattern' | 'team_lead_id'
> & {
  team_lead_name: string | null
  members: DashboardTeamMember[]
}

export type WorkAnniversary = {
  id: string
  full_name: string
  designation: string | null
  joined_at: string
  years: number
}

export type DashboardCompoffApproval = Tables<'compoff_grants'> & {
  user_full_name: string
  user_designation: string | null
}

export interface DashboardData {
  leavesToday: LeaveWithUser[]
  upcomingMine: LeaveWithUser[]
  upcomingTeam: LeaveWithUser[]
  myBalances: Tables<'leave_balances'>[]
  myCompoffBalance: Tables<'leave_balances'>[]
  leaveTypes: LeaveTypePolicy[]
  pendingApprovalsForMe: DashboardCompoffApproval[]
  pendingApprovalRequests: LeaveRequestWithDays[]
  upcomingHolidays: Tables<'holidays'>[]
  weekHolidays: Tables<'holidays'>[]
  unreadNotifications: number
  primaryTeamId: string | null
  employeeTeams: DashboardTeam[]
  teamLeavesToday: LeaveWithUser[]
  workAnniversariesToday: WorkAnniversary[]
}

export async function getDashboardData(
  currentUserId: string,
  currentUserRole: 'employee' | 'team_lead' | 'hr' | 'founder',
  ledTeamIds: string[],
  membersByTeam: Record<string, string[]>
): Promise<DashboardData> {
  const adminClient = createAdminClient()
  const CURRENT_LEAVE_YEAR = currentFiscalYearStart()
  let primaryTeamId: string | null = null
  let employeeTeams: DashboardTeam[] = []
  let teamMemberIds: string[] = []
  let workAnniversariesToday: WorkAnniversary[] = []

  if (currentUserRole === 'employee') {
    const { data: myMemberships } = await adminClient
      .from('team_members')
      .select('team_id, is_primary')
      .eq('user_id', currentUserId)
      .is('left_at', null)

    const myTeamIds = Array.from(new Set((myMemberships ?? []).map((m) => m.team_id)))
    primaryTeamId =
      (myMemberships ?? []).find((m) => m.is_primary)?.team_id ?? myTeamIds[0] ?? null

    const [myTeamsRes, myTeamMembersRes] = await Promise.all([
      myTeamIds.length > 0
        ? adminClient
            .from('teams')
            .select('id, name, wfo_pattern, team_lead_id')
            .in('id', myTeamIds)
        : Promise.resolve({ data: [] as Pick<Tables<'teams'>, 'id' | 'name' | 'wfo_pattern' | 'team_lead_id'>[] }),
      myTeamIds.length > 0
        ? adminClient
            .from('team_members')
            .select('team_id, user_id')
            .in('team_id', myTeamIds)
            .is('left_at', null)
        : Promise.resolve({ data: [] as { team_id: string; user_id: string }[] }),
    ])

    const myTeams = myTeamsRes.data ?? []
    const myTeamMemberships = myTeamMembersRes.data ?? []
    teamMemberIds = Array.from(new Set(myTeamMemberships.map((m) => m.user_id)))
    const teamLeadIds = myTeams.map((team) => team.team_lead_id).filter(Boolean) as string[]
    const myTeamUserIds = Array.from(new Set([...teamMemberIds, ...teamLeadIds]))

    const { data: teamUsers } = myTeamUserIds.length > 0
      ? await adminClient
          .from('users')
          .select('id, email, full_name, designation, role, manager_id, joined_at, status')
          .in('id', myTeamUserIds)
          .eq('status', 'active')
      : { data: [] as DashboardTeamMember[] }

    const userById = new Map((teamUsers ?? []).map((user) => [user.id, user]))
    employeeTeams = myTeams.map((team) => ({
      ...team,
      team_lead_name: team.team_lead_id
        ? userById.get(team.team_lead_id)?.full_name ?? null
        : null,
      members: myTeamMemberships
        .filter((membership) => membership.team_id === team.id)
        .map((membership) => userById.get(membership.user_id))
        .filter((user): user is DashboardTeamMember => Boolean(user))
        .sort((a, b) => a.full_name.localeCompare(b.full_name)),
    }))

    const todayMonthDay = istMonthDay()
    const currentYear = istYearMonth().year
    workAnniversariesToday = Array.from(userById.values())
      .filter((user) => user.joined_at.slice(5, 10) === todayMonthDay)
      .map((user) => ({
        id: user.id,
        full_name: user.full_name,
        designation: user.designation,
        joined_at: user.joined_at,
        years: Math.max(0, currentYear - Number(user.joined_at.slice(0, 4))),
      }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
  }

  // For team_leads → only people in teams they lead.
  // For HR/founders → everyone in the org (excluding themselves).
  // For employees → no team widget (empty list).
  const isOrgWide = currentUserRole === 'hr' || currentUserRole === 'founder'

  let teamUserIds: string[]
  if (isOrgWide) {
    const allUserIds = new Set<string>()
    for (const ids of Object.values(membersByTeam)) {
      for (const id of ids) allUserIds.add(id)
    }
    // Also include users that aren't in any team yet (still part of the org)
    const { data: allActive } = await adminClient
      .from('users')
      .select('id')
      .eq('status', 'active')
    for (const u of allActive ?? []) allUserIds.add(u.id)
    allUserIds.delete(currentUserId)
    teamUserIds = Array.from(allUserIds)
  } else {
    teamUserIds = Array.from(
      new Set(ledTeamIds.flatMap((teamId) => membersByTeam[teamId] ?? []))
    ).filter((id) => id !== currentUserId)
  }

  // Run as much as we can in parallel. All "today"/range math resolves in IST.
  const todayDate = todayIST()
  const futureDate = istDatePlusDays(30)
  const { weekStart: weekStartDate, weekEnd: weekEndDate } = istWeekRange()

  const [
    leavesToday,
    upcomingMine,
    upcomingTeam,
    balancesRes,
    compoffBalRes,
    approvalsRes,
    holidaysRes,
    weekHolidaysRes,
    notifRes,
    leaveTypes,
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
      .from('holidays')
      .select('*')
      .gte('date', weekStartDate)
      .lte('date', weekEndDate)
      .order('date', { ascending: true }),
    adminClient
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', currentUserId)
      .is('read_at', null),
    listLeaveTypes(),
  ])

  // The dashboard approval queue is for the people YOU manage only — for everyone,
  // founders included. Founders/HR do org-wide overrides from the HR Console, not here.
  const pendingApprovalRequests = await listPendingApprovalsForReviewer(currentUserId, 'team')
  const compoffRequesterIds = Array.from(
    new Set((approvalsRes.data ?? []).map((grant) => grant.user_id))
  )
  const { data: compoffRequesters } = compoffRequesterIds.length > 0
    ? await adminClient
        .from('users')
        .select('id, full_name, designation')
        .in('id', compoffRequesterIds)
    : { data: [] as Pick<Tables<'users'>, 'id' | 'full_name' | 'designation'>[] }
  const requesterById = new Map((compoffRequesters ?? []).map((user) => [user.id, user]))

  return {
    leavesToday,
    upcomingMine,
    upcomingTeam,
    myBalances: balancesRes.data ?? [],
    myCompoffBalance: compoffBalRes.data ?? [],
    leaveTypes: leaveTypes.filter(
      (policy) => policy.is_active && isEligibleForPolicy(policy, currentUserId)
    ),
    pendingApprovalsForMe: (approvalsRes.data ?? []).map((grant) => ({
      ...grant,
      user_full_name: requesterById.get(grant.user_id)?.full_name ?? 'Unknown',
      user_designation: requesterById.get(grant.user_id)?.designation ?? null,
    })),
    pendingApprovalRequests,
    upcomingHolidays: holidaysRes.data ?? [],
    weekHolidays: weekHolidaysRes.data ?? [],
    unreadNotifications: notifRes.count ?? 0,
    primaryTeamId,
    employeeTeams,
    teamLeavesToday: leavesToday.filter((leave) => teamMemberIds.includes(leave.user_id)),
    workAnniversariesToday,
  }
}
