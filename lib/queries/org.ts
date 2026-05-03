import { createAdminClient } from '@/lib/supabase/admin'
import type { Tables } from '@/lib/supabase/database.types'

export type OrgNode = {
  user: Tables<'users'>
  reports: OrgNode[]
}

export async function getOrgTree(): Promise<OrgNode[]> {
  const adminClient = createAdminClient()
  const { data: users } = await adminClient
    .from('users')
    .select('*')
    .eq('status', 'active')
    .order('full_name', { ascending: true })

  if (!users || users.length === 0) return []

  const byManager = new Map<string | null, Tables<'users'>[]>()
  for (const u of users) {
    const key = u.manager_id ?? null
    if (!byManager.has(key)) byManager.set(key, [])
    byManager.get(key)!.push(u)
  }

  function build(userId: string | null): OrgNode[] {
    return (byManager.get(userId) ?? []).map((u) => ({
      user: u,
      reports: build(u.id),
    }))
  }

  return build(null)
}
