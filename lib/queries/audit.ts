import { createAdminClient } from '@/lib/supabase/admin'
import type { Tables } from '@/lib/supabase/database.types'

export type AuditEntryWithActor = Tables<'audit_log'> & {
  actor_full_name: string
}

export async function listAuditEntries(limit = 200): Promise<AuditEntryWithActor[]> {
  const adminClient = createAdminClient()
  const { data: entries } = await adminClient
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!entries || entries.length === 0) return []

  const actorIds = Array.from(new Set(entries.map((e) => e.actor_id)))
  const { data: actors } = await adminClient
    .from('users')
    .select('id, full_name')
    .in('id', actorIds)
  const actorMap = new Map((actors ?? []).map((a) => [a.id, a.full_name]))

  return entries.map((e) => ({
    ...e,
    actor_full_name: actorMap.get(e.actor_id) ?? 'Unknown',
  }))
}
