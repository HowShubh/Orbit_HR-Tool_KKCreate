import { createAdminClient } from '@/lib/supabase/admin'
import type { Tables } from '@/lib/supabase/database.types'

export type AuditEntryWithActor = Tables<'audit_log'> & {
  actor_full_name: string
  // The person the action is *about* (whose leave/comp-off/profile), resolved
  // from the diff or the entity id. Null for bulk/system actions with no subject.
  subject_user_id: string | null
  subject_full_name: string | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Dig a user_id out of a diff node (the stored row(s)). Handles the shapes our
// writeAudit calls use: a plain row, a { request, leaves } object, or an array
// of leave rows.
function pickUserId(node: unknown): string | null {
  if (Array.isArray(node)) {
    const first = node[0] as Record<string, unknown> | undefined
    return first && typeof first.user_id === 'string' ? first.user_id : null
  }
  if (!node || typeof node !== 'object') return null
  const o = node as Record<string, unknown>
  if (typeof o.user_id === 'string') return o.user_id
  const req = o.request as Record<string, unknown> | undefined
  if (req && typeof req.user_id === 'string') return req.user_id
  const leaves = o.leaves as Array<Record<string, unknown>> | undefined
  if (Array.isArray(leaves) && leaves[0] && typeof leaves[0].user_id === 'string') {
    return leaves[0].user_id
  }
  return null
}

function subjectUserId(entry: Tables<'audit_log'>): string | null {
  const diff = entry.diff as { after?: unknown; before?: unknown } | null
  if (diff && typeof diff === 'object') {
    return (
      pickUserId(diff.after) ??
      pickUserId(diff.before) ??
      (entry.entity_type === 'user' && entry.entity_id && UUID_RE.test(entry.entity_id)
        ? entry.entity_id
        : null)
    )
  }
  if (entry.entity_type === 'user' && entry.entity_id && UUID_RE.test(entry.entity_id)) {
    return entry.entity_id
  }
  return null
}

export async function listAuditEntries(limit = 200): Promise<AuditEntryWithActor[]> {
  const adminClient = createAdminClient()
  const { data: entries } = await adminClient
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!entries || entries.length === 0) return []

  const withSubject = entries.map((e) => ({ e, subjectId: subjectUserId(e) }))

  const ids = new Set<string>()
  for (const { e, subjectId } of withSubject) {
    ids.add(e.actor_id)
    if (subjectId) ids.add(subjectId)
  }

  const { data: users } = await adminClient
    .from('users')
    .select('id, full_name')
    .in('id', Array.from(ids))
  const nameMap = new Map((users ?? []).map((u) => [u.id, u.full_name]))

  return withSubject.map(({ e, subjectId }) => ({
    ...e,
    actor_full_name: nameMap.get(e.actor_id) ?? 'Unknown',
    subject_user_id: subjectId,
    subject_full_name: subjectId ? nameMap.get(subjectId) ?? null : null,
  }))
}
