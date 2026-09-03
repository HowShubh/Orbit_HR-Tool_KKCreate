import type { Tables } from '@/lib/supabase/database.types'
import { currentFiscalYearStart } from '@/lib/date'

export type LeaveTypeCategory = Tables<'leave_types'>['category']
export type LeaveTypePolicy = Tables<'leave_types'> & {
  eligible_user_ids?: string[]
}

/**
 * Current fiscal-year start (e.g. 2026 = FY 2026-2027). Derived from today's IST
 * date — never hardcode the year. Prefer calling `currentFiscalYearStart()`
 * directly in request handlers; this constant is a convenience for modules that
 * just need "the current FY".
 */
export const CURRENT_LEAVE_YEAR = currentFiscalYearStart()
export const COMPOFF_YEAR = 0

export const DEFAULT_LEAVE_TYPES: LeaveTypePolicy[] = [
  {
    key: 'leave',
    name: 'Leave',
    public_name: 'Leave',
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
    public_name: 'WFH',
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
    public_name: 'Comp-off Leave',
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
    public_name: 'Comp-off WFH',
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

/**
 * The policy's private name — what the person taking the leave calls it.
 *
 * Only for surfaces the owner themselves is looking at, plus the HR console
 * (settings, balances, applying on behalf). Everything that reports someone's
 * leave to anybody else must use `leaveTypePublicLabel`, or a policy like a
 * menstrual leave is broadcast the moment it is approved.
 */
export function leaveTypeLabel(typeKey: string, policies?: Iterable<Pick<LeaveTypePolicy, 'key' | 'name'>>) {
  for (const policy of policies ?? []) {
    if (policy.key === typeKey) return policy.name
  }
  return DEFAULT_LEAVE_TYPE_BY_KEY.get(typeKey)?.name ?? humanizeLeaveType(typeKey)
}

/**
 * The policy's public name — what everyone who is not the owner sees, on the
 * calendar, in approval queues, in notifications and in Slack.
 *
 * `policies` is required rather than optional on purpose. Without them there is
 * no way to know a type's public name, and the private fallback used above
 * (`humanizeLeaveType`) would turn the key `menstrual_leave` straight back into
 * "Menstrual Leave". An unknown key falls back to the most generic label there
 * is instead of anything derived from the key itself.
 */
export function leaveTypePublicLabel(
  typeKey: string,
  policies: Iterable<Pick<LeaveTypePolicy, 'key' | 'public_name'>>
): string {
  for (const policy of policies) {
    if (policy.key === typeKey) return policy.public_name
  }
  return DEFAULT_LEAVE_TYPE_BY_KEY.get(typeKey)?.public_name ?? 'Leave'
}

/** Pick the name that suits whoever is looking. */
export function leaveTypeLabelFor(
  typeKey: string,
  policies: Iterable<Pick<LeaveTypePolicy, 'key' | 'name' | 'public_name'>>,
  canSeePrivateName: boolean
): string {
  return canSeePrivateName
    ? leaveTypeLabel(typeKey, policies)
    : leaveTypePublicLabel(typeKey, policies)
}

/**
 * A policy is private when HR gave it a public name that differs from its own.
 * Used to keep its balance bucket off other people's screens — the bucket is a
 * disclosure even when the label on it is neutral.
 *
 * An unknown key counts as private: only the four built-ins are known to be
 * safe, so a missing policy list can never expose a custom bucket.
 */
export function isPrivateLeaveType(
  typeKey: string,
  policies: Iterable<Pick<LeaveTypePolicy, 'key' | 'name' | 'public_name'>>
): boolean {
  for (const policy of policies) {
    if (policy.key === typeKey) return policy.public_name !== policy.name
  }
  return !DEFAULT_LEAVE_TYPE_BY_KEY.has(typeKey)
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

/**
 * Prepare a policy list for a non-HR browser.
 *
 * Two things leak a private policy just as loudly as its name on the calendar:
 * the private-to-public name mapping, and the roster of who is eligible for it.
 * Both are stripped here, so what reaches the client is:
 *
 *  - policies the person can apply for: their real name, since that is what the
 *    person picks from, and an eligibility list holding only themselves;
 *  - every other policy: the public name and an empty eligibility list.
 *
 * The HR console is the one place that gets the unredacted list, because that is
 * where the two names are configured.
 */
export function redactLeaveTypesForUser(
  policies: LeaveTypePolicy[],
  userId: string
): LeaveTypePolicy[] {
  return policies.map((policy) => {
    const eligible = isEligibleForPolicy(policy, userId)
    return {
      ...policy,
      name: eligible ? policy.name : policy.public_name,
      eligible_user_ids: eligible ? [userId] : [],
    }
  })
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
