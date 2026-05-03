'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  ActionError,
  requireCapability,
  requireUser,
  writeAudit,
} from './_helpers'
import { notifyUser } from './notifications'

const CURRENT_LEAVE_YEAR = 2026
const COMPOFF_YEAR = 0

const LeaveTypeSchema = z.enum(['wfh', 'leave', 'compoff_wfh', 'compoff_leave'])

const CreateLeaveSchema = z.object({
  user_id: z.string().uuid().optional(), // omit = self
  type: LeaveTypeSchema,
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  half_day_start: z.boolean().optional(),
  half_day_end: z.boolean().optional(),
  half_day_position: z.enum(['first_half', 'second_half']).nullable().optional(),
  reason: z.string().nullable().optional(),
})

function calcDays(input: z.infer<typeof CreateLeaveSchema>): number {
  const start = new Date(input.start_date)
  const end = new Date(input.end_date)
  const dayCount = Math.round((end.getTime() - start.getTime()) / 86400000) + 1
  let days = dayCount
  if (input.half_day_start) days -= 0.5
  if (input.half_day_end) days -= 0.5
  return Math.max(0.5, days)
}

async function getYearForType(type: z.infer<typeof LeaveTypeSchema>): Promise<number> {
  return type === 'compoff_wfh' || type === 'compoff_leave'
    ? COMPOFF_YEAR
    : CURRENT_LEAVE_YEAR
}

async function ensureNoOverlap(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  start: string,
  end: string,
  excludeLeaveId?: string
) {
  let q = adminClient
    .from('leaves')
    .select('id, start_date, end_date, type')
    .eq('user_id', userId)
    .eq('status', 'active')
    .lte('start_date', end)
    .gte('end_date', start)
  if (excludeLeaveId) q = q.neq('id', excludeLeaveId)

  const { data } = await q
  if (data && data.length > 0) {
    const first = data[0]
    throw new ActionError(
      `This leave overlaps an existing ${first.type} from ${first.start_date} to ${first.end_date}. Contact HR if you need this resolved.`
    )
  }
}

async function ensureBalance(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  type: z.infer<typeof LeaveTypeSchema>,
  daysNeeded: number
) {
  const year = await getYearForType(type)
  const { data: bal } = await adminClient
    .from('leave_balances')
    .select('allocated, used')
    .eq('user_id', userId)
    .eq('leave_year', year)
    .eq('type', type)
    .maybeSingle()

  const remaining = (bal?.allocated ?? 0) - (bal?.used ?? 0)
  if (remaining < daysNeeded) {
    throw new ActionError(
      `Insufficient ${type} balance: you have ${remaining} day(s) available but need ${daysNeeded}. Contact HR for help.`
    )
  }
}

async function bumpUsed(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  type: z.infer<typeof LeaveTypeSchema>,
  delta: number
) {
  const year = await getYearForType(type)
  const { data: bal } = await adminClient
    .from('leave_balances')
    .select('id, allocated, used')
    .eq('user_id', userId)
    .eq('leave_year', year)
    .eq('type', type)
    .maybeSingle()

  if (bal) {
    await adminClient
      .from('leave_balances')
      .update({ used: Number(bal.used) + delta })
      .eq('id', bal.id)
  } else {
    // Insert with allocated=0; this happens when HR creates on behalf and balance row missing
    await adminClient.from('leave_balances').insert({
      user_id: userId,
      leave_year: year,
      type,
      allocated: 0,
      used: delta,
    })
  }
}

export async function createMyLeave(input: z.infer<typeof CreateLeaveSchema>) {
  const user = await requireUser()
  const parsed = CreateLeaveSchema.parse(input)
  const targetUserId = user.id

  if (parsed.start_date > parsed.end_date) {
    throw new ActionError('End date must be on or after start date.')
  }

  // Self-create: must be a future leave (today or later)
  const today = new Date().toISOString().split('T')[0]
  if (parsed.start_date < today) {
    throw new ActionError('Leaves must start today or later. HR can backdate leaves on your behalf.')
  }

  const adminClient = createAdminClient()
  const days = calcDays(parsed)

  await ensureNoOverlap(adminClient, targetUserId, parsed.start_date, parsed.end_date)
  await ensureBalance(adminClient, targetUserId, parsed.type, days)

  const { data: leave, error } = await adminClient
    .from('leaves')
    .insert({
      user_id: targetUserId,
      type: parsed.type,
      start_date: parsed.start_date,
      end_date: parsed.end_date,
      half_day_start: parsed.half_day_start ?? false,
      half_day_end: parsed.half_day_end ?? false,
      half_day_position: parsed.half_day_position ?? null,
      reason: parsed.reason ?? null,
      days_deducted: days,
      created_by: user.id,
    })
    .select()
    .single()

  if (error || !leave) throw new ActionError(error?.message ?? 'Create leave failed')

  await bumpUsed(adminClient, targetUserId, parsed.type, days)
  await writeAudit(user.id, 'leave.create', 'leave', leave.id, { after: leave })

  revalidatePath('/')
  revalidatePath('/leaves')
  revalidatePath('/calendar')
  return leave
}

