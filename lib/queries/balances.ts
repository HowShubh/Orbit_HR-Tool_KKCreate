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

/** Distinct fiscal years that have allocatable balance rows (excludes comp-off year 0). */
export async function listBalanceYears(): Promise<number[]> {
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('leave_balances')
    .select('leave_year')
    .neq('leave_year', 0)
  const years = Array.from(new Set((data ?? []).map((r) => r.leave_year)))
  return years.sort((a, b) => b - a)
}

export async function listCompoffBalances(): Promise<Tables<'leave_balances'>[]> {
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('leave_balances')
    .select('*')
    .eq('leave_year', 0)
  return data ?? []
}
