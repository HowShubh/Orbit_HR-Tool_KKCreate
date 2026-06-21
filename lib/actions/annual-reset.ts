'use server'

import { ActionError } from './errors'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  requireCapability,
  revalidateHR,
  writeAudit,
} from './_helpers'
import { DEFAULT_LEAVE_TYPES } from '@/lib/leave-types'

export async function runAnnualReset(leaveYear: number) {
  const actor = await requireCapability('run_annual_reset')
  const adminClient = createAdminClient()

  const { data: existing } = await adminClient
    .from('leave_year_resets')
    .select('id')
    .eq('leave_year', leaveYear)
    .maybeSingle()

  if (existing) {
    throw new ActionError(`Annual reset for ${leaveYear} already ran`)
  }

  const { data: users } = await adminClient
    .from('users')
    .select('id')
    .eq('status', 'active')

  if (!users || users.length === 0) {
    throw new ActionError('No active users to reset')
  }

  const [{ data: leaveTypes }, { data: eligibility }] = await Promise.all([
    adminClient
      .from('leave_types')
      .select('key, category, annual_quota, eligibility_mode, is_active')
      .in('category', ['leave', 'wfh'])
      .eq('is_active', true),
    adminClient
      .from('user_leave_type_eligibility')
      .select('user_id, leave_type_key'),
  ])

  const activePolicies =
    leaveTypes && leaveTypes.length > 0
      ? leaveTypes
      : DEFAULT_LEAVE_TYPES.filter((type) => type.category === 'leave' || type.category === 'wfh')

  const eligibleByType = new Map<string, Set<string>>()
  for (const row of eligibility ?? []) {
    const ids = eligibleByType.get(row.leave_type_key) ?? new Set<string>()
    ids.add(row.user_id)
    eligibleByType.set(row.leave_type_key, ids)
  }

  const rows = users.flatMap((user) =>
    activePolicies
      .filter(
        (policy) =>
          policy.eligibility_mode === 'all' ||
          eligibleByType.get(policy.key)?.has(user.id)
      )
      .map((policy) => ({
        user_id: user.id,
        leave_year: leaveYear,
        type: policy.key,
        allocated: Number(policy.annual_quota ?? 0),
        used: 0,
      }))
  )

  if (rows.length === 0) {
    throw new ActionError('No active leave policies to reset')
  }

  const { error } = await adminClient
    .from('leave_balances')
    .upsert(rows, { onConflict: 'user_id,leave_year,type' })

  if (error) throw new ActionError(error.message)

  await adminClient.from('leave_year_resets').insert({
    leave_year: leaveYear,
    triggered_by: actor.id,
  })

  // entity_id must be a UUID — use the actor's id and record the year in the diff.
  await writeAudit(actor.id, 'annual_reset.run', 'leave_year_reset', actor.id, {
    after: { leave_year: leaveYear, users: users.length },
  })
  await revalidateHR()
  return { resetCount: users.length }
}