const CreateOnBehalfSchema = CreateLeaveSchema.extend({
  user_id: z.string().uuid(),
})

/** HR creates a leave for someone (with `edit_leaves`). Allows negative balance. */
export async function createLeaveOnBehalf(input: z.infer<typeof CreateOnBehalfSchema>) {
  const actor = await requireCapability('edit_leaves')
  const parsed = CreateOnBehalfSchema.parse(input)

  if (parsed.start_date > parsed.end_date) {
    throw new ActionError('End date must be on or after start date.')
  }

  const adminClient = createAdminClient()
  const days = calcDays(parsed)

  await ensureNoOverlap(adminClient, parsed.user_id, parsed.start_date, parsed.end_date)
  // No balance check — HR can let it go negative

  const { data: leave, error } = await adminClient
    .from('leaves')
    .insert({
      user_id: parsed.user_id,
      type: parsed.type,
      start_date: parsed.start_date,
      end_date: parsed.end_date,
      half_day_start: parsed.half_day_start ?? false,
      half_day_end: parsed.half_day_end ?? false,
      half_day_position: parsed.half_day_position ?? null,
      reason: parsed.reason ?? null,
      days_deducted: days,
      created_by: actor.id,
    })
    .select()
    .single()

  if (error || !leave) throw new ActionError(error?.message ?? 'Create leave failed')

  await bumpUsed(adminClient, parsed.user_id, parsed.type, days)
  await writeAudit(actor.id, 'leave.create_on_behalf', 'leave', leave.id, { after: leave })

  // Notify the user
  await notifyUser({
    user_id: parsed.user_id,
    type: 'leave_created_for_you',
    title: 'A leave was added to your record',
    body: `${actor.full_name} added a ${parsed.type} from ${parsed.start_date} to ${parsed.end_date}.`,
    link_url: '/leaves',
    related_entity_type: 'leave',
    related_entity_id: leave.id,
  })

  revalidatePath('/')
  revalidatePath('/leaves')
  revalidatePath('/calendar')
  revalidatePath('/hr')
  return leave
}

/** HR backdates a leave (start_date in the past is allowed). Same logic as on-behalf but explicit. */
export async function backdateLeave(input: z.infer<typeof CreateOnBehalfSchema>) {
  // Identical to createLeaveOnBehalf — both bypass the future-only restriction.
  // Kept as a separate export so the UI labels remain semantically clear.
  return createLeaveOnBehalf(input)
}

export async function deleteLeave(leaveId: string) {
  const user = await requireUser()
  const adminClient = createAdminClient()

  const { data: leave } = await adminClient
    .from('leaves')
    .select('*')
    .eq('id', leaveId)
    .single()

  if (!leave) throw new ActionError('Leave not found')
  if (leave.status !== 'active') throw new ActionError('Leave is already deleted')

  const isOwner = leave.user_id === user.id
  const isFuture = leave.start_date > new Date().toISOString().split('T')[0]
  const isHR = user.role === 'hr' || user.role === 'founder'

  if (!isHR && !(isOwner && isFuture)) {
    throw new ActionError('You can only delete your own future leaves. Contact HR otherwise.')
  }

  const { error } = await adminClient
    .from('leaves')
    .update({
      status: 'deleted',
      deleted_by: user.id,
      deleted_at: new Date().toISOString(),
    })
    .eq('id', leaveId)

  if (error) throw new ActionError(error.message)

  // Refund the balance
  await bumpUsed(adminClient, leave.user_id, leave.type, -Number(leave.days_deducted))

  await writeAudit(user.id, 'leave.delete', 'leave', leaveId, { before: leave })

  if (!isOwner) {
    await notifyUser({
      user_id: leave.user_id,
      type: 'leave_deleted_for_you',
      title: 'A leave was removed from your record',
      body: `${user.full_name} removed your ${leave.type} from ${leave.start_date} to ${leave.end_date}.`,
      link_url: '/leaves',
    })
  }

  revalidatePath('/')
  revalidatePath('/leaves')
  revalidatePath('/calendar')
  revalidatePath('/hr')
}
