'use server'

import { ActionError } from './errors'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  requireCapability,
  revalidateHR,
  writeAudit,
} from './_helpers'
import { DEFAULT_LEAVE_TYPES } from '@/lib/leave-types'
import { currentFiscalYearStart } from '@/lib/date'

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

/**
 * Danger zone: delete every leave/WFH balance for a fiscal year and its reset
 * record — to undo an accidental reset. Refuses the CURRENT fiscal year (that's
 * live data everyone is using). Comp-off balances (year 0) are never touched.
 */
export async function deleteFiscalYearData(leaveYear: number) {
  const actor = await requireCapability('run_annual_reset')

  if (leaveYear === 0) {
    throw new ActionError('Comp-off balances are not tied to a fiscal year.')
  }
  if (leaveYear === currentFiscalYearStart()) {
    throw new ActionError(
      'You cannot delete the current fiscal year — that is live data in use. Adjust balances instead.'
    )
  }

  const adminClient = createAdminClient()

  const { count } = await adminClient
    .from('leave_balances')
    .select('id', { count: 'exact', head: true })
    .eq('leave_year', leaveYear)

  const { error: balErr } = await adminClient
    .from('leave_balances')
    .delete()
    .eq('leave_year', leaveYear)
  if (balErr) throw new ActionError(balErr.message)

  await adminClient.from('leave_year_resets').delete().eq('leave_year', leaveYear)

  await writeAudit(actor.id, 'fiscal_year.delete', 'leave_year_reset', actor.id, {
    after: { leave_year: leaveYear, balances_deleted: count ?? 0 },
  })
  await revalidateHR()
  return { deleted: count ?? 0 }
}
