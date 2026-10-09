'use server'

import { ActionError } from './errors'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCapability, writeAudit } from './_helpers'
import { MANUALLY_GRANTABLE_CAPABILITIES, PERMISSIONS_READ_ONLY } from '@/lib/permissions-config'

const READ_ONLY_MESSAGE =
  'Permission management is read-only. Access is managed by roles — change a user’s role in HR Console → Users.'

const GrantSchema = z.object({
  user_id: z.string().uuid(),
  capability_key: z.string(),
  scope_type: z.enum(['self', 'users', 'teams', 'all']).nullable().optional(),
  scope_user_ids: z.array(z.string().uuid()).nullable().optional(),
  scope_team_ids: z.array(z.string().uuid()).nullable().optional(),
  note: z.string().nullable().optional(),
})

export async function grantCapability(input: z.infer<typeof GrantSchema>) {
  const parsed = GrantSchema.parse(input)
  // Read-only mode blocks manual grants EXCEPT for capabilities the app honors
  // end-to-end (see MANUALLY_GRANTABLE_CAPABILITIES in permissions-config).
  if (PERMISSIONS_READ_ONLY && !MANUALLY_GRANTABLE_CAPABILITIES.includes(parsed.capability_key)) {
    throw new ActionError(READ_ONLY_MESSAGE)
  }
  const actor = await requireCapability('manage_capabilities')

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
  revalidatePath('/', 'layout')
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
  if (PERMISSIONS_READ_ONLY && !MANUALLY_GRANTABLE_CAPABILITIES.includes(before.capability_key)) {
    throw new ActionError(READ_ONLY_MESSAGE)
  }
  if (before.source === 'role') {
    throw new ActionError("Cannot revoke role-derived capabilities directly. Change the user's role instead.")
  }

  const { error } = await adminClient.from('user_capabilities').delete().eq('id', id)
  if (error) throw new ActionError(error.message)

  await writeAudit(actor.id, 'capability.revoke', 'user_capability', id, { before })
  revalidatePath('/', 'layout')
}

export async function applyBundleToUser(input: { user_id: string; bundle_key: string }) {
  if (PERMISSIONS_READ_ONLY) throw new ActionError(READ_ONLY_MESSAGE)
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
  revalidatePath('/', 'layout')
}
