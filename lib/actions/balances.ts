'use server'

import { ActionError } from './errors'

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { proratedAllocation } from '@/lib/db/seed-balances'
import type { Tables, Database } from '@/lib/supabase/database.types'
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

/** Read all leave-balance rows for a given fiscal year (HR/founder only). */
export async function fetchBalancesForYear(
  leaveYear: number
): Promise<Tables<'leave_balances'>[]> {
  await requireCapability('view_balance')
  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('leave_balances')
    .select('*')
    .eq('leave_year', leaveYear)
  if (error) throw new ActionError(error.message)
  return data ?? []
}

const ApplyQuotasSchema = z.object({
  leaveYear: z.number().int(),
  prorate: z.boolean(),
})

/**
 * Bulk-apply each active leave type's configured annual quota to every active
 * user's balance for the given fiscal year. Leave/WFH (and custom allocatable)
 * types only — comp-off is earned, not allocated, so it's left untouched.
 *
 * `used` is PRESERVED (this is not an annual reset — it doesn't zero usage).
 * When `prorate` is true, each person's allocation is pro-rated by their join
 * date within that FY (matching new-hire onboarding); otherwise the full quota
 * is applied. Per-person manual edits in the Balances tab are overwritten.
 */
export async function applyQuotasToYear(input: z.infer<typeof ApplyQuotasSchema>) {
  const actor = await requireCapability('edit_balance')
  const { leaveYear, prorate } = ApplyQuotasSchema.parse(input)
  const adminClient = createAdminClient()

  const [usersRes, typesRes, eligRes, existingRes] = await Promise.all([
    adminClient.from('users').select('id, joined_at').eq('status', 'active'),
    adminClient
      .from('leave_types')
      .select('key, category, annual_quota, eligibility_mode')
      .eq('is_active', true)
      .in('category', ['leave', 'wfh'] as unknown as ('leave' | 'wfh')[]),
    adminClient.from('user_leave_type_eligibility').select('user_id, leave_type_key'),
    adminClient.from('leave_balances').select('user_id, type, used').eq('leave_year', leaveYear),
  ])

  const users = usersRes.data ?? []
  const types = typesRes.data ?? []
  if (users.length === 0) throw new ActionError('No active users')
  if (types.length === 0) throw new ActionError('No active leave/WFH types to apply')

  const eligByType = new Map<string, Set<string>>()
  for (const e of eligRes.data ?? []) {
    if (!eligByType.has(e.leave_type_key)) eligByType.set(e.leave_type_key, new Set())
    eligByType.get(e.leave_type_key)!.add(e.user_id)
  }
  const usedByKey = new Map<string, number>()
  for (const b of existingRes.data ?? []) usedByKey.set(`${b.user_id}:${b.type}`, b.used)

  const rows: Database['public']['Tables']['leave_balances']['Insert'][] = []
  for (const u of users) {
    for (const t of types) {
      if (t.eligibility_mode === 'selected' && !eligByType.get(t.key)?.has(u.id)) continue
      const quota = Number(t.annual_quota ?? 0)
      rows.push({
        user_id: u.id,
        leave_year: leaveYear,
        type: t.key,
        allocated: prorate ? proratedAllocation(quota, u.joined_at, leaveYear) : quota,
        used: usedByKey.get(`${u.id}:${t.key}`) ?? 0,
      })
    }
  }

  if (rows.length === 0) throw new ActionError('Nothing to apply')

  const { error } = await adminClient
    .from('leave_balances')
    .upsert(rows, { onConflict: 'user_id,leave_year,type' })
  if (error) throw new ActionError(error.message)

  // Year-scoped event — use the actor's id as a valid UUID entity reference.
  await writeAudit(actor.id, 'balance.apply_quotas', 'leave_balance', actor.id, {
    after: { leaveYear, prorate, rowsUpdated: rows.length, users: users.length },
  })
  await revalidateHR()
  return { updated: rows.length, users: users.length }
}
