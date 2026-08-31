import { createAdminClient } from '@/lib/supabase/admin'
import { todayIST, istDatePlusDays } from '@/lib/date'
import {
  DEFAULT_LEAVE_TYPES,
  leaveTypeCategory,
  leaveTypeLabelFor,
  type LeaveTypeCategory,
} from '@/lib/leave-types'
import type { Tables } from '@/lib/supabase/database.types'

export type LeaveWithUser = Tables<'leaves'> & {
  user_full_name: string
  type_name: string
  type_category: LeaveTypeCategory
}

async function loadLeaveTypes(adminClient: ReturnType<typeof createAdminClient>) {
  const { data, error } = await adminClient.from('leave_types').select('*')
  return error || !data || data.length === 0 ? DEFAULT_LEAVE_TYPES : data
}

export async function listLeavesForUser(
  userId: string,
  status: 'active' | 'all' = 'active'
): Promise<Tables<'leaves'>[]> {
  const adminClient = createAdminClient()
  let query = adminClient
    .from('leaves')
    .select('*')
    .eq('user_id', userId)
    .order('start_date', { ascending: false })

  if (status === 'active') query = query.eq('status', 'active')

  const { data } = await query
  return data ?? []
}

/**
 * All leaves in a date range, optionally filtered by user_ids. Used by HR + Calendar.
 *
 * `type_name` is the policy's PUBLIC name for everyone except the person the row
 * belongs to. Pass `viewerId` to get their own rows labelled with the private
 * name they applied under; omit it and every row is public, which is the safe
 * default for any caller that renders to a mixed audience.
 */
export async function listLeavesInRange(
  startDate: string,
  endDate: string,
  options?: {
    userIds?: string[]
    statuses?: Array<Tables<'leaves'>['status']> | 'all'
    viewerId?: string
  }
): Promise<LeaveWithUser[]> {
  const adminClient = createAdminClient()
  let query = adminClient
    .from('leaves')
    .select('*')
    .lte('start_date', endDate)
    .gte('end_date', startDate)
    .order('start_date', { ascending: true })

  if (options?.statuses === 'all') {
    // No status filter.
  } else if (options?.statuses && options.statuses.length > 0) {
    query = query.in('status', options.statuses)
  } else {
    query = query.in('status', ['active', 'delete_requested'])
  }

  if (options?.userIds && options.userIds.length > 0) {
    query = query.in('user_id', options.userIds)
  }

  const { data: leaves } = await query
  if (!leaves || leaves.length === 0) return []

  const userIds = Array.from(new Set(leaves.map((l) => l.user_id)))
  const { data: users } = await adminClient
    .from('users')
    .select('id, full_name')
    .in('id', userIds)
  const nameMap = new Map((users ?? []).map((u) => [u.id, u.full_name]))
  const leaveTypes = await loadLeaveTypes(adminClient)

  return leaves.map((l) => ({
    ...l,
    user_full_name: nameMap.get(l.user_id) ?? 'Unknown',
    type_name: leaveTypeLabelFor(
      l.requested_type ?? l.type,
      leaveTypes,
      Boolean(options?.viewerId) && l.user_id === options?.viewerId
    ),
    type_category: leaveTypeCategory(l.requested_type ?? l.type, leaveTypes),
  }))
}

/** Active leaves covering today across the org. */
export async function listLeavesToday(viewerId?: string): Promise<LeaveWithUser[]> {
  const today = todayIST()
  return listLeavesInRange(today, today, { viewerId })
}

/** Upcoming leaves in next N days for given user_ids. */
export async function listUpcomingLeaves(
  daysAhead: number,
  userIds?: string[],
  viewerId?: string
): Promise<LeaveWithUser[]> {
  return listLeavesInRange(todayIST(), istDatePlusDays(daysAhead), { userIds, viewerId })
}

/**
 * Pending leaves for review. Always labelled with the public name: this feeds
 * approval surfaces, and nobody approves their own request.
 */
export async function listPendingLeaves(userIds?: string[]): Promise<LeaveWithUser[]> {
  const adminClient = createAdminClient()
  let query = adminClient
    .from('leaves')
    .select('*')
    .in('status', ['pending', 'delete_requested'])
    .order('updated_at', { ascending: false })

  if (userIds && userIds.length > 0) {
    query = query.in('user_id', userIds)
  }

  const { data: leaves } = await query
  if (!leaves || leaves.length === 0) return []

  const leaveUserIds = Array.from(new Set(leaves.map((leave) => leave.user_id)))
  const { data: users } = await adminClient
    .from('users')
    .select('id, full_name')
    .in('id', leaveUserIds)
  const nameMap = new Map((users ?? []).map((user) => [user.id, user.full_name]))
  const leaveTypes = await loadLeaveTypes(adminClient)

  return leaves.map((leave) => ({
    ...leave,
    user_full_name: nameMap.get(leave.user_id) ?? 'Unknown',
    type_name: leaveTypeLabelFor(leave.requested_type ?? leave.type, leaveTypes, false),
    type_category: leaveTypeCategory(leave.requested_type ?? leave.type, leaveTypes),
  }))
}
