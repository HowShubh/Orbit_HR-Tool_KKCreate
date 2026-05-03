'use server'

import { ActionError } from './errors'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  requireCapability,
  requireUser,
  revalidateHR,
  writeAudit,
} from './_helpers'
import { notifyUser } from './notifications'

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

  await notifyUser({
    user_id: grant.user_id,
    type: `compoff_${decision}`,
    title: decision === 'approved' ? 'Compoff approved' : 'Compoff rejected',
    body:
      decision === 'approved'
        ? `Your compoff request for ${grant.work_date} was approved (+${grant.amount} day(s)).`
        : `Your compoff request for ${grant.work_date} was rejected.`,
    link_url: '/leaves',
    related_entity_type: 'compoff_grant',
    related_entity_id: grantId,
  })

  revalidatePath('/')
  revalidatePath('/leaves')
  await revalidateHR()
  return after
}

const RequestCompoffSchema = z.object({
  type: z.enum(['compoff_wfh', 'compoff_leave']),
  amount: z.number().min(0.5).max(2),
  work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().min(1, 'Reason required'),
})

export async function requestCompoff(input: z.infer<typeof RequestCompoffSchema>) {
  const user = await requireUser()
  const parsed = RequestCompoffSchema.parse(input)

  // Cannot request compoff for a future date
  const today = new Date().toISOString().split('T')[0]
  if (parsed.work_date > today) {
    throw new ActionError('Compoff can only be requested for work you already did, not future dates.')
  }

  const adminClient = createAdminClient()

  // Determine approver: user's manager, falling back to HR
  let approverId: string | null = user.manager_id

  if (!approverId) {
    // No manager — find any HR/founder to approve
    const { data: hrUser } = await adminClient
      .from('users')
      .select('id')
      .in('role', ['hr', 'founder'])
      .eq('status', 'active')
      .neq('id', user.id)
      .limit(1)
      .maybeSingle()
    approverId = hrUser?.id ?? null
  }

  if (!approverId) {
    throw new ActionError('No approver available. Contact your founder or HR.')
  }

  const { data: grant, error } = await adminClient
    .from('compoff_grants')
    .insert({
      user_id: user.id,
      type: parsed.type,
      amount: parsed.amount,
      work_date: parsed.work_date,
      reason: parsed.reason,
      manager_id: approverId,
      status: 'pending',
    })
    .select()
    .single()

  if (error || !grant) throw new ActionError(error?.message ?? 'Request failed')

  await writeAudit(user.id, 'compoff.request', 'compoff_grant', grant.id, { after: grant })

  // Notify approver
  await notifyUser({
    user_id: approverId,
    type: 'compoff_request',
    title: 'New compoff request',
    body: `${user.full_name} requested ${parsed.amount} day(s) of ${parsed.type} for work done on ${parsed.work_date}.`,
    link_url: '/hr',
    related_entity_type: 'compoff_grant',
    related_entity_id: grant.id,
  })

  revalidatePath('/leaves')
  revalidatePath('/hr')
  return grant
}
