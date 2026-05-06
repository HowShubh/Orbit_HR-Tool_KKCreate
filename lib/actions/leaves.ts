'use server'

import { ActionError } from './errors'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  requireCapability,
  requireUser,
  writeAudit,
} from './_helpers'
import { notifyUser } from './notifications'
import type { Tables } from '@/lib/supabase/database.types'

const CURRENT_LEAVE_YEAR = 2026
const COMPOFF_YEAR = 0

const LeaveTypeSchema = z.enum(['wfh', 'leave', 'compoff_wfh', 'compoff_leave'])
type LeaveStatus = 'active' | 'pending' | 'delete_requested' | 'rejected' | 'deleted'
type LeaveReviewerUser = Pick<Tables<'users'>, 'id' | 'role' | 'manager_id' | 'full_name'>

const DayPlanTypeSchema = z.enum(['leave', 'wfh'])

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

const CreateLeavePlanSchema = z.object({
  days: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        type: DayPlanTypeSchema,
      })
    )
    .min(1, 'Select at least one working day.')
    .max(45, 'A single request can include up to 45 selected days.'),
  reason: z.string().nullable().optional(),
})

const DAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const

function dateFromIso(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function dayCode(date: string) {
  return DAY_CODES[dateFromIso(date).getDay()]
}

function isSunday(date: string) {
  return dayCode(date) === 'SUN'
}

function parseWfoPattern(pattern?: string | null) {
  return new Set(
    (pattern ?? 'MON,TUE,WED,THU,FRI,SAT')
      .split(',')
      .map((day) => day.trim().toUpperCase())
      .filter(Boolean)
  )
}

function isWfoDayForPattern(date: string, pattern?: string | null) {
  return parseWfoPattern(pattern).has(dayCode(date))
}

function fmtDays(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

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
  excludeLeaveId?: string,
  statuses: LeaveStatus[] = ['active', 'pending', 'delete_requested']
) {
  let q = adminClient
    .from('leaves')
    .select('id, start_date, end_date, type')
    .eq('user_id', userId)
    .in('status', statuses)
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

async function getLeaveReviewers(
  adminClient: ReturnType<typeof createAdminClient>,
  user: LeaveReviewerUser
) {
  const reviewerIds = new Set<string>()

  const { data: primaryMembership } = await adminClient
    .from('team_members')
    .select('team_id')
    .eq('user_id', user.id)
    .is('left_at', null)
    .order('is_primary', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (primaryMembership?.team_id) {
    const { data: team } = await adminClient
      .from('teams')
      .select('team_lead_id')
      .eq('id', primaryMembership.team_id)
      .maybeSingle()

    if (team?.team_lead_id && team.team_lead_id !== user.id) {
      reviewerIds.add(team.team_lead_id)
    }
  }

  if (reviewerIds.size === 0 && user.manager_id && user.manager_id !== user.id) {
    reviewerIds.add(user.manager_id)
  }

  if (reviewerIds.size > 0) return Array.from(reviewerIds)

  const fallbackRoles: Array<'hr' | 'founder'> =
    user.role === 'team_lead' ? ['founder'] : ['hr', 'founder']
  const { data: fallbackUsers } = await adminClient
    .from('users')
    .select('id')
    .in('role', fallbackRoles)
    .eq('status', 'active')
    .order('full_name', { ascending: true })

  for (const reviewer of fallbackUsers ?? []) reviewerIds.add(reviewer.id)
  reviewerIds.delete(user.id)
  return Array.from(reviewerIds)
}

async function getLeaveUser(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<LeaveReviewerUser> {
  const { data: user } = await adminClient
    .from('users')
    .select('id, role, manager_id, full_name')
    .eq('id', userId)
    .maybeSingle()

  if (!user) throw new ActionError('Leave owner not found')
  return user
}

async function requireLeaveApprover(
  adminClient: ReturnType<typeof createAdminClient>,
  targetUserId: string
) {
  const actor = await requireUser()
  if (actor.role === 'founder' || actor.role === 'hr') return actor

  if (actor.role === 'team_lead') {
    const { data: ledTeams } = await adminClient
      .from('teams')
      .select('id')
      .eq('team_lead_id', actor.id)
    const ledTeamIds = (ledTeams ?? []).map((team) => team.id)

    if (ledTeamIds.length > 0) {
      const { data: member } = await adminClient
        .from('team_members')
        .select('id')
        .eq('user_id', targetUserId)
        .in('team_id', ledTeamIds)
        .is('left_at', null)
        .limit(1)

      if (member && member.length > 0) return actor
    }
  }

  const { data: targetUser } = await adminClient
    .from('users')
    .select('manager_id')
    .eq('id', targetUserId)
    .maybeSingle()

  if (targetUser?.manager_id === actor.id) return actor

  throw new ActionError('You do not have permission to approve this leave request.', 'forbidden')
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

async function getBalanceRemaining(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string
) {
  const { data: balances } = await adminClient
    .from('leave_balances')
    .select('type, allocated, used, leave_year')
    .eq('user_id', userId)
    .in('leave_year', [CURRENT_LEAVE_YEAR, COMPOFF_YEAR])

  const remaining = new Map<z.infer<typeof LeaveTypeSchema>, number>()
  for (const balance of balances ?? []) {
    remaining.set(
      balance.type,
      Number(balance.allocated ?? 0) - Number(balance.used ?? 0)
    )
  }
  return remaining
}

function buildPlanRows(
  days: Array<{ date: string; type: z.infer<typeof DayPlanTypeSchema> }>,
  remaining: Map<z.infer<typeof LeaveTypeSchema>, number>
) {
  const available = {
    compoff_leave: remaining.get('compoff_leave') ?? 0,
    leave: remaining.get('leave') ?? 0,
    compoff_wfh: remaining.get('compoff_wfh') ?? 0,
    wfh: remaining.get('wfh') ?? 0,
  }

  const rows: Array<{
    date: string
    type: z.infer<typeof LeaveTypeSchema>
    days_deducted: number
  }> = []

  for (const day of days) {
    if (day.type === 'leave') {
      if (available.compoff_leave >= 1) {
        available.compoff_leave -= 1
        rows.push({ ...day, type: 'compoff_leave', days_deducted: 1 })
      } else {
        available.leave -= 1
        rows.push({ ...day, type: 'leave', days_deducted: 1 })
      }
    } else if (available.compoff_wfh >= 1) {
      available.compoff_wfh -= 1
      rows.push({ ...day, type: 'compoff_wfh', days_deducted: 1 })
    } else {
      available.wfh -= 1
      rows.push({ ...day, type: 'wfh', days_deducted: 1 })
    }
  }

  if (available.leave < 0) {
    throw new ActionError(`Insufficient leave balance. You need ${fmtDays(Math.abs(available.leave))} more day(s).`)
  }
  if (available.wfh < 0) {
    throw new ActionError(`Insufficient WFH balance. You need ${fmtDays(Math.abs(available.wfh))} more day(s).`)
  }

  return rows
}

function summarizePlanRows(rows: Array<{ type: z.infer<typeof LeaveTypeSchema>; days_deducted: number }>) {
  const totals = new Map<z.infer<typeof LeaveTypeSchema>, number>()
  for (const row of rows) {
    totals.set(row.type, (totals.get(row.type) ?? 0) + Number(row.days_deducted))
  }

  return Array.from(totals.entries())
    .map(([type, days]) => `${fmtDays(days)} ${type.replaceAll('_', ' ')}`)
    .join(', ')
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
  const reviewers = await getLeaveReviewers(adminClient, user)
  if (reviewers.length === 0) {
    throw new ActionError('No leave approver is available. Contact HR or your founder.')
  }

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
      status: 'pending',
      created_by: user.id,
    })
    .select()
    .single()

  if (error || !leave) throw new ActionError(error?.message ?? 'Create leave failed')

  await Promise.all(
    reviewers.map((reviewerId) =>
      notifyUser({
        user_id: reviewerId,
        type: 'leave_requested',
        title: 'Leave approval needed',
        body: `${user.full_name} requested ${parsed.type} from ${parsed.start_date} to ${parsed.end_date}.`,
        link_url: '/',
        related_entity_type: 'leave',
        related_entity_id: leave.id,
      })
    )
  )

  await writeAudit(user.id, 'leave.request', 'leave', leave.id, { after: leave })

  revalidatePath('/', 'layout')
  return leave
}

export async function getMyLeavePlannerData() {
  const user = await requireUser()
  const adminClient = createAdminClient()
  const today = new Date()
  const startDate = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .split('T')[0]
  const endDate = new Date(today.getFullYear(), today.getMonth() + 4, 0)
    .toISOString()
    .split('T')[0]

  const { data: memberships } = await adminClient
    .from('team_members')
    .select('team_id, is_primary')
    .eq('user_id', user.id)
    .is('left_at', null)

  const teamIds = Array.from(new Set((memberships ?? []).map((membership) => membership.team_id)))
  const primaryTeamId =
    (memberships ?? []).find((membership) => membership.is_primary)?.team_id ?? teamIds[0] ?? null

  const [
    teamsRes,
    membersRes,
    holidaysRes,
    balancesRes,
  ] = await Promise.all([
    teamIds.length > 0
      ? adminClient.from('teams').select('id, name, wfo_pattern, team_lead_id').in('id', teamIds)
      : Promise.resolve({ data: [] as Pick<Tables<'teams'>, 'id' | 'name' | 'wfo_pattern' | 'team_lead_id'>[] }),
    primaryTeamId
      ? adminClient
          .from('team_members')
          .select('user_id')
          .eq('team_id', primaryTeamId)
          .is('left_at', null)
      : Promise.resolve({ data: [] as { user_id: string }[] }),
    adminClient
      .from('holidays')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true }),
    adminClient
      .from('leave_balances')
      .select('*')
      .eq('user_id', user.id)
      .in('leave_year', [CURRENT_LEAVE_YEAR, COMPOFF_YEAR]),
  ])

  const teamUserIds = Array.from(
    new Set([user.id, ...(membersRes.data ?? []).map((member) => member.user_id)])
  )
  const [leavesRes, usersRes] = await Promise.all([
    teamUserIds.length > 0
      ? adminClient
          .from('leaves')
          .select('*')
          .in('user_id', teamUserIds)
          .in('status', ['active', 'pending', 'delete_requested'])
          .lte('start_date', endDate)
          .gte('end_date', startDate)
          .order('start_date', { ascending: true })
      : Promise.resolve({ data: [] as Tables<'leaves'>[] }),
    teamUserIds.length > 0
      ? adminClient
          .from('users')
          .select('id, full_name, designation')
          .in('id', teamUserIds)
          .eq('status', 'active')
      : Promise.resolve({ data: [] as Pick<Tables<'users'>, 'id' | 'full_name' | 'designation'>[] }),
  ])

  const userById = new Map((usersRes.data ?? []).map((teamUser) => [teamUser.id, teamUser]))
  const primaryTeam = (teamsRes.data ?? []).find((team) => team.id === primaryTeamId) ?? null

  return {
    currentUserId: user.id,
    primaryTeam,
    teamMembers: (usersRes.data ?? []).sort((a, b) => a.full_name.localeCompare(b.full_name)),
    holidays: holidaysRes.data ?? [],
    balances: balancesRes.data ?? [],
    leaves: (leavesRes.data ?? []).map((leave) => ({
      ...leave,
      user_full_name: userById.get(leave.user_id)?.full_name ?? 'Unknown',
    })),
  }
}

export async function createMyLeavePlan(input: z.infer<typeof CreateLeavePlanSchema>) {
  const user = await requireUser()
  const parsed = CreateLeavePlanSchema.parse(input)
  const adminClient = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const sortedDays = Array.from(
    new Map(parsed.days.map((day) => [day.date, day])).values()
  ).sort((a, b) => a.date.localeCompare(b.date))

  const startDate = sortedDays[0]?.date
  const endDate = sortedDays[sortedDays.length - 1]?.date
  if (!startDate || !endDate) throw new ActionError('Select at least one working day.')

  if (startDate < today) {
    throw new ActionError('Leaves must start today or later. HR can backdate leaves on your behalf.')
  }

  const [{ data: holidays }, { data: primaryMembership }] = await Promise.all([
    adminClient.from('holidays').select('date, name').gte('date', startDate).lte('date', endDate),
    adminClient
      .from('team_members')
      .select('team_id')
      .eq('user_id', user.id)
      .is('left_at', null)
      .order('is_primary', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const holidayByDate = new Map((holidays ?? []).map((holiday) => [holiday.date, holiday.name]))
  let wfoPattern: string | null = null
  if (primaryMembership?.team_id) {
    const { data: team } = await adminClient
      .from('teams')
      .select('wfo_pattern')
      .eq('id', primaryMembership.team_id)
      .maybeSingle()
    wfoPattern = team?.wfo_pattern ?? null
  }

  for (const day of sortedDays) {
    if (day.date < today) {
      throw new ActionError(`${day.date} is in the past.`)
    }
    if (isSunday(day.date)) {
      throw new ActionError(`${day.date} is Sunday!`)
    }
    if (holidayByDate.has(day.date)) {
      throw new ActionError(`${day.date} is a Holiday!`)
    }
    if (day.type === 'wfh' && !isWfoDayForPattern(day.date, wfoPattern)) {
      throw new ActionError(`${day.date} is a WFH day for YOU!`)
    }
  }

  const { data: overlaps } = await adminClient
    .from('leaves')
    .select('id, start_date, end_date, type')
    .eq('user_id', user.id)
    .in('status', ['active', 'pending', 'delete_requested'])
    .lte('start_date', endDate)
    .gte('end_date', startDate)

  for (const day of sortedDays) {
    const overlap = (overlaps ?? []).find(
      (leave) => leave.start_date <= day.date && leave.end_date >= day.date
    )
    if (overlap) {
      throw new ActionError(
        `${day.date} overlaps an existing ${overlap.type} from ${overlap.start_date} to ${overlap.end_date}.`
      )
    }
  }

  const balances = await getBalanceRemaining(adminClient, user.id)
  const planRows = buildPlanRows(sortedDays, balances)
  const reviewers = await getLeaveReviewers(adminClient, user)
  if (reviewers.length === 0) {
    throw new ActionError('No leave approver is available. Contact HR or your founder.')
  }

  const { data: request, error: requestError } = await adminClient
    .from('leave_requests')
    .insert({
      user_id: user.id,
      status: 'pending',
      reason: parsed.reason ?? null,
      created_by: user.id,
    })
    .select()
    .single()

  if (requestError || !request) {
    throw new ActionError(requestError?.message ?? 'Create leave request failed')
  }

  const { data: leaves, error: leavesError } = await adminClient
    .from('leaves')
    .insert(
      planRows.map((row) => ({
        request_id: request.id,
        user_id: user.id,
        type: row.type,
        start_date: row.date,
        end_date: row.date,
        days_deducted: row.days_deducted,
        status: 'pending' as const,
        created_by: user.id,
        reason: parsed.reason ?? null,
      }))
    )
    .select()

  if (leavesError || !leaves) {
    throw new ActionError(leavesError?.message ?? 'Create leave request days failed')
  }

  const summary = summarizePlanRows(planRows)
  await Promise.all(
    reviewers.map((reviewerId) =>
      notifyUser({
        user_id: reviewerId,
        type: 'leave_requested',
        title: 'Leave approval needed',
        body: `${user.full_name} requested ${summary} across ${planRows.length} day(s).`,
        link_url: '/',
        related_entity_type: 'leave_request',
        related_entity_id: request.id,
      })
    )
  )

  await writeAudit(user.id, 'leave_request.create', 'leave_request', request.id, {
    after: { request, leaves },
  })

  revalidatePath('/', 'layout')
  return { request, leaves }
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

  revalidatePath('/', 'layout')
  return leave
}

/** HR backdates a leave (start_date in the past is allowed). Same logic as on-behalf but explicit. */
export async function backdateLeave(input: z.infer<typeof CreateOnBehalfSchema>) {
  // Identical to createLeaveOnBehalf — both bypass the future-only restriction.
  // Kept as a separate export so the UI labels remain semantically clear.
  return createLeaveOnBehalf(input)
}

async function getPendingRequestLeaves(
  adminClient: ReturnType<typeof createAdminClient>,
  requestId: string
) {
  const { data: requestLeaves } = await adminClient
    .from('leaves')
    .select('*')
    .eq('request_id', requestId)
    .eq('status', 'pending')
    .order('start_date', { ascending: true })

  if (!requestLeaves || requestLeaves.length === 0) {
    throw new ActionError('No pending leave days found for this request')
  }
  return requestLeaves
}

async function approveLeaveRequestById(
  adminClient: ReturnType<typeof createAdminClient>,
  requestId: string
) {
  const requestLeaves = await getPendingRequestLeaves(adminClient, requestId)
  const firstLeave = requestLeaves[0]
  const actor = await requireLeaveApprover(adminClient, firstLeave.user_id)

  for (const leave of requestLeaves) {
    await ensureNoOverlap(
      adminClient,
      leave.user_id,
      leave.start_date,
      leave.end_date,
      leave.id,
      ['active', 'delete_requested']
    )
  }

  const totals = new Map<z.infer<typeof LeaveTypeSchema>, number>()
  for (const leave of requestLeaves) {
    totals.set(leave.type, (totals.get(leave.type) ?? 0) + Number(leave.days_deducted))
  }
  for (const [type, days] of totals.entries()) {
    await ensureBalance(adminClient, firstLeave.user_id, type, days)
  }

  const decidedAt = new Date().toISOString()
  const [{ data: updatedRequest, error: requestError }, { data: updatedLeaves, error: leavesError }] =
    await Promise.all([
      adminClient
        .from('leave_requests')
        .update({ status: 'active', decided_by: actor.id, decided_at: decidedAt })
        .eq('id', requestId)
        .select()
        .single(),
      adminClient
        .from('leaves')
        .update({ status: 'active', decided_by: actor.id, decided_at: decidedAt })
        .eq('request_id', requestId)
        .eq('status', 'pending')
        .select(),
    ])

  if (requestError || leavesError || !updatedRequest || !updatedLeaves) {
    throw new ActionError(requestError?.message ?? leavesError?.message ?? 'Approve leave request failed')
  }

  for (const [type, days] of totals.entries()) {
    await bumpUsed(adminClient, firstLeave.user_id, type, days)
  }

  await writeAudit(actor.id, 'leave_request.approve', 'leave_request', requestId, {
    before: requestLeaves,
    after: { request: updatedRequest, leaves: updatedLeaves },
  })
  await notifyUser({
    user_id: firstLeave.user_id,
    type: 'leave_approved',
    title: 'Leave approved',
    body: `${actor.full_name} approved your leave request for ${requestLeaves.length} day(s).`,
    link_url: '/leaves',
    related_entity_type: 'leave_request',
    related_entity_id: requestId,
  })

  revalidatePath('/', 'layout')
  return updatedLeaves
}

async function rejectLeaveRequestById(
  adminClient: ReturnType<typeof createAdminClient>,
  requestId: string
) {
  const requestLeaves = await getPendingRequestLeaves(adminClient, requestId)
  const firstLeave = requestLeaves[0]
  const actor = await requireLeaveApprover(adminClient, firstLeave.user_id)
  const decidedAt = new Date().toISOString()

  const [{ data: updatedRequest, error: requestError }, { data: updatedLeaves, error: leavesError }] =
    await Promise.all([
      adminClient
        .from('leave_requests')
        .update({ status: 'rejected', decided_by: actor.id, decided_at: decidedAt })
        .eq('id', requestId)
        .select()
        .single(),
      adminClient
        .from('leaves')
        .update({ status: 'rejected', decided_by: actor.id, decided_at: decidedAt })
        .eq('request_id', requestId)
        .eq('status', 'pending')
        .select(),
    ])

  if (requestError || leavesError || !updatedRequest || !updatedLeaves) {
    throw new ActionError(requestError?.message ?? leavesError?.message ?? 'Reject leave request failed')
  }

  await writeAudit(actor.id, 'leave_request.reject', 'leave_request', requestId, {
    before: requestLeaves,
    after: { request: updatedRequest, leaves: updatedLeaves },
  })
  await notifyUser({
    user_id: firstLeave.user_id,
    type: 'leave_rejected',
    title: 'Leave rejected',
    body: `${actor.full_name} rejected your leave request for ${requestLeaves.length} day(s).`,
    link_url: '/leaves',
    related_entity_type: 'leave_request',
    related_entity_id: requestId,
  })

  revalidatePath('/', 'layout')
  return updatedLeaves
}

export async function approveLeave(leaveId: string) {
  const adminClient = createAdminClient()

  const { data: leave } = await adminClient
    .from('leaves')
    .select('*')
    .eq('id', leaveId)
    .single()

  if (!leave) throw new ActionError('Leave not found')
  if (leave.status !== 'pending') throw new ActionError('Only pending leave requests can be approved')

  if (leave.request_id) {
    return approveLeaveRequestById(adminClient, leave.request_id)
  }

  const actor = await requireLeaveApprover(adminClient, leave.user_id)

  await ensureNoOverlap(
    adminClient,
    leave.user_id,
    leave.start_date,
    leave.end_date,
    leave.id,
    ['active']
  )
  await ensureBalance(adminClient, leave.user_id, leave.type, Number(leave.days_deducted))

  const { data: updated, error } = await adminClient
    .from('leaves')
    .update({
      status: 'active',
      decided_by: actor.id,
      decided_at: new Date().toISOString(),
    })
    .eq('id', leaveId)
    .select()
    .single()

  if (error || !updated) throw new ActionError(error?.message ?? 'Approve leave failed')

  await bumpUsed(adminClient, leave.user_id, leave.type, Number(leave.days_deducted))
  await writeAudit(actor.id, 'leave.approve', 'leave', leaveId, { before: leave, after: updated })
  await notifyUser({
    user_id: leave.user_id,
    type: 'leave_approved',
    title: 'Leave approved',
    body: `${actor.full_name} approved your ${leave.type} from ${leave.start_date} to ${leave.end_date}.`,
    link_url: '/leaves',
    related_entity_type: 'leave',
    related_entity_id: leave.id,
  })

  revalidatePath('/', 'layout')
  return updated
}

export async function rejectLeave(leaveId: string) {
  const adminClient = createAdminClient()

  const { data: leave } = await adminClient
    .from('leaves')
    .select('*')
    .eq('id', leaveId)
    .single()

  if (!leave) throw new ActionError('Leave not found')
  if (leave.status !== 'pending') throw new ActionError('Only pending leave requests can be rejected')

  if (leave.request_id) {
    return rejectLeaveRequestById(adminClient, leave.request_id)
  }

  const actor = await requireLeaveApprover(adminClient, leave.user_id)

  const { data: updated, error } = await adminClient
    .from('leaves')
    .update({
      status: 'rejected',
      decided_by: actor.id,
      decided_at: new Date().toISOString(),
    })
    .eq('id', leaveId)
    .select()
    .single()

  if (error || !updated) throw new ActionError(error?.message ?? 'Reject leave failed')

  await writeAudit(actor.id, 'leave.reject', 'leave', leaveId, { before: leave, after: updated })
  await notifyUser({
    user_id: leave.user_id,
    type: 'leave_rejected',
    title: 'Leave rejected',
    body: `${actor.full_name} rejected your ${leave.type} from ${leave.start_date} to ${leave.end_date}.`,
    link_url: '/leaves',
    related_entity_type: 'leave',
    related_entity_id: leave.id,
  })

  revalidatePath('/', 'layout')
  return updated
}

export async function requestLeaveDeletion(leaveId: string) {
  const user = await requireUser()
  const adminClient = createAdminClient()

  const { data: leave } = await adminClient
    .from('leaves')
    .select('*')
    .eq('id', leaveId)
    .single()

  if (!leave) throw new ActionError('Leave not found')
  if (leave.user_id !== user.id) {
    throw new ActionError('You can only request deletion for your own approved leaves.')
  }
  if (leave.status === 'delete_requested') {
    throw new ActionError('Deletion approval is already pending for this leave.')
  }
  if (leave.status !== 'active') {
    throw new ActionError('Only approved leaves need deletion approval.')
  }

  const reviewers = await getLeaveReviewers(adminClient, user)
  if (reviewers.length === 0) {
    throw new ActionError('No leave deletion approver is available. Contact HR or your founder.')
  }

  const { data: updated, error } = await adminClient
    .from('leaves')
    .update({ status: 'delete_requested' })
    .eq('id', leaveId)
    .select()
    .single()

  if (error || !updated) {
    throw new ActionError(error?.message ?? 'Request leave deletion failed')
  }

  await Promise.all(
    reviewers.map((reviewerId) =>
      notifyUser({
        user_id: reviewerId,
        type: 'leave_delete_requested',
        title: 'Leave deletion approval needed',
        body: `${user.full_name} requested deletion of ${leave.type} from ${leave.start_date} to ${leave.end_date}.`,
        link_url: '/',
        related_entity_type: 'leave',
        related_entity_id: leave.id,
      })
    )
  )
  await writeAudit(user.id, 'leave.delete_request', 'leave', leave.id, {
    before: leave,
    after: updated,
  })

  revalidatePath('/', 'layout')
  return updated
}

export async function approveLeaveDeletion(leaveId: string) {
  const adminClient = createAdminClient()

  const { data: leave } = await adminClient
    .from('leaves')
    .select('*')
    .eq('id', leaveId)
    .single()

  if (!leave) throw new ActionError('Leave not found')
  if (leave.status !== 'delete_requested') {
    throw new ActionError('Only deletion requests can be approved')
  }

  const actor = await requireLeaveApprover(adminClient, leave.user_id)
  const { data: updated, error } = await adminClient
    .from('leaves')
    .update({
      status: 'deleted',
      deleted_by: actor.id,
      deleted_at: new Date().toISOString(),
    })
    .eq('id', leaveId)
    .select()
    .single()

  if (error || !updated) {
    throw new ActionError(error?.message ?? 'Approve leave deletion failed')
  }

  await bumpUsed(adminClient, leave.user_id, leave.type, -Number(leave.days_deducted))
  await writeAudit(actor.id, 'leave.delete_approve', 'leave', leaveId, {
    before: leave,
    after: updated,
  })
  await notifyUser({
    user_id: leave.user_id,
    type: 'leave_delete_approved',
    title: 'Leave deletion approved',
    body: `${actor.full_name} approved deletion of your ${leave.type} from ${leave.start_date} to ${leave.end_date}.`,
    link_url: '/leaves',
    related_entity_type: 'leave',
    related_entity_id: leave.id,
  })

  revalidatePath('/', 'layout')
  return updated
}

export async function rejectLeaveDeletion(leaveId: string) {
  const adminClient = createAdminClient()

  const { data: leave } = await adminClient
    .from('leaves')
    .select('*')
    .eq('id', leaveId)
    .single()

  if (!leave) throw new ActionError('Leave not found')
  if (leave.status !== 'delete_requested') {
    throw new ActionError('Only deletion requests can be rejected')
  }

  const actor = await requireLeaveApprover(adminClient, leave.user_id)
  const { data: updated, error } = await adminClient
    .from('leaves')
    .update({ status: 'active' })
    .eq('id', leaveId)
    .select()
    .single()

  if (error || !updated) {
    throw new ActionError(error?.message ?? 'Reject leave deletion failed')
  }

  await writeAudit(actor.id, 'leave.delete_reject', 'leave', leaveId, {
    before: leave,
    after: updated,
  })
  await notifyUser({
    user_id: leave.user_id,
    type: 'leave_delete_rejected',
    title: 'Leave deletion rejected',
    body: `${actor.full_name} rejected deletion of your ${leave.type} from ${leave.start_date} to ${leave.end_date}.`,
    link_url: '/leaves',
    related_entity_type: 'leave',
    related_entity_id: leave.id,
  })

  revalidatePath('/', 'layout')
  return updated
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
  if (
    leave.status !== 'active' &&
    leave.status !== 'pending' &&
    leave.status !== 'delete_requested'
  ) {
    throw new ActionError('Only active, pending, or deletion-requested leaves can be deleted')
  }

  const isOwner = leave.user_id === user.id
  const isHR = user.role === 'hr' || user.role === 'founder'

  if (isOwner && leave.status === 'active' && !isHR) {
    return requestLeaveDeletion(leaveId)
  }

  if (!isHR && !(isOwner && leave.status === 'pending')) {
    throw new ActionError(
      leave.status === 'delete_requested'
        ? 'This leave is already waiting for deletion approval.'
        : 'Approved leaves need deletion approval. Contact HR otherwise.'
    )
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

  if (leave.status === 'active' || leave.status === 'delete_requested') {
    // Pending requests have not consumed balance yet.
    await bumpUsed(adminClient, leave.user_id, leave.type, -Number(leave.days_deducted))
  }

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

  revalidatePath('/', 'layout')
}
