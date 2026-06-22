'use server'

import { ActionError } from './errors'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { todayIST, istMonthStart, istMonthEnd } from '@/lib/date'
import {
  requireCapability,
  requireUser,
  writeAudit,
} from './_helpers'
import { notifyUser } from './notifications'
import { reconcileCompoffExpiry } from '@/lib/compoff-expiry'
import {
  resolveLeaveApprovalRouting,
  downstreamAudienceForUser,
} from '@/lib/approvers'
import type { Tables } from '@/lib/supabase/database.types'
import {
  COMPOFF_YEAR,
  CURRENT_LEAVE_YEAR,
  DEFAULT_LEAVE_TYPES,
  isEligibleForPolicy,
  isSelectablePlanCategory,
  isWfhCategory,
  leaveTypeCategory,
  leaveTypeLabel,
  leaveYearForCategory,
  type LeaveTypePolicy,
} from '@/lib/leave-types'

const LeaveTypeSchema = z.string().trim().min(1)
type LeaveStatus = 'active' | 'pending' | 'delete_requested' | 'rejected' | 'deleted'
type LeaveReviewerUser = Pick<Tables<'users'>, 'id' | 'role' | 'manager_id' | 'full_name'>

const DayPlanTypeSchema = z.string().trim().min(1)

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
        half_day: z.boolean().optional(),
        half_day_position: z.enum(['first_half', 'second_half']).nullable().optional(),
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

// Off days come from the team's `off_days` (CSV of day codes). When a user has
// no team, fall back to the historical default of Sunday-only off.
function isOffDayForPattern(date: string, offPattern?: string | null) {
  const codes = (offPattern ?? '')
    .split(',')
    .map((day) => day.trim().toUpperCase())
    .filter(Boolean)
  const set = new Set(codes.length ? codes : ['SUN'])
  return set.has(dayCode(date))
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

async function getLeaveTypePolicies(
  adminClient: ReturnType<typeof createAdminClient>
): Promise<LeaveTypePolicy[]> {
  const [{ data: types, error }, { data: eligibility }] = await Promise.all([
    adminClient.from('leave_types').select('*'),
    adminClient.from('user_leave_type_eligibility').select('user_id, leave_type_key'),
  ])

  if (error || !types || types.length === 0) return DEFAULT_LEAVE_TYPES

  const eligibleByType = new Map<string, string[]>()
  for (const row of eligibility ?? []) {
    const ids = eligibleByType.get(row.leave_type_key) ?? []
    ids.push(row.user_id)
    eligibleByType.set(row.leave_type_key, ids)
  }

  return types.map((type) => ({
    ...type,
    eligible_user_ids: eligibleByType.get(type.key) ?? [],
  }))
}

function policyMap(policies: LeaveTypePolicy[]) {
  return new Map(policies.map((policy) => [policy.key, policy]))
}

function getPolicyOrThrow(policies: LeaveTypePolicy[], type: string) {
  const policy = policyMap(policies).get(type)
  if (!policy) throw new ActionError(`Leave type "${type}" is not configured.`)
  return policy
}

function getYearForType(type: string, policies: LeaveTypePolicy[]): number {
  return leaveYearForCategory(leaveTypeCategory(type, policies))
}

function monthStartIso(date: string) {
  return `${date.slice(0, 7)}-01`
}

function monthEndIso(date: string) {
  const [year, month] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
}

function monthLabel(monthStart: string) {
  return dateFromIso(monthStart).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

function addOneDayIso(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1, day))
  next.setUTCDate(next.getUTCDate() + 1)
  return next.toISOString().slice(0, 10)
}

