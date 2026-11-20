import { createAdminClient } from '@/lib/supabase/admin'
import type { Tables } from '@/lib/supabase/database.types'

export async function listMyNotifications(
  userId: string,
  limit = 50
): Promise<Tables<'notifications'>[]> {
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}
