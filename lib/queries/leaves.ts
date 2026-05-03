import { createAdminClient } from '@/lib/supabase/admin'
import type { Tables } from '@/lib/supabase/database.types'

export type LeaveWithUser = Tables<'leaves'> & {
  user_full_name: string
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

/** All leaves in a date range, optionally filtered by user_ids. Used by HR + Calendar. */
export async function listLeavesInRange(
  startDate: string,
  endDate: string,
  options?: { userIds?: string[] }
): Promise<LeaveWithUser[]> {
  const adminClient = createAdminClient()
  let query = adminClient
    .from('leaves')
    .select('*')
    .eq('status', 'active')
    .lte('start_date', endDate)
    .gte('end_date', startDate)
    .order('start_date', { ascending: true })

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

  return leaves.map((l) => ({
    ...l,
    user_full_name: nameMap.get(l.user_id) ?? 'Unknown',
  }))
}

/** Active leaves covering today across the org. */
export async function listLeavesToday(): Promise<LeaveWithUser[]> {
  const today = new Date().toISOString().split('T')[0]
  return listLeavesInRange(today, today)
}

/** Upcoming leaves in next N days for given user_ids. */
export async function listUpcomingLeaves(
  daysAhead: number,
  userIds?: string[]
): Promise<LeaveWithUser[]> {
  const today = new Date()
  const future = new Date(today.getTime() + daysAhead * 86400000)
  const todayStr = today.toISOString().split('T')[0]
  const futureStr = future.toISOString().split('T')[0]
  return listLeavesInRange(todayStr, futureStr, { userIds })
}
