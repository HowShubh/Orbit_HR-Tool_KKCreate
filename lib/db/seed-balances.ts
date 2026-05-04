import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

export const DEFAULT_LEAVE_ALLOCATION = 18
export const DEFAULT_WFH_ALLOCATION = 36
const COMPOFF_YEAR = 0

type AdminClient = SupabaseClient<Database>

/**
 * Insert default balance rows for a user so their dashboard works immediately
 * after creation. Idempotent via UPSERT — safe to call repeatedly.
 *
 * Compoff types start at 0 because they're earned through extra work,
 * not allocated annually. They live in `leave_year = 0` (sentinel for
 * "non-yearly compoff balances").
 */
export async function seedDefaultBalances(
  adminClient: AdminClient,
  userId: string,
  leaveYear: number
): Promise<void> {
  const rows = [
    {
      user_id: userId,
      leave_year: leaveYear,
      type: 'leave' as const,
      allocated: DEFAULT_LEAVE_ALLOCATION,
      used: 0,
    },
    {
      user_id: userId,
      leave_year: leaveYear,
      type: 'wfh' as const,
      allocated: DEFAULT_WFH_ALLOCATION,
      used: 0,
    },
    {
      user_id: userId,
      leave_year: COMPOFF_YEAR,
      type: 'compoff_leave' as const,
      allocated: 0,
      used: 0,
    },
    {
      user_id: userId,
      leave_year: COMPOFF_YEAR,
      type: 'compoff_wfh' as const,
      allocated: 0,
      used: 0,
    },
  ]

  await adminClient
    .from('leave_balances')
    .upsert(rows, { onConflict: 'user_id,leave_year,type' })
}