async function ensureMonthlyQuota(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  requestedDays: Array<{ date: string; type: string; days_deducted: number }>,
  policies: LeaveTypePolicy[]
) {
  const limitedKeys = new Set(
    policies
      .filter((policy) => policy.monthly_quota !== null && Number(policy.monthly_quota) > 0)
      .map((policy) => policy.key)
  )
  const relevantDays = requestedDays.filter((day) => limitedKeys.has(day.type))
  if (relevantDays.length === 0) return

  const requestedByTypeMonth = new Map<string, number>()
  for (const day of relevantDays) {
    const key = `${day.type}:${monthStartIso(day.date)}`
    requestedByTypeMonth.set(
      key,
      (requestedByTypeMonth.get(key) ?? 0) + Number(day.days_deducted)
    )
  }

  const requestedMonths = Array.from(requestedByTypeMonth.keys()).map((key) => key.split(':')[1])
  const minMonth = requestedMonths.reduce((a, b) => (a < b ? a : b))
  const maxMonth = requestedMonths.reduce((a, b) => (a > b ? a : b))

  const { data: existingLeaves } = await adminClient
    .from('leaves')
    .select('id, start_date, end_date, type, requested_type, days_deducted, status')
    .eq('user_id', userId)
    .in('status', ['active', 'pending', 'delete_requested'])
    .lte('start_date', monthEndIso(maxMonth))
    .gte('end_date', minMonth)

  const existingByTypeMonth = new Map<string, number>()
  for (const leave of existingLeaves ?? []) {
    const requestedType = leave.requested_type ?? leave.type
    if (!limitedKeys.has(requestedType)) continue

    let cursor = leave.start_date
    while (cursor <= leave.end_date) {
      const month = monthStartIso(cursor)
      if (month >= minMonth && month <= maxMonth) {
        const key = `${requestedType}:${month}`
        const dayValue = leave.start_date === leave.end_date
          ? Number(leave.days_deducted ?? 0)
          : 1
        existingByTypeMonth.set(key, (existingByTypeMonth.get(key) ?? 0) + dayValue)
      }
      cursor = addOneDayIso(cursor)
    }
  }

  for (const [key, requested] of requestedByTypeMonth.entries()) {
    const [type, month] = key.split(':')
    const policy = getPolicyOrThrow(policies, type)
    const quota = Number(policy.monthly_quota ?? 0)
    const existing = existingByTypeMonth.get(key) ?? 0
    if (existing + requested > quota) {
      throw new ActionError(
        `${policy.name} allows ${fmtDays(quota)} day(s) per month. ${monthLabel(month)} already has ${fmtDays(existing)} day(s), and this request adds ${fmtDays(requested)} day(s).`
      )
    }
  }
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
    .select('id, start_date, end_date, type, requested_type')
    .eq('user_id', userId)
    .in('status', statuses)
    .lte('start_date', end)
    .gte('end_date', start)
  if (excludeLeaveId) q = q.neq('id', excludeLeaveId)

  const { data } = await q
  if (data && data.length > 0) {
    const first = data[0]
    throw new ActionError(
      `This leave overlaps an existing ${first.requested_type ?? first.type} from ${first.start_date} to ${first.end_date}. Contact HR if you need this resolved.`
    )
  }
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

  // The manager is the approver.
  const { data: targetUser } = await adminClient
    .from('users')
    .select('manager_id')
    .eq('id', targetUserId)
    .maybeSingle()
  if (targetUser?.manager_id === actor.id) return actor

  // HR / Founders may override the manager (UI shows a confirm prompt).
  if (actor.role === 'founder' || actor.role === 'hr') return actor

  throw new ActionError('You do not have permission to approve this leave request.', 'forbidden')
}

async function ensureBalance(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  type: string,
  daysNeeded: number,
  policies: LeaveTypePolicy[]
) {
  const year = getYearForType(type, policies)
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
      `Insufficient ${leaveTypeLabel(type, policies)} balance: you have ${remaining} day(s) available but need ${daysNeeded}. Contact HR for help.`
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

  const remaining = new Map<string, number>()
  for (const balance of balances ?? []) {
    remaining.set(
      balance.type,
      Number(balance.allocated ?? 0) - Number(balance.used ?? 0)
    )
  }
  return remaining
}

