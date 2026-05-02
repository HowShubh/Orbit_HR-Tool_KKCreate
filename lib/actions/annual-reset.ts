'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  ActionError,
  requireCapability,
  revalidateHR,
  writeAudit,
} from './_helpers'

const ANNUAL_DEFAULTS = {
  leave: 18,
  wfh: 36,
}

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

  const rows = users.flatMap((u) => [
    {
      user_id: u.id,
      leave_year: leaveYear,
      type: 'leave' as const,
      allocated: ANNUAL_DEFAULTS.leave,
      used: 0,
    },
    {
      user_id: u.id,
      leave_year: leaveYear,
      type: 'wfh' as const,
      allocated: ANNUAL_DEFAULTS.wfh,
      used: 0,
    },
  ])

  const { error } = await adminClient
    .from('leave_balances')
    .upsert(rows, { onConflict: 'user_id,leave_year,type' })

  if (error) throw new ActionError(error.message)

  await adminClient.from('leave_year_resets').insert({
    leave_year: leaveYear,
    triggered_by: actor.id,
  })

  await writeAudit(actor.id, 'annual_reset.run', 'leave_year_reset', String(leaveYear), {
    after: { leave_year: leaveYear, users: users.length },
  })
  await revalidateHR()
  return { resetCount: users.length }
}
