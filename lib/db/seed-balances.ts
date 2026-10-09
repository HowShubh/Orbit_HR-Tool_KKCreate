import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { DEFAULT_LEAVE_TYPES } from '@/lib/leave-types'

const COMPOFF_YEAR = 0

type AdminClient = SupabaseClient<Database>

/**
 * KK Create's fiscal year runs Jun 1 → May 31.
 * Pass the FY's starting calendar year (e.g., 2026 for FY 2026-27).
 */
export function getFYBounds(fyStartYear: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(fyStartYear, 5, 1)), // June = month index 5
    end: new Date(Date.UTC(fyStartYear + 1, 4, 31)), // May = month index 4
  }
}

/**
 * Pro-rate annual leave allocation based on join date within an FY.
 * Per-month pro-rating where the join month counts as a full month.
 *
 * Examples for FY 2026-27 (annual = 18):
 *   - Joined Jun 2026  → 12/12 →  18.0
 *   - Joined Jul 2026  → 11/12 →  16.5
 *   - Joined Aug 2026  → 10/12 →  15.0
 *   - Joined Mar 2027  →  3/12 →   4.5
 *   - Joined May 2027  →  1/12 →   1.5
 *   - Joined before FY → full
 *   - Joined after  FY → 0
 */
export function proratedAllocation(
  annualDays: number,
  joinedAt: string | Date,
  fyStartYear: number
): number {
  const join = typeof joinedAt === 'string' ? new Date(joinedAt) : joinedAt
  const { start, end } = getFYBounds(fyStartYear)

  if (join.getTime() <= start.getTime()) return annualDays
  if (join.getTime() > end.getTime()) return 0

  const joinAbs = join.getUTCFullYear() * 12 + join.getUTCMonth()
  const endAbs = end.getUTCFullYear() * 12 + end.getUTCMonth()
  const monthsRemaining = endAbs - joinAbs + 1 // join month counts as full

  return Math.round((annualDays * monthsRemaining) / 12 * 2) / 2 // nearest 0.5
}

/**
 * Insert default balance rows for a new user, pro-rated against their join date.
 * Idempotent via UPSERT.
 *
 * Compoff types start at 0 because they're earned through extra work,
 * not allocated annually. They live in `leave_year = 0` (sentinel for
 * "non-yearly compoff balances").
 */
export async function seedDefaultBalances(
  adminClient: AdminClient,
  userId: string,
  fyStartYear: number,
  joinedAt: string | Date
): Promise<void> {
  const [{ data: leaveTypes, error }, { data: eligibility }] = await Promise.all([
    adminClient
      .from('leave_types')
      .select('key, category, annual_quota, eligibility_mode, is_active')
      .eq('is_active', true),
    adminClient
      .from('user_leave_type_eligibility')
      .select('leave_type_key')
      .eq('user_id', userId),
  ])

  const eligibleKeys = new Set((eligibility ?? []).map((row) => row.leave_type_key))
  const policies =
    error || !leaveTypes || leaveTypes.length === 0
      ? DEFAULT_LEAVE_TYPES
      : leaveTypes

  const rows = policies
    .filter(
      (policy) =>
        policy.eligibility_mode === 'all' ||
        eligibleKeys.has(policy.key)
    )
    .map((policy) => {
      const isCompoff = policy.category === 'compoff_leave' || policy.category === 'compoff_wfh'
      // Use the leave type's configured annual quota (set in HR Console → Leave
      // Types) as the default for every type, including the built-in Leave/WFH.
      // (Previously Leave/WFH were hardcoded to 18/36, so quota edits were ignored.)
      const annualQuota = Number(policy.annual_quota ?? 0)

      return {
        user_id: userId,
        leave_year: isCompoff ? COMPOFF_YEAR : fyStartYear,
        type: policy.key,
        // Compoff is earned, not allocated — it starts at 0 and isn't pro-rated.
        allocated: isCompoff
          ? annualQuota
          : proratedAllocation(annualQuota, joinedAt, fyStartYear),
        used: 0,
      }
    })

  await adminClient
    .from('leave_balances')
    .upsert(rows, { onConflict: 'user_id,leave_year,type' })
}
