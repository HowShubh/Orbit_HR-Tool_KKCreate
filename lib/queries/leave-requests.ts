import { createAdminClient } from '@/lib/supabase/admin'
import type {
  LeaveRequestWithDays,
  LeaveRequestDay,
  LeaveRequestConflict,
  ApprovalQueueScope,
  RosterCell,
} from '@/components/approvals/leave-request-types'
import {
  DEFAULT_LEAVE_TYPES,
  isAwayCategory,
  isWfhCategory,
  leaveTypeCategory,
  leaveTypeLabel,
  type LeaveTypePolicy,
} from '@/lib/leave-types'
import { managedUserIds } from '@/lib/approvers'

const ACTIVE_STATUSES = ['active', 'pending', 'delete_requested'] as const

async function loadLeaveTypePolicies(
  adminClient: ReturnType<typeof createAdminClient>
): Promise<LeaveTypePolicy[]> {
  const { data, error } = await adminClient.from('leave_types').select('*')
  return error || !data || data.length === 0 ? DEFAULT_LEAVE_TYPES : data
}

export async function listPendingApprovalsForReviewer(
  reviewerUserId: string,
  scope: ApprovalQueueScope
): Promise<LeaveRequestWithDays[]> {
  const adminClient = createAdminClient()
  const policies = await loadLeaveTypePolicies(adminClient)

  // Step A: figure out which user_ids are visible to this reviewer.
  // Manager-only model: a team reviewer approves ONLY the people they manage
  // (manager_id = them). Team leads who aren't a person's manager are FYI-only.
  let visibleUserIds: string[] | null = null   // null = all users (HR scope)
  if (scope === 'team') {
    visibleUserIds = await managedUserIds(adminClient, reviewerUserId)
    if (visibleUserIds.length === 0) return []
  }

  // Step B: pull pending leaves (grouped + legacy)
  let leavesQuery = adminClient
    .from('leaves')
    .select('id, request_id, user_id, type, requested_type, start_date, end_date, days_deducted, half_day_position, status, reason, created_at')
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

  // Step D: applicant info (name + primary team + manager, for the override prompt)
  const applicantIds = Array.from(new Set(leaves.map((l) => l.user_id)))
  const { data: users } = await adminClient
    .from('users')
    .select('id, full_name, manager_id')
    .in('id', applicantIds)
  const userNameById = new Map((users ?? []).map((u) => [u.id, u.full_name]))
  const managerIdByUser = new Map((users ?? []).map((u) => [u.id, u.manager_id]))

  const managerIds = Array.from(
    new Set((users ?? []).map((u) => u.manager_id).filter((id): id is string => Boolean(id)))
  )
  const { data: managers } = managerIds.length
    ? await adminClient.from('users').select('id, full_name').in('id', managerIds)
    : { data: [] as { id: string; full_name: string }[] }
  const managerNameById = new Map((managers ?? []).map((m) => [m.id, m.full_name]))

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
      type: l.requested_type ?? l.type,
      type_name: leaveTypeLabel(l.requested_type ?? l.type, policies),
      type_category: leaveTypeCategory(l.requested_type ?? l.type, policies),
      days_deducted: Number(l.days_deducted ?? 0),
      half_day_position: l.half_day_position as LeaveRequestDay['half_day_position'],
    }))
    days.sort((a, b) => a.date.localeCompare(b.date))

    const leaveDays = days
      .filter((d) => isAwayCategory(d.type_category))
      .reduce((s, d) => s + d.days_deducted, 0)
    const wfhDays = days
      .filter((d) => isWfhCategory(d.type_category))
      .reduce((s, d) => s + d.days_deducted, 0)

    const conflicts: LeaveRequestConflict[] = []
    for (const d of days) {
      const overlap = (teammateLeaves ?? []).filter(
        (t) =>
          t.user_id !== first.user_id &&
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
      user_manager_id: managerIdByUser.get(first.user_id) ?? null,
      user_manager_name: (() => {
        const mid = managerIdByUser.get(first.user_id)
        return mid ? managerNameById.get(mid) ?? null : null
      })(),
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

export async function listRosterContext(
  teamId: string,
  startDate: string,
  endDate: string
): Promise<RosterCell[]> {
  const adminClient = createAdminClient()
  const policies = await loadLeaveTypePolicies(adminClient)

  const { data: members } = await adminClient
    .from('team_members')
    .select('user_id, users:user_id(id, full_name)')
    .eq('team_id', teamId)
    .is('left_at', null)
  const memberIds = (members ?? []).map((m) => m.user_id)
  const memberNameById = new Map(
    (members ?? []).map((m) => {
      const u = (m as unknown as { users: { id: string; full_name: string } | null }).users
      return [m.user_id, u?.full_name ?? 'Unknown']
    })
  )
  if (memberIds.length === 0) return []

  const { data: leaves } = await adminClient
    .from('leaves')
    .select('user_id, start_date, end_date, type, requested_type, half_day_position')
    .in('user_id', memberIds)
    .in('status', ACTIVE_STATUSES as unknown as ('active' | 'pending' | 'delete_requested')[])
    .lte('start_date', endDate)
    .gte('end_date', startDate)

  const { data: holidays } = await adminClient
    .from('holidays')
    .select('date, name')
    .gte('date', startDate)
    .lte('date', endDate)

  const cells: RosterCell[] = []

  for (const l of leaves ?? []) {
    // expand multi-day legacy leaves into per-day cells
    let cursor = l.start_date
    while (cursor <= l.end_date) {
      cells.push({
        user_id: l.user_id,
        user_full_name: memberNameById.get(l.user_id) ?? 'Unknown',
        date: cursor,
        type: l.requested_type ?? l.type,
        type_name: leaveTypeLabel(l.requested_type ?? l.type, policies),
        type_category: leaveTypeCategory(l.requested_type ?? l.type, policies),
        half_day_position: (l.half_day_position ?? null) as RosterCell['half_day_position'],
      })
      cursor = addOneDay(cursor)
    }
  }

  // Holidays appear as one cell per member per holiday date — caller renders as a column shade
  for (const h of holidays ?? []) {
    cells.push({
      user_id: '__holiday__',
      user_full_name: h.name,
      date: h.date,
      type: 'holiday',
      half_day_position: null,
    })
  }

  return cells
}

function addOneDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + 1)
  return dt.toISOString().slice(0, 10)
}

