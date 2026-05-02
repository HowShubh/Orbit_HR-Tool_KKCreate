import { createAdminClient } from '@/lib/supabase/admin'
import type { Tables } from '@/lib/supabase/database.types'

export type CapabilityWithGrants = Tables<'capabilities'> & {
  grants: (Tables<'user_capabilities'> & { user_full_name: string })[]
}

export async function listCapabilities(): Promise<Tables<'capabilities'>[]> {
  const adminClient = createAdminClient()
  const { data } = await adminClient.from('capabilities').select('*').order('key')
  return data ?? []
}

export async function listBundles(): Promise<Tables<'capability_bundles'>[]> {
  const adminClient = createAdminClient()
  const { data } = await adminClient.from('capability_bundles').select('*').order('key')
  return data ?? []
}

export async function listUserCapabilities(): Promise<
  (Tables<'user_capabilities'> & { user_full_name: string; user_email: string })[]
> {
  const adminClient = createAdminClient()
  const { data: ucs } = await adminClient
    .from('user_capabilities')
    .select('*')
    .order('granted_at', { ascending: false })

  if (!ucs || ucs.length === 0) return []

  const userIds = Array.from(new Set(ucs.map((uc) => uc.user_id)))
  const { data: users } = await adminClient
    .from('users')
    .select('id, full_name, email')
    .in('id', userIds)
  const userMap = new Map((users ?? []).map((u) => [u.id, u]))

  return ucs.map((uc) => ({
    ...uc,
    user_full_name: userMap.get(uc.user_id)?.full_name ?? 'Unknown',
    user_email: userMap.get(uc.user_id)?.email ?? '',
  }))
}
