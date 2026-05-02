import { createAdminClient } from '@/lib/supabase/admin'
import type { Tables } from '@/lib/supabase/database.types'

export async function listCompoffGrants(): Promise<Tables<'compoff_grants'>[]> {
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('compoff_grants')
    .select('*')
    .order('created_at', { ascending: false })
  return data ?? []
}
