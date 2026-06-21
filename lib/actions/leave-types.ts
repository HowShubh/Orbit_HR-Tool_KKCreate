'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCapability, writeAudit } from './_helpers'
import { ActionError } from './errors'
import {
  COMPOFF_YEAR,
  CURRENT_LEAVE_YEAR,
  slugifyLeaveTypeKey,
  type LeaveTypeCategory,
} from '@/lib/leave-types'
import type { Tables } from '@/lib/supabase/database.types'

const CategorySchema = z.enum(['leave', 'wfh', 'compoff_leave', 'compoff_wfh'])
const EligibilityModeSchema = z.enum(['all', 'selected'])

const CreateLeaveTypeSchema = z.object({
  key: z.string().trim().min(1).max(48).optional(),
  name: z.string().trim().min(2).max(80),
  category: CategorySchema,
  annual_quota: z.number().min(0).max(365).optional(),
  monthly_quota: z.number().min(0).max(31).nullable().optional(),
  eligibility_mode: EligibilityModeSchema.default('all'),
  eligible_user_ids: z.array(z.string().uuid()).default([]),
  is_active: z.boolean().default(true),
})

const UpdateLeaveTypeSchema = z.object({
  key: z.string().trim().min(1).max(48),
  name: z.string().trim().min(2).max(80).optional(),
  category: CategorySchema.optional(),
  annual_quota: z.number().min(0).max(365).optional(),
  monthly_quota: z.number().min(0).max(31).nullable().optional(),
  eligibility_mode: EligibilityModeSchema.optional(),
  eligible_user_ids: z.array(z.string().uuid()).optional(),
  is_active: z.boolean().optional(),
})

function yearForCategory(category: LeaveTypeCategory) {
  return category === 'compoff_leave' || category === 'compoff_wfh'
    ? COMPOFF_YEAR
    : CURRENT_LEAVE_YEAR
}

async function syncEligibility(
  adminClient: ReturnType<typeof createAdminClient>,
  key: string,
  mode: 'all' | 'selected',
  eligibleUserIds: string[]
) {
  await adminClient
    .from('user_leave_type_eligibility')
    .delete()
    .eq('leave_type_key', key)

  if (mode !== 'selected' || eligibleUserIds.length === 0) return

  const rows = Array.from(new Set(eligibleUserIds)).map((userId) => ({
    user_id: userId,
    leave_type_key: key,
  }))

  const { error } = await adminClient
    .from('user_leave_type_eligibility')
    .insert(rows)

  if (error) throw new ActionError(error.message)
}

async function seedMissingBalances(
  adminClient: ReturnType<typeof createAdminClient>,
  policy: Pick<Tables<'leave_types'>, 'key' | 'category' | 'annual_quota' | 'eligibility_mode'>,
  eligibleUserIds: string[]
) {
  const { data: activeUsers } = await adminClient
    .from('users')
    .select('id')
    .eq('status', 'active')

  const targetUserIds =
    policy.eligibility_mode === 'selected'
      ? eligibleUserIds
      : (activeUsers ?? []).map((user) => user.id)

  const uniqueUserIds = Array.from(new Set(targetUserIds))
  if (uniqueUserIds.length === 0) return

  const leaveYear = yearForCategory(policy.category)
  const { data: existing } = await adminClient
    .from('leave_balances')
    .select('user_id')
    .eq('type', policy.key)
    .eq('leave_year', leaveYear)
    .in('user_id', uniqueUserIds)

  const existingUserIds = new Set((existing ?? []).map((row) => row.user_id))
  const rows = uniqueUserIds
    .filter((userId) => !existingUserIds.has(userId))
    .map((userId) => ({
      user_id: userId,
      leave_year: leaveYear,
      type: policy.key,
      allocated: Number(policy.annual_quota ?? 0),
      used: 0,
    }))

  if (rows.length === 0) return

  const { error } = await adminClient.from('leave_balances').insert(rows)
  if (error) throw new ActionError(error.message)
}

