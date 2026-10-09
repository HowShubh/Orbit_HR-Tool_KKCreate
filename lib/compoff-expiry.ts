import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { todayIST } from '@/lib/date'

type AdminClient = SupabaseClient<Database>

/**
 * Comp-off grants expire 90 days after the work date (`expires_at`), but the
 * comp-off balance (`leave_balances`, leave_year 0) is a single running total
 * credited on approval by the `handle_compoff_approved` trigger. Nothing debited
 * the balance when a grant expired, so expired comp-off stayed spendable.
 *
 * This reconciles each comp-off balance against the user's grants, forfeiting
 * ONLY the expired days that weren't already used (FIFO — consumption is assumed
 * to draw down the oldest grants first, so expired-and-unused = the oldest days
 * that were never spent):
 *
 *   earnedEver     = Σ approved grant amounts (any expiry)
 *   expiredEarned  = Σ approved grant amounts where expires_at < today
 *   expiredUnused  = max(0, expiredEarned − used)
 *   allocated      = earnedEver − expiredUnused     (so remaining = allocated − used ≥ 0)
 *
 * Idempotent and safe to run repeatedly. Call it on the comp-off spend/read
 * paths (and/or from a nightly job) so balances reflect expiry at the point of use.
 */
export async function reconcileCompoffExpiry(
  adminClient: AdminClient,
  userId: string
): Promise<void> {
  const today = todayIST()

  const { data: grants } = await adminClient
    .from('compoff_grants')
    .select('type, amount, expires_at')
    .eq('user_id', userId)
    .eq('status', 'approved')

  if (!grants || grants.length === 0) return

  const agg = new Map<string, { earnedEver: number; expiredEarned: number }>()
  for (const g of grants) {
    const entry = agg.get(g.type) ?? { earnedEver: 0, expiredEarned: 0 }
    entry.earnedEver += Number(g.amount)
    if (g.expires_at && g.expires_at < today) entry.expiredEarned += Number(g.amount)
    agg.set(g.type, entry)
  }

  const { data: balances } = await adminClient
    .from('leave_balances')
    .select('id, type, allocated, used')
    .eq('user_id', userId)
    .eq('leave_year', 0)

  for (const bal of balances ?? []) {
    const entry = agg.get(bal.type)
    if (!entry) continue
    const used = Number(bal.used)
    const expiredUnused = Math.max(0, entry.expiredEarned - used)
    const newAllocated = entry.earnedEver - expiredUnused
    if (newAllocated !== Number(bal.allocated)) {
      await adminClient
        .from('leave_balances')
        .update({ allocated: newAllocated })
        .eq('id', bal.id)
    }
  }
}

/**
 * Reconcile comp-off expiry for everyone who has ever had an approved comp-off
 * grant. Intended for a nightly job so HR's global balances stay correct without
 * waiting for each user to open their planner. Returns the number of users processed.
 */
export async function reconcileAllCompoffExpiry(adminClient: AdminClient): Promise<number> {
  const { data: grants } = await adminClient
    .from('compoff_grants')
    .select('user_id')
    .eq('status', 'approved')

  const userIds = Array.from(new Set((grants ?? []).map((g) => g.user_id)))
  for (const userId of userIds) {
    await reconcileCompoffExpiry(adminClient, userId)
  }
  return userIds.length
}
