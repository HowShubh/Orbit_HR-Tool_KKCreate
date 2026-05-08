import type { Tables } from '@/lib/supabase/database.types'

export type LeaveTypeCategory = Tables<'leave_types'>['category']
export type LeaveTypePolicy = Tables<'leave_types'> & {
  eligible_user_ids?: string[]
}

export const CURRENT_LEAVE_YEAR = 2026
export const COMPOFF_YEAR = 0

export const DEFAULT_LEAVE_TYPES: LeaveTypePolicy[] = [
  {
    key: 'leave',
    name: 'Leave',
    category: 'leave',
    annual_quota: 18,
    monthly_quota: null,
    eligibility_mode: 'all',
    is_active: true,
    is_system: true,
    created_at: '',
    updated_at: '',
    eligible_user_ids: [],
  },
  {
    key: 'wfh',
    name: 'WFH',
    category: 'wfh',
    annual_quota: 36,
    monthly_quota: null,
    eligibility_mode: 'all',
    is_active: true,
    is_system: true,
    created_at: '',
    updated_at: '',
    eligible_user_ids: [],
  },
  {
    key: 'compoff_leave',
    name: 'Comp-off Leave',
    category: 'compoff_leave',
    annual_quota: 0,
    monthly_quota: null,
    eligibility_mode: 'all',
    is_active: true,
    is_system: true,
    created_at: '',
    updated_at: '',
    eligible_user_ids: [],
  },
  {
    key: 'compoff_wfh',
    name: 'Comp-off WFH',
    category: 'compoff_wfh',
    annual_quota: 0,
    monthly_quota: null,
    eligibility_mode: 'all',
    is_active: true,
    is_system: true,
    created_at: '',
    updated_at: '',
    eligible_user_ids: [],
  },
]

export const DEFAULT_LEAVE_TYPE_BY_KEY = new Map(
  DEFAULT_LEAVE_TYPES.map((type) => [type.key, type])
)

export function leaveTypeLabel(typeKey: string, policies?: Iterable<Pick<LeaveTypePolicy, 'key' | 'name'>>) {
  for (const policy of policies ?? []) {
    if (policy.key === typeKey) return policy.name
  }
  return DEFAULT_LEAVE_TYPE_BY_KEY.get(typeKey)?.name ?? humanizeLeaveType(typeKey)
}

export function leaveTypeCategory(
  typeKey: string,
  policies?: Iterable<Pick<LeaveTypePolicy, 'key' | 'category'>>
): LeaveTypeCategory {
  for (const policy of policies ?? []) {
    if (policy.key === typeKey) return policy.category
  }
  return DEFAULT_LEAVE_TYPE_BY_KEY.get(typeKey)?.category ?? 'leave'
}

export function leaveYearForCategory(category: LeaveTypeCategory) {
  return category === 'compoff_leave' || category === 'compoff_wfh'
    ? COMPOFF_YEAR
    : CURRENT_LEAVE_YEAR
}

export function leaveYearForType(
  typeKey: string,
  policies?: Iterable<Pick<LeaveTypePolicy, 'key' | 'category'>>
) {
  return leaveYearForCategory(leaveTypeCategory(typeKey, policies))
}

export function isSelectablePlanCategory(category: LeaveTypeCategory) {
  return (
    category === 'leave' ||
    category === 'wfh' ||
    category === 'compoff_leave' ||
    category === 'compoff_wfh'
  )
}

export function isAwayCategory(category: LeaveTypeCategory) {
  return category === 'leave' || category === 'compoff_leave'
}

export function isWfhCategory(category: LeaveTypeCategory) {
  return category === 'wfh' || category === 'compoff_wfh'
}

export function isEligibleForPolicy(policy: Pick<LeaveTypePolicy, 'eligibility_mode' | 'eligible_user_ids'>, userId: string) {
  return policy.eligibility_mode === 'all' || (policy.eligible_user_ids ?? []).includes(userId)
}

export function humanizeLeaveType(typeKey: string) {
  return typeKey
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function slugifyLeaveTypeKey(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}