export async function createLeaveType(input: z.infer<typeof CreateLeaveTypeSchema>) {
  const actor = await requireCapability('edit_balance')
  const parsed = CreateLeaveTypeSchema.parse(input)
  const adminClient = createAdminClient()
  const key = slugifyLeaveTypeKey(parsed.key ?? parsed.name)

  if (!key) throw new ActionError('Leave type key is required.')

  const { data, error } = await adminClient
    .from('leave_types')
    .insert({
      key,
      name: parsed.name,
      category: parsed.category,
      annual_quota: parsed.annual_quota ?? 0,
      monthly_quota: parsed.monthly_quota ?? null,
      eligibility_mode: parsed.eligibility_mode,
      is_active: parsed.is_active,
      is_system: false,
    })
    .select()
    .single()

  if (error || !data) {
    throw new ActionError(error?.message ?? 'Create leave type failed')
  }

  await syncEligibility(
    adminClient,
    key,
    parsed.eligibility_mode,
    parsed.eligible_user_ids
  )
  await seedMissingBalances(adminClient, data, parsed.eligible_user_ids)

  await writeAudit(actor.id, 'leave_type.create', 'leave_type', key, { after: data })
  revalidatePath('/', 'layout')
  return data
}

export async function updateLeaveType(input: z.infer<typeof UpdateLeaveTypeSchema>) {
  const actor = await requireCapability('edit_balance')
  const parsed = UpdateLeaveTypeSchema.parse(input)
  const adminClient = createAdminClient()

  const { data: before } = await adminClient
    .from('leave_types')
    .select('*')
    .eq('key', parsed.key)
    .maybeSingle()

  if (!before) throw new ActionError('Leave type not found')

  const { data: currentEligibility } = await adminClient
    .from('user_leave_type_eligibility')
    .select('user_id')
    .eq('leave_type_key', parsed.key)
  const effectiveEligibleUserIds =
    parsed.eligible_user_ids ?? (currentEligibility ?? []).map((row) => row.user_id)

  const update = {
    name: parsed.name ?? before.name,
    category: parsed.category ?? before.category,
    annual_quota: parsed.annual_quota ?? before.annual_quota,
    monthly_quota: parsed.monthly_quota === undefined ? before.monthly_quota : parsed.monthly_quota,
    eligibility_mode: parsed.eligibility_mode ?? before.eligibility_mode,
    is_active: parsed.is_active ?? before.is_active,
  }

  const { data, error } = await adminClient
    .from('leave_types')
    .update(update)
    .eq('key', parsed.key)
    .select()
    .single()

  if (error || !data) {
    throw new ActionError(error?.message ?? 'Update leave type failed')
  }

  const shouldSyncEligibility =
    parsed.eligible_user_ids !== undefined || parsed.eligibility_mode !== undefined

  if (shouldSyncEligibility) {
    await syncEligibility(
      adminClient,
      parsed.key,
      update.eligibility_mode,
      effectiveEligibleUserIds
    )
  }

  if (data.is_active) {
    const eligibleUserIds =
      update.eligibility_mode === 'selected'
        ? effectiveEligibleUserIds
        : []

    await seedMissingBalances(
      adminClient,
      data,
      eligibleUserIds
    )
  }

  await writeAudit(actor.id, 'leave_type.update', 'leave_type', parsed.key, {
    before,
    after: data,
  })
  revalidatePath('/', 'layout')
  return data
}

/**
 * Delete a custom leave type. Blocked for system types and for any type that
 * already has leave entries (deleting would lose history — deactivate instead).
 * Unused balance rows + eligibility for the type are cleaned up first.
 */
export async function deleteLeaveType(key: string) {
  const actor = await requireCapability('edit_balance')
  const adminClient = createAdminClient()

  const { data: type } = await adminClient
    .from('leave_types')
    .select('*')
    .eq('key', key)
    .maybeSingle()

  if (!type) throw new ActionError('Leave type not found')
  if (type.is_system) {
    throw new ActionError('Built-in leave types cannot be deleted. You can deactivate them instead.')
  }

  // Block if any leave entries reference this type (as taken or as requested).
  const { count: leaveCount } = await adminClient
    .from('leaves')
    .select('id', { count: 'exact', head: true })
    .or(`type.eq.${key},requested_type.eq.${key}`)

  if (leaveCount && leaveCount > 0) {
    throw new ActionError(
      `“${type.name}” is used by ${leaveCount} leave ${leaveCount === 1 ? 'entry' : 'entries'} and can’t be deleted without losing that history. Deactivate it instead to hide it from new requests.`
    )
  }

  // Safe to remove: clear its (unused) balance rows, then the type itself.
  // user_leave_type_eligibility cascades on the leave_types delete.
  await adminClient.from('leave_balances').delete().eq('type', key)

  const { error } = await adminClient.from('leave_types').delete().eq('key', key)
  if (error) throw new ActionError(error.message)

  await writeAudit(actor.id, 'leave_type.delete', 'leave_type', key, { before: type })
  revalidatePath('/', 'layout')
}