export async function listLeaveRequestHistory(
  reviewerUserId: string,
  scope: ApprovalQueueScope,
  options?: { limit?: number; statuses?: Array<LeaveRequestWithDays['status']> }
): Promise<LeaveRequestWithDays[]> {
  const adminClient = createAdminClient()
  const policies = await loadLeaveTypePolicies(adminClient)
  const statuses = options?.statuses ?? (['active', 'rejected', 'deleted'] as const)
  const limit = options?.limit ?? 100

  // Resolve visible user_ids the same way as the pending query (manager-only).
  let visibleUserIds: string[] | null = null
  if (scope === 'team') {
    visibleUserIds = await managedUserIds(adminClient, reviewerUserId)
    if (visibleUserIds.length === 0) return []
  }

  let q = adminClient
    .from('leaves')
    .select('id, request_id, user_id, type, requested_type, start_date, end_date, days_deducted, half_day_position, status, reason, created_at')
    .in('status', statuses as unknown as ('active' | 'pending' | 'delete_requested' | 'rejected' | 'deleted')[])
    .order('start_date', { ascending: false })
    .limit(limit * 6) // a request can be up to ~6 days; over-fetch then group
  if (visibleUserIds) q = q.in('user_id', visibleUserIds)

  const { data: leaves } = await q
  if (!leaves || leaves.length === 0) return []

  // Reuse the same grouping shape as listPendingApprovalsForReviewer
  // (without conflicts — history doesn't need them)
  const userIds = Array.from(new Set(leaves.map((l) => l.user_id)))
  const { data: users } = await adminClient
    .from('users')
    .select('id, full_name')
    .in('id', userIds)
  const userNameById = new Map((users ?? []).map((u) => [u.id, u.full_name]))

  const requestIds = Array.from(
    new Set(leaves.map((l) => l.request_id).filter((id): id is string => !!id))
  )
  const { data: parents } = requestIds.length
    ? await adminClient
        .from('leave_requests')
        .select('id, status, reason, created_at, decided_at')
        .in('id', requestIds)
    : { data: [] as Array<{
        id: string
        status: LeaveRequestWithDays['status']
        reason: string | null
        created_at: string
        decided_at: string | null
      }> }
  const parentById = new Map((parents ?? []).map((p) => [p.id, p]))

  const buckets = new Map<string, typeof leaves>()
  for (const l of leaves) {
    const key = l.request_id ?? `legacy:${l.id}`
    const arr = buckets.get(key) ?? []
    arr.push(l)
    buckets.set(key, arr)
  }

  const out: LeaveRequestWithDays[] = []
  for (const [key, group] of buckets) {
    const first = group[0]
    const parent = first.request_id ? parentById.get(first.request_id) : null
    const days: LeaveRequestDay[] = group.map((l) => ({
      leave_id: l.id,
      date: l.start_date,
      type: l.requested_type ?? l.type,
      type_name: leaveTypeLabel(l.requested_type ?? l.type, policies),
      type_category: leaveTypeCategory(l.requested_type ?? l.type, policies),
      days_deducted: Number(l.days_deducted ?? 0),
      half_day_position: l.half_day_position as LeaveRequestDay['half_day_position'],
    }))
    days.sort((a, b) => a.date.localeCompare(b.date))
    const leaveDays = days
      .filter((d) => isAwayCategory(d.type_category))
      .reduce((s, d) => s + d.days_deducted, 0)
    const wfhDays = days
      .filter((d) => isWfhCategory(d.type_category))
      .reduce((s, d) => s + d.days_deducted, 0)
    out.push({
      id: key,
      user_id: first.user_id,
      user_full_name: userNameById.get(first.user_id) ?? 'Unknown',
      user_team_id: null,
      user_team_name: null,
      user_manager_id: null,
      user_manager_name: null,
      status: (parent?.status ?? first.status) as LeaveRequestWithDays['status'],
      reason: parent?.reason ?? first.reason ?? null,
      created_at: parent?.created_at ?? first.created_at,
      decided_at: parent?.decided_at ?? null,
      days,
      summary: {
        leave_days: leaveDays,
        wfh_days: wfhDays,
        // Use the actual min start / max end across the group's rows. Backdated
        // (on-behalf) leaves are a single multi-day row, so deriving the range
        // from the per-day list collapsed end_date onto start_date.
        start_date: group.reduce((m, l) => (l.start_date < m ? l.start_date : m), group[0].start_date),
        end_date: group.reduce((m, l) => (l.end_date > m ? l.end_date : m), group[0].end_date),
      },
      conflicts: [],
      decision_leave_id: first.id,
    })
  }

  out.sort((a, b) => b.created_at.localeCompare(a.created_at))
  return out.slice(0, limit)
}
