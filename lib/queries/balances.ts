import { createAdminClient } from '@/lib/supabase/admin'
import type { Tables } from '@/lib/supabase/database.types'

export async function listBalancesForYear(
  leaveYear: number
): Promise<Tables<'leave_balances'>[]> {
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('leave_balances')
    .select('*')
    .eq('leave_year', leaveYear)
  return data ?? []
}

export async function listCompoffBalances(): Promise<Tables<'leave_balances'>[]> {
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('leave_balances')
    .select('*')
    .eq('leave_year', 0)
  return data ?? []
}
