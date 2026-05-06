import { createAdminClient } from '@/lib/supabase/admin'
import type {
  LeaveRequestWithDays,
  LeaveRequestDay,
  LeaveRequestConflict,
  ApprovalQueueScope,
  RosterCell,
} from '@/components/approvals/leave-request-types'

const ACTIVE_STATUSES = ['active', 'pending', 'delete_requested'] as const

export async function listPendingApprovalsForReviewer(
  reviewerUserId: string,
  scope: ApprovalQueueScope
): Promise<LeaveRequestWithDays[]> {
  const adminClient = createAdminClient()

  // Step A: figure out which user_ids are visible to this reviewer
  let visibleUserIds: string[] | null = null   // null = all users (HR scope)
  if (scope === 'team') {
    const { data: ledTeams } = await adminClient
      .from('teams')
      .select('id')
      .eq('team_lead_id', reviewerUserId)
    const teamIds = (ledTeams ?? []).map((t) => t.id)

    const { data: members } = teamIds.length
      ? await adminClient
          .from('team_members')
          .select('user_id')
          .in('team_id', teamIds)
          .is('left_at', null)
      : { data: [] as { user_id: string }[] }

    const { data: directReports } = await adminClient
      .from('users')
      .select('id')
      .eq('manager_id', reviewerUserId)

    const ids = new Set<string>()
    for (const m of members ?? []) ids.add(m.user_id)
    for (const u of directReports ?? []) ids.add(u.id)
    ids.delete(reviewerUserId) // never approve own
    visibleUserIds = Array.from(ids)
    if (visibleUserIds.length === 0) return []
  }

  // Step B: pull pending leaves (grouped + legacy)
  let leavesQuery = adminClient
    .from('leaves')
    .select('id, request_id, user_id, type, start_date, end_date, days_deducted, half_day_position, status, reason, created_at')
    .in('status', ['pending', 'delete_requested'])
    .order('start_date', { ascending: true })
  if (visibleUserIds) leavesQuery = leavesQuery.in('user_id', visibleUserIds)

  const { data: leaves } = await leavesQuery
  if (!leaves || leaves.length === 0) return []

  // Step C: fetch parent requests for grouped rows
  const requestIds = Array.from(
    new Set(leaves.map((l) => l.request_id).filter((id): id is string => !!id))
  )
  const { data: requests } = requestIds.length
    ? await adminClient
        .from('leave_requests')
        .select('id, user_id, status, reason, created_at, decided_at')
        .in('id', requestIds)
    : { data: [] as Array<{
        id: string
        user_id: string
        status: LeaveRequestWithDays['status']
        reason: string | null
        created_at: string
        decided_at: string | null
      }> }
  const requestById = new Map((requests ?? []).map((r) => [r.id, r]))

  // Step D: applicant info (name + primary team)
  const applicantIds = Array.from(new Set(leaves.map((l) => l.user_id)))
  const { data: users } = await adminClient
    .from('users')
    .select('id, full_name')
    .in('id', applicantIds)
  const userNameById = new Map((users ?? []).map((u) => [u.id, u.full_name]))

  const { data: primaryMemberships } = await adminClient
    .from('team_members')
    .select('user_id, team_id, is_primary, teams:team_id(id, name)')
    .in('user_id', applicantIds)
    .is('left_at', null)
    .order('is_primary', { ascending: false })
  const teamByUser = new Map<string, { id: string; name: string } | null>()
  for (const m of primaryMemberships ?? []) {
    if (teamByUser.has(m.user_id)) continue
    const team = (m as unknown as { teams: { id: string; name: string } | null }).teams
    teamByUser.set(m.user_id, team ? { id: team.id, name: team.name } : null)
  }

  // Step E: bucket leaves by request_id (or per-leave for legacy)
  const buckets = new Map<string, typeof leaves>()
  for (const l of leaves) {
    const key = l.request_id ?? `legacy:${l.id}`
    const arr = buckets.get(key) ?? []
    arr.push(l)
    buckets.set(key, arr)
  }

  // Step F: compute conflicts in one batch query
  const allDates = Array.from(new Set(leaves.map((l) => l.start_date)))
  const minDate = allDates.reduce((a, b) => (a < b ? a : b))
  const maxDate = allDates.reduce((a, b) => (a > b ? a : b))
  const { data: teammateLeaves } = await adminClient
    .from('leaves')
    .select('user_id, start_date, end_date')
    .in('status', ACTIVE_STATUSES as unknown as ('active' | 'pending' | 'delete_requested')[])
    .lte('start_date', maxDate)
    .gte('end_date', minDate)

  // Step G: assemble LeaveRequestWithDays[]
  const result: LeaveRequestWithDays[] = []
  for (const [key, group] of buckets) {
    const first = group[0]
    const team = teamByUser.get(first.user_id) ?? null
    const parent = first.request_id ? requestById.get(first.request_id) : null

    const days: LeaveRequestDay[] = group.map((l) => ({
      leave_id: l.id,
      date: l.start_date,
      type: l.type as LeaveRequestDay['type'],
      days_deducted: Number(l.days_deducted ?? 0),
      half_day_position: l.half_day_position as LeaveRequestDay['half_day_position'],
    }))
    days.sort((a, b) => a.date.localeCompare(b.date))

    const leaveDays = days
      .filter((d) => d.type === 'leave' || d.type === 'compoff_leave')
      .reduce((s, d) => s + d.days_deducted, 0)
    const wfhDays = days
      .filter((d) => d.type === 'wfh' || d.type === 'compoff_wfh')
      .reduce((s, d) => s + d.days_deducted, 0)

    const conflicts: LeaveRequestConflict[] = []
    for (const d of days) {
      const overlap = (teammateLeaves ?? []).filter(
        (t) =>
          t.user_id !== first.user_id &&
          (team === null || true) && // team filter applied below for HR scope too
          t.start_date <= d.date &&
          t.end_date >= d.date
      )
      // Restrict to applicant's primary team members when team is known
      const filtered = team
        ? overlap.filter((t) =>
            (primaryMemberships ?? []).some(
              (pm) => pm.user_id === t.user_id && pm.team_id === team.id
            )
          )
        : overlap
      if (filtered.length > 0) {
        conflicts.push({ date: d.date, teammate_count: filtered.length })
      }
    }

    result.push({
      id: key,
      user_id: first.user_id,
      user_full_name: userNameById.get(first.user_id) ?? 'Unknown',
      user_team_id: team?.id ?? null,
      user_team_name: team?.name ?? null,
      status: (parent?.status ?? first.status) as LeaveRequestWithDays['status'],
      reason: parent?.reason ?? first.reason ?? null,
      created_at: parent?.created_at ?? first.created_at,
      decided_at: parent?.decided_at ?? null,
      days,
      summary: {
        leave_days: leaveDays,
        wfh_days: wfhDays,
        start_date: days[0].date,
        end_date: days[days.length - 1].date,
      },
      conflicts,
      decision_leave_id: first.id,
    })
  }

  result.sort((a, b) => a.created_at.localeCompare(b.created_at))
  return result
}
