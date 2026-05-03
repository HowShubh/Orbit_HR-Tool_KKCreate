'use server'

import { ActionError } from './errors'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCapability, writeAudit } from './_helpers'

const GrantSchema = z.object({
  user_id: z.string().uuid(),
  capability_key: z.string(),
  scope_type: z.enum(['self', 'users', 'teams', 'all']).nullable().optional(),
  scope_user_ids: z.array(z.string().uuid()).nullable().optional(),
  scope_team_ids: z.array(z.string().uuid()).nullable().optional(),
  note: z.string().nullable().optional(),
})

export async function grantCapability(input: z.infer<typeof GrantSchema>) {
  const actor = await requireCapability('manage_capabilities')
  const parsed = GrantSchema.parse(input)

  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('user_capabilities')
    .insert({
      user_id: parsed.user_id,
      capability_key: parsed.capability_key,
      scope_type: parsed.scope_type ?? null,
      scope_user_ids: parsed.scope_user_ids ?? null,
      scope_team_ids: parsed.scope_team_ids ?? null,
      granted_by: actor.id,
      source: 'manual',
      note: parsed.note ?? null,
    })
    .select()
    .single()

  if (error || !data) throw new ActionError(error?.message ?? 'Grant failed')

  await writeAudit(actor.id, 'capability.grant', 'user_capability', data.id, {
    after: data,
  })
  revalidatePath('/permissions')
  return data
}

export async function revokeCapability(id: string) {
  const actor = await requireCapability('manage_capabilities')
  const adminClient = createAdminClient()

  const { data: before } = await adminClient
    .from('user_capabilities')
    .select('*')
    .eq('id', id)
    .single()

  if (!before) throw new ActionError('Capability grant not found')
  if (before.source === 'role') {
    throw new ActionError("Cannot revoke role-derived capabilities directly. Change the user's role instead.")
  }

  const { error } = await adminClient.from('user_capabilities').delete().eq('id', id)
  if (error) throw new ActionError(error.message)

  await writeAudit(actor.id, 'capability.revoke', 'user_capability', id, { before })
  revalidatePath('/permissions')
}

export async function applyBundleToUser(input: { user_id: string; bundle_key: string }) {
  const actor = await requireCapability('manage_capabilities')
  const adminClient = createAdminClient()

  const { error } = await adminClient.rpc('apply_bundle', {
    p_user_id: input.user_id,
    p_bundle_key: input.bundle_key,
    p_granted_by: actor.id,
    p_source: 'bundle',
  })

  if (error) throw new ActionError(error.message)

  await writeAudit(actor.id, 'bundle.apply', 'user', input.user_id, {
    after: { bundle: input.bundle_key },
  })
  revalidatePath('/permissions')
}
