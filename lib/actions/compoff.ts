'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  ActionError,
  requireCapability,
  revalidateHR,
  writeAudit,
} from './_helpers'

export async function decideCompoff(
  grantId: string,
  decision: 'approved' | 'rejected'
) {
  const adminClient = createAdminClient()
  const { data: grant } = await adminClient
    .from('compoff_grants')
    .select('*')
    .eq('id', grantId)
    .single()

  if (!grant) throw new ActionError('Compoff grant not found')

  const actor = await requireCapability('approve_compoff', grant.user_id)

  const { data: after, error } = await adminClient
    .from('compoff_grants')
    .update({
      status: decision,
      decided_at: new Date().toISOString(),
      decided_by: actor.id,
    })
    .eq('id', grantId)
    .select()
    .single()

  if (error) throw new ActionError(error.message)

  await writeAudit(actor.id, `compoff.${decision}`, 'compoff_grant', grantId, {
    before: grant,
    after,
  })
  await revalidateHR()
  return after
}
