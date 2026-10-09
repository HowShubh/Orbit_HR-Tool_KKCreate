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

export async function listCompoffForUser(userId: string): Promise<Tables<'compoff_grants'>[]> {
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('compoff_grants')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function listCompoffPendingForApprover(approverId: string): Promise<Tables<'compoff_grants'>[]> {
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('compoff_grants')
    .select('*')
    .eq('manager_id', approverId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  return data ?? []
}

/** Count of pending comp-off grants awaiting this approver's decision. */
export async function countCompoffPendingForApprover(approverId: string): Promise<number> {
  const adminClient = createAdminClient()
  const { count } = await adminClient
    .from('compoff_grants')
    .select('id', { count: 'exact', head: true })
    .eq('manager_id', approverId)
    .eq('status', 'pending')
  return count ?? 0
}