function buildPlanRows(
  days: Array<{
    date: string
    type: z.infer<typeof DayPlanTypeSchema>
    half_day?: boolean
    half_day_position?: 'first_half' | 'second_half' | null
  }>,
  remaining: Map<string, number>,
  policies: LeaveTypePolicy[]
) {
  const available = new Map(remaining)
  const rows: Array<{
    date: string
    type: string
    requested_type: string
    days_deducted: number
    half_day: boolean
    half_day_position: 'first_half' | 'second_half' | null
  }> = []

  for (const day of days) {
    const policy = getPolicyOrThrow(policies, day.type)
    if (!policy.is_active || !isSelectablePlanCategory(policy.category)) {
      throw new ActionError(`${leaveTypeLabel(day.type, policies)} cannot be requested from the planner.`)
    }

    const deducted = day.half_day ? 0.5 : 1
    available.set(day.type, (available.get(day.type) ?? 0) - deducted)
    rows.push({
      date: day.date,
      type: day.type,
      requested_type: day.type,
      days_deducted: deducted,
      half_day: Boolean(day.half_day),
      half_day_position: day.half_day ? day.half_day_position ?? 'first_half' : null,
    })
  }

  for (const [type, balance] of available.entries()) {
    if (balance < 0) {
      throw new ActionError(
        `Insufficient ${leaveTypeLabel(type, policies)} balance. You need ${fmtDays(Math.abs(balance))} more day(s).`
      )
    }
  }

  return rows
}

function summarizePlanRows(
  rows: Array<{ requested_type: string; days_deducted: number }>,
  policies: LeaveTypePolicy[]
) {
  const totals = new Map<string, number>()
  for (const row of rows) {
    totals.set(row.requested_type, (totals.get(row.requested_type) ?? 0) + Number(row.days_deducted))
  }

  return Array.from(totals.entries())
    .map(([type, days]) => `${fmtDays(days)} ${leaveTypeLabel(type, policies)}`)
    .join(', ')
}

