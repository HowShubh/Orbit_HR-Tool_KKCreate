import { createAdminClient } from '@/lib/supabase/admin'
import type { Tables } from '@/lib/supabase/database.types'

export async function listHolidays(): Promise<Tables<'holidays'>[]> {
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('holidays')
    .select('*')
    .order('date', { ascending: true })
  return data ?? []
}
