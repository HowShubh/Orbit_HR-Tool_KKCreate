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
  'id' | 'email' | 'full_name' | 'designation' | 'role' | 'manager_id' | 'joined_at' | 'status' | 'date_of_birth'
>

export type DashboardTeam = Pick<
  Tables<'teams'>,
  'id' | 'name' | 'wfo_pattern' | 'off_days' | 'team_lead_id'
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

export type Birthday = {
  id: string
  full_name: string
  designation: string | null
  date_of_birth: string
}

export type DashboardCompoffApproval = Tables<'compoff_grants'> & {
  user_full_name: string
  user_designation: string | null
}

export interface DashboardData {
  leavesToday: LeaveWithUser[]
  upcomingMine: LeaveWithUser[]
  upcomingTeam: LeaveWithUser[]
  upcomingOrg: LeaveWithUser[]
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
  birthdaysToday: Birthday[]
  orgBirthdays30: Birthday[]
  orgAnniversaries30: WorkAnniversary[]
}

// Next calendar occurrence of a MM-DD (birthday / joining day) on or after
// `startIso`, returned only if it falls on/before `endIso`. Checks the start
// year and the next year so a window spanning Dec→Jan still matches January.
// All strings are ISO 'YYYY-MM-DD'.
function nextOccurrenceWithin(monthDay: string, startIso: string, endIso: string): string | null {
  const startYear = Number(startIso.slice(0, 4))
  for (const year of [startYear, startYear + 1]) {
    const candidate = `${year}-${monthDay}`
    if (candidate >= startIso && candidate <= endIso) return candidate
  }
  return null
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
  let birthdaysToday: Birthday[] = []
  // Org-wide, next-30-days lists for HR/founders (planning view).
  let orgBirthdays30: Birthday[] = []
  let orgAnniversaries30: WorkAnniversary[] = []

  // Personal-team context (My Team / My Status / This Week Schedule / Daily Team
  // Overview) is rendered for every role now, so compute it for all of them. The
  // team set is their member teams unioned with the teams they lead — the latter
  // covers leads/founders who aren't listed as members of their own team.
  {
    const { data: myMemberships } = await adminClient
      .from('team_members')
      .select('team_id, is_primary')
      .eq('user_id', currentUserId)
      .is('left_at', null)

    const membershipTeamIds = (myMemberships ?? []).map((m) => m.team_id)
    const myTeamIds = Array.from(new Set([...membershipTeamIds, ...ledTeamIds]))
    primaryTeamId =
      (myMemberships ?? []).find((m) => m.is_primary)?.team_id ?? myTeamIds[0] ?? null

    const [myTeamsRes, myTeamMembersRes] = await Promise.all([
      myTeamIds.length > 0
        ? adminClient
            .from('teams')
            .select('id, name, wfo_pattern, off_days, team_lead_id')
            .in('id', myTeamIds)
        : Promise.resolve({ data: [] as Pick<Tables<'teams'>, 'id' | 'name' | 'wfo_pattern' | 'off_days' | 'team_lead_id'>[] }),
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
          .select('id, email, full_name, designation, role, manager_id, joined_at, status, date_of_birth')
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

    birthdaysToday = Array.from(userById.values())
      .filter((user) => Boolean(user.date_of_birth) && user.date_of_birth!.slice(5, 10) === todayMonthDay)
      .map((user) => ({
        id: user.id,
        full_name: user.full_name,
        designation: user.designation,
        date_of_birth: user.date_of_birth as string,
      }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
  }

  // "My team" leaves = the teams I'm a member of or lead (resolved in the
  // personal block above), minus me. Org-wide leaves (everyone) are a SEPARATE
  // card shown only to HR/founders, so the "Team Leaves" card always means my
  // own team rather than the whole company.
  const isOrgWide = currentUserRole === 'hr' || currentUserRole === 'founder'
  const myTeamUserIds = teamMemberIds.filter((id) => id !== currentUserId)

  let orgUserIds: string[] = []
  if (isOrgWide) {
    // Pull every active person once — used both for the org-wide upcoming-leaves
    // card and for the org-level Daily Overview (today's birthdays/anniversaries).
    const { data: allActive } = await adminClient
      .from('users')
      .select('id, full_name, designation, joined_at, date_of_birth')
      .eq('status', 'active')

    const allUserIds = new Set<string>()
    for (const ids of Object.values(membersByTeam)) {
      for (const id of ids) allUserIds.add(id)
    }
    for (const u of allActive ?? []) allUserIds.add(u.id)
    allUserIds.delete(currentUserId)
    orgUserIds = Array.from(allUserIds)

    // HR/founders get a 30-day planning view in the Daily Org Overview: every
    // upcoming birthday and work anniversary across the company, soonest first.
    const startIso = todayIST()
    const endIso = istDatePlusDays(30)

    orgBirthdays30 = (allActive ?? [])
      .flatMap((u) => {
        if (!u.date_of_birth) return []
        const occ = nextOccurrenceWithin(u.date_of_birth.slice(5, 10), startIso, endIso)
        if (!occ) return []
        return [{ occ, item: { id: u.id, full_name: u.full_name, designation: u.designation, date_of_birth: u.date_of_birth } }]
      })
      .sort((a, b) => a.occ.localeCompare(b.occ) || a.item.full_name.localeCompare(b.item.full_name))
      .map((x) => x.item)

    orgAnniversaries30 = (allActive ?? [])
      .flatMap((u) => {
        const occ = nextOccurrenceWithin(u.joined_at.slice(5, 10), startIso, endIso)
        if (!occ) return []
        const years = Number(occ.slice(0, 4)) - Number(u.joined_at.slice(0, 4))
        if (years <= 0) return [] // their joining day itself, not an anniversary
        return [{ occ, item: { id: u.id, full_name: u.full_name, designation: u.designation, joined_at: u.joined_at, years } }]
      })
      .sort((a, b) => a.occ.localeCompare(b.occ) || a.item.full_name.localeCompare(b.item.full_name))
      .map((x) => x.item)
  }

  // Run as much as we can in parallel. All "today"/range math resolves in IST.
  const todayDate = todayIST()
  const futureDate = istDatePlusDays(30)
  const { weekStart: weekStartDate, weekEnd: weekEndDate } = istWeekRange()

  const [
    leavesToday,
    upcomingMine,
    upcomingTeam,
    upcomingOrg,
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
    myTeamUserIds.length > 0 ? listUpcomingLeaves(30, myTeamUserIds) : Promise.resolve([]),
    orgUserIds.length > 0 ? listUpcomingLeaves(30, orgUserIds) : Promise.resolve([]),
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
    upcomingOrg,
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
    birthdaysToday,
    orgBirthdays30,
    orgAnniversaries30,
  }
}
