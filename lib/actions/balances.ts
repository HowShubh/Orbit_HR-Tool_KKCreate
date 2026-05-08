'use server'

import { ActionError } from './errors'

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  requireCapability,
  revalidateHR,
  writeAudit,
} from './_helpers'

const BalanceSchema = z.object({
  user_id: z.string().uuid(),
  leave_year: z.number().int(),
  type: z.string().trim().min(1),
  allocated: z.number(),
  used: z.number().optional(),
})

export async function upsertBalance(input: z.infer<typeof BalanceSchema>) {
  const actor = await requireCapability('edit_balance')
  const parsed = BalanceSchema.parse(input)

  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('leave_balances')
    .upsert(parsed, { onConflict: 'user_id,leave_year,type' })
    .select()
    .single()

  if (error) throw new ActionError(error.message)
  await writeAudit(actor.id, 'balance.upsert', 'leave_balance', data.id, {
    after: data,
  })
  await revalidateHR()
  return data
}
