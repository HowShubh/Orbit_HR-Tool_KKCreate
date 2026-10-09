import { createAdminClient } from '@/lib/supabase/admin'
import {
  DEFAULT_LEAVE_TYPES,
  isEligibleForPolicy,
  type LeaveTypePolicy,
} from '@/lib/leave-types'

export async function listLeaveTypes(): Promise<LeaveTypePolicy[]> {
  const adminClient = createAdminClient()
  const [{ data: types, error }, { data: eligibility }] = await Promise.all([
    adminClient
      .from('leave_types')
      .select('*')
      .order('category', { ascending: true })
      .order('name', { ascending: true }),
    adminClient
      .from('user_leave_type_eligibility')
      .select('user_id, leave_type_key'),
  ])

  if (error || !types) return DEFAULT_LEAVE_TYPES

  const eligibleByType = new Map<string, string[]>()
  for (const row of eligibility ?? []) {
    const ids = eligibleByType.get(row.leave_type_key) ?? []
    ids.push(row.user_id)
    eligibleByType.set(row.leave_type_key, ids)
  }

  return types.map((type) => ({
    ...type,
    eligible_user_ids: eligibleByType.get(type.key) ?? [],
  }))
}

export async function listActiveLeaveTypesForUser(userId: string): Promise<LeaveTypePolicy[]> {
  const policies = await listLeaveTypes()
  return policies.filter(
    (policy) => policy.is_active && isEligibleForPolicy(policy, userId)
  )
}