async function bumpUsed(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  type: string,
  delta: number,
  policies: LeaveTypePolicy[]
) {
  const year = getYearForType(type, policies)
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

export async function getMyLeavePlannerData() {
  const user = await requireUser()
  const adminClient = createAdminClient()
  // Debit any expired comp-off before reading balances, so the planner shows and
  // enforces the post-expiry comp-off balance.
  await reconcileCompoffExpiry(adminClient, user.id)
  const startDate = istMonthStart(0)
  const endDate = istMonthEnd(3)
  const allLeaveTypes = await getLeaveTypePolicies(adminClient)
  const eligibleLeaveTypes = allLeaveTypes.filter(
    (policy) =>
      policy.is_active &&
      isSelectablePlanCategory(policy.category) &&
      isEligibleForPolicy(policy, user.id)
  )

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
      ? adminClient.from('teams').select('id, name, wfo_pattern, off_days, team_lead_id').in('id', teamIds)
      : Promise.resolve({ data: [] as Pick<Tables<'teams'>, 'id' | 'name' | 'wfo_pattern' | 'off_days' | 'team_lead_id'>[] }),
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

  // Days the user already has awaiting approval (not yet deducted from balance),
  // by type — so the planner can show "X pending" and reserve it client-side too.
  const pending: Record<string, number> = {}
  for (const leave of leavesRes.data ?? []) {
    if (leave.user_id !== user.id || leave.status !== 'pending') continue
    const type = leave.requested_type ?? leave.type
    pending[type] = (pending[type] ?? 0) + Number(leave.days_deducted)
  }

  return {
    currentUserId: user.id,
    primaryTeam,
    teamMembers: (usersRes.data ?? []).sort((a, b) => a.full_name.localeCompare(b.full_name)),
    holidays: holidaysRes.data ?? [],
    balances: balancesRes.data ?? [],
    pending,
    leaveTypes: eligibleLeaveTypes,
    allLeaveTypes,
    leaves: (leavesRes.data ?? []).map((leave) => ({
      ...leave,
      user_full_name: userById.get(leave.user_id)?.full_name ?? 'Unknown',
      type_name: leaveTypeLabel(leave.requested_type ?? leave.type, allLeaveTypes),
      type_category: leaveTypeCategory(leave.requested_type ?? leave.type, allLeaveTypes),
    })),
  }
}

/**
 * Pending requests don't deduct balance until approved, so without this a user
 * could stack multiple pending requests that each individually fit but together
 * exceed their balance. This counts existing **pending** days (status 'pending',
 * not yet deducted) on top of this request and blocks if the combination would
 * exceed the available balance — with a message telling them to cancel a pending
 * request first. (active/delete_requested are already reflected in `used`.)
 */
async function ensurePendingAwareBalance(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  sortedDays: Array<{ type: string; half_day?: boolean }>,
  policies: LeaveTypePolicy[]
) {
  const newByType = new Map<string, number>()
  for (const day of sortedDays) {
    newByType.set(day.type, (newByType.get(day.type) ?? 0) + (day.half_day ? 0.5 : 1))
  }

  const [{ data: balances }, { data: pendingLeaves }] = await Promise.all([
    adminClient
      .from('leave_balances')
      .select('type, allocated, used')
      .eq('user_id', userId)
      .in('leave_year', [CURRENT_LEAVE_YEAR, COMPOFF_YEAR]),
    adminClient
      .from('leaves')
      .select('type, requested_type, days_deducted')
      .eq('user_id', userId)
      .eq('status', 'pending'),
  ])

  const balByType = new Map(
    (balances ?? []).map((b) => [b.type, Number(b.allocated) - Number(b.used)])
  )
  const pendingByType = new Map<string, number>()
  for (const leave of pendingLeaves ?? []) {
    const type = leave.requested_type ?? leave.type
    pendingByType.set(type, (pendingByType.get(type) ?? 0) + Number(leave.days_deducted))
  }

  for (const [type, requested] of newByType.entries()) {
    const remaining = balByType.get(type) ?? 0
    const pending = pendingByType.get(type) ?? 0
    if (requested + pending > remaining + 1e-9) {
      const label = leaveTypeLabel(type, policies)
      if (pending > 0) {
        throw new ActionError(
          `You already have ${fmtDays(pending)} day(s) of ${label} awaiting approval. ` +
            `This request adds ${fmtDays(requested)} day(s), which would exceed your ` +
            `${fmtDays(remaining)} day(s) of available ${label}. Cancel a pending ${label} ` +
            `request before applying, or shorten this one.`
        )
      }
      throw new ActionError(
        `Insufficient ${label} balance: you have ${fmtDays(remaining)} day(s) available but this request needs ${fmtDays(requested)} day(s).`
      )
    }
  }
}

/** Tell everyone under `applicant` (reports + led-team members) that they'll be away. */
async function notifyLeaveDownstream(
  adminClient: ReturnType<typeof createAdminClient>,
  applicant: { id: string; full_name: string },
  summary: string,
  startDate: string,
  endDate: string
) {
  const audience = await downstreamAudienceForUser(adminClient, applicant.id)
  const range = startDate === endDate ? startDate : `${startDate} – ${endDate}`
  await Promise.all(
    audience.map((recipientId) =>
      notifyUser({
        user_id: recipientId,
        type: 'team_member_away',
        title: `${applicant.full_name} will be away`,
        body: `${applicant.full_name}: ${summary} (${range}).`,
        link_url: '/calendar',
        related_entity_type: 'user',
        related_entity_id: applicant.id,
      })
    )
  )
}

export async function createMyLeavePlan(input: z.infer<typeof CreateLeavePlanSchema>) {
  const user = await requireUser()
  const parsed = CreateLeavePlanSchema.parse(input)
  const adminClient = createAdminClient()
  const policies = await getLeaveTypePolicies(adminClient)
  const today = todayIST()

  const sortedDays = Array.from(
    new Map(parsed.days.map((day) => [day.date, day])).values()
  ).sort((a, b) => a.date.localeCompare(b.date))

  const startDate = sortedDays[0]?.date
  const endDate = sortedDays[sortedDays.length - 1]?.date
  if (!startDate || !endDate) throw new ActionError('Select at least one working day.')

  for (const day of sortedDays) {
    const policy = getPolicyOrThrow(policies, day.type)
    if (!policy.is_active || !isSelectablePlanCategory(policy.category)) {
      throw new ActionError(`${leaveTypeLabel(day.type, policies)} cannot be requested from the planner.`)
    }
    if (!isEligibleForPolicy(policy, user.id)) {
      throw new ActionError(`${leaveTypeLabel(day.type, policies)} is not available for your profile.`)
    }
  }

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
  let offPattern: string | null = null
  if (primaryMembership?.team_id) {
    const { data: team } = await adminClient
      .from('teams')
      .select('wfo_pattern, off_days')
      .eq('id', primaryMembership.team_id)
      .maybeSingle()
    wfoPattern = team?.wfo_pattern ?? null
    offPattern = team?.off_days ?? null
  }

  for (const day of sortedDays) {
    if (day.date < today) {
      throw new ActionError(`${day.date} is in the past.`)
    }
    if (isOffDayForPattern(day.date, offPattern)) {
      throw new ActionError(`${day.date} is a non-working day for your team.`)
    }
    if (holidayByDate.has(day.date)) {
      throw new ActionError(`${day.date} is a Holiday!`)
    }
    const category = leaveTypeCategory(day.type, policies)
    if (isWfhCategory(category) && !isWfoDayForPattern(day.date, wfoPattern)) {
      throw new ActionError(`${day.date} is a WFH day for YOU!`)
    }
  }

  const { data: overlaps } = await adminClient
    .from('leaves')
    .select('id, start_date, end_date, type, requested_type')
    .eq('user_id', user.id)
    .in('status', ['active', 'pending', 'delete_requested'])
    .lte('start_date', endDate)
    .gte('end_date', startDate)

  for (const day of sortedDays) {
    const overlap = (overlaps ?? []).find(
      (leave) => leave.start_date <= day.date && leave.end_date >= day.date
    )
    if (overlap) {
      const overlapType = overlap.requested_type ?? overlap.type
      throw new ActionError(
        `${day.date} overlaps an existing ${leaveTypeLabel(overlapType, policies)} from ${overlap.start_date} to ${overlap.end_date}.`
      )
    }
  }

  // Debit expired comp-off before the balance check so a plan can't spend it.
  await reconcileCompoffExpiry(adminClient, user.id)

  await ensureMonthlyQuota(
    adminClient,
    user.id,
    sortedDays.map((day) => ({ ...day, days_deducted: day.half_day ? 0.5 : 1 })),
    policies
  )

  // Block if this request plus already-pending requests would exceed the balance.
  await ensurePendingAwareBalance(adminClient, user.id, sortedDays, policies)

  const balances = await getBalanceRemaining(adminClient, user.id)
  const planRows = buildPlanRows(sortedDays, balances, policies)

  // Who approves? Founders auto-approve; everyone else routes to their manager
  // (HR/Founders as a safety net if no manager). Team leads are FYI-only.
  const routing = await resolveLeaveApprovalRouting(adminClient, user)
  if (!routing.autoApprove && routing.approverIds.length === 0) {
    throw new ActionError('No leave approver is available. Contact HR or your founder.')
  }

  const summary = summarizePlanRows(planRows, policies)
  const decidedAt = new Date().toISOString()
  const status = routing.autoApprove ? ('active' as const) : ('pending' as const)
  const decisionFields = routing.autoApprove
    ? { decided_by: user.id, decided_at: decidedAt }
    : {}

  const { data: request, error: requestError } = await adminClient
    .from('leave_requests')
    .insert({
      user_id: user.id,
      status,
      reason: parsed.reason ?? null,
      created_by: user.id,
      ...decisionFields,
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
        requested_type: row.requested_type,
        start_date: row.date,
        end_date: row.date,
        days_deducted: row.days_deducted,
        half_day_start: row.half_day,
        half_day_position: row.half_day_position,
        status,
        created_by: user.id,
        reason: parsed.reason ?? null,
        ...decisionFields,
      }))
    )
    .select()

  if (leavesError || !leaves) {
    throw new ActionError(leavesError?.message ?? 'Create leave request days failed')
  }

  if (routing.autoApprove) {
    // Deduct balance immediately and tell everyone under this person.
    const totals = new Map<string, number>()
    for (const row of planRows) {
      totals.set(row.type, (totals.get(row.type) ?? 0) + row.days_deducted)
    }
    for (const [type, days] of totals.entries()) {
      await bumpUsed(adminClient, user.id, type, days, policies)
    }
    await notifyLeaveDownstream(adminClient, user, summary, startDate, endDate)
  } else {
    // Look up the approver's name so the FYI reads "pending with <name>".
    const { data: approverRows } = await adminClient
      .from('users')
      .select('full_name')
      .in('id', routing.approverIds)
    const approverLabel =
      routing.approverIds.length === 1 && approverRows?.[0]
        ? approverRows[0].full_name
        : 'HR'

    await Promise.all([
      ...routing.approverIds.map((approverId) =>
        notifyUser({
          user_id: approverId,
          type: 'leave_requested',
          title: 'Leave approval needed',
          body: `${user.full_name} requested ${summary} across ${planRows.length} day(s).`,
          link_url: '/',
          related_entity_type: 'leave_request',
          related_entity_id: request.id,
        })
      ),
      ...routing.fyiLeadIds.map((leadId) =>
        notifyUser({
          user_id: leadId,
          type: 'leave_fyi',
          title: 'Team member applied for leave',
          body: `${user.full_name} requested ${summary} across ${planRows.length} day(s) — pending with ${approverLabel}.`,
          link_url: '/',
          related_entity_type: 'leave_request',
          related_entity_id: request.id,
        })
      ),
    ])
  }

  await writeAudit(user.id, 'leave_request.create', 'leave_request', request.id, {
    after: { request, leaves, autoApproved: routing.autoApprove },
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
  const policies = await getLeaveTypePolicies(adminClient)
  getPolicyOrThrow(policies, parsed.type)
  const days = calcDays(parsed)

  await ensureNoOverlap(adminClient, parsed.user_id, parsed.start_date, parsed.end_date)
  // No balance check — HR can let it go negative

  const { data: leave, error } = await adminClient
    .from('leaves')
    .insert({
      user_id: parsed.user_id,
      type: parsed.type,
      requested_type: parsed.type,
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

  await bumpUsed(adminClient, parsed.user_id, parsed.type, days, policies)
  await writeAudit(actor.id, 'leave.create_on_behalf', 'leave', leave.id, { after: leave })

  // Notify the user
  await notifyUser({
    user_id: parsed.user_id,
    type: 'leave_created_for_you',
    title: 'A leave was added to your record',
    body: `${actor.full_name} added ${leaveTypeLabel(parsed.type, policies)} from ${parsed.start_date} to ${parsed.end_date}.`,
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
  const policies = await getLeaveTypePolicies(adminClient)
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

  const totals = new Map<string, number>()
  for (const leave of requestLeaves) {
    totals.set(leave.type, (totals.get(leave.type) ?? 0) + Number(leave.days_deducted))
  }
  for (const [type, days] of totals.entries()) {
    await ensureBalance(adminClient, firstLeave.user_id, type, days, policies)
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
    await bumpUsed(adminClient, firstLeave.user_id, type, days, policies)
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

  // Now that it's confirmed, tell everyone under the applicant they'll be away.
  const applicant = await getLeaveUser(adminClient, firstLeave.user_id)
  const downstreamSummary = Array.from(totals.entries())
    .map(([type, days]) => `${fmtDays(days)} ${leaveTypeLabel(type, policies)}`)
    .join(', ')
  await notifyLeaveDownstream(
    adminClient,
    applicant,
    downstreamSummary,
    requestLeaves[0].start_date,
    requestLeaves[requestLeaves.length - 1].end_date
  )

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

  const policies = await getLeaveTypePolicies(adminClient)
  const actor = await requireLeaveApprover(adminClient, leave.user_id)

  await ensureNoOverlap(
    adminClient,
    leave.user_id,
    leave.start_date,
    leave.end_date,
    leave.id,
    ['active']
  )
  await ensureBalance(adminClient, leave.user_id, leave.type, Number(leave.days_deducted), policies)

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

  await bumpUsed(adminClient, leave.user_id, leave.type, Number(leave.days_deducted), policies)
  await writeAudit(actor.id, 'leave.approve', 'leave', leaveId, { before: leave, after: updated })
  await notifyUser({
    user_id: leave.user_id,
    type: 'leave_approved',
    title: 'Leave approved',
    body: `${actor.full_name} approved your ${leaveTypeLabel(leave.requested_type ?? leave.type, policies)} from ${leave.start_date} to ${leave.end_date}.`,
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

  const policies = await getLeaveTypePolicies(adminClient)
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
    body: `${actor.full_name} rejected your ${leaveTypeLabel(leave.requested_type ?? leave.type, policies)} from ${leave.start_date} to ${leave.end_date}.`,
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

  // Deletion is approved by the same person who approves leaves — the manager
  // (HR/Founders as the fallback when there's no manager, incl. founders' own).
  const routing = await resolveLeaveApprovalRouting(adminClient, user)
  let reviewers = routing.approverIds
  if (reviewers.length === 0) {
    const { data: fallback } = await adminClient
      .from('users')
      .select('id')
      .in('role', ['hr', 'founder'] as unknown as ('hr' | 'founder')[])
      .eq('status', 'active')
    reviewers = (fallback ?? []).map((u) => u.id).filter((id) => id !== user.id)
  }
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

  const policies = await getLeaveTypePolicies(adminClient)
  await Promise.all(
    reviewers.map((reviewerId) =>
      notifyUser({
        user_id: reviewerId,
        type: 'leave_delete_requested',
        title: 'Leave deletion approval needed',
        body: `${user.full_name} requested deletion of ${leaveTypeLabel(leave.requested_type ?? leave.type, policies)} from ${leave.start_date} to ${leave.end_date}.`,
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
  const policies = await getLeaveTypePolicies(adminClient)
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

  await bumpUsed(adminClient, leave.user_id, leave.type, -Number(leave.days_deducted), policies)
  await writeAudit(actor.id, 'leave.delete_approve', 'leave', leaveId, {
    before: leave,
    after: updated,
  })
  await notifyUser({
    user_id: leave.user_id,
    type: 'leave_delete_approved',
    title: 'Leave deletion approved',
    body: `${actor.full_name} approved deletion of your ${leaveTypeLabel(leave.requested_type ?? leave.type, policies)} from ${leave.start_date} to ${leave.end_date}.`,
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
  const policies = await getLeaveTypePolicies(adminClient)
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
    body: `${actor.full_name} rejected deletion of your ${leaveTypeLabel(leave.requested_type ?? leave.type, policies)} from ${leave.start_date} to ${leave.end_date}.`,
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
  const policies = await getLeaveTypePolicies(adminClient)

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
    await bumpUsed(adminClient, leave.user_id, leave.type, -Number(leave.days_deducted), policies)
  }

  await writeAudit(user.id, 'leave.delete', 'leave', leaveId, { before: leave })

  if (!isOwner) {
    await notifyUser({
      user_id: leave.user_id,
      type: 'leave_deleted_for_you',
      title: 'A leave was removed from your record',
      body: `${user.full_name} removed your ${leaveTypeLabel(leave.requested_type ?? leave.type, policies)} from ${leave.start_date} to ${leave.end_date}.`,
      link_url: '/leaves',
    })
  }

  revalidatePath('/', 'layout')
}
