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
import { format, parseISO } from 'date-fns'
import { notifyUser } from './notifications'
import { postWhereaboutsOnApproval, slackMention } from '@/lib/slack'
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
type LeaveReviewerUser = Pick<Tables<'users'>, 'id' | 'role' | 'manager_id' | 'full_name' | 'email'>

// Human "when" for Slack/notifications, with weekday: "Tue, 23 Jun 2026" for a
// single day, or "Tue, 23 Jun to Thu, 25 Jun 2026" for a range. No em dashes.
function formatWhen(start: string, end: string) {
  const fmt = (iso: string, withYear: boolean) =>
    format(parseISO(iso), withYear ? 'EEE, d MMM yyyy' : 'EEE, d MMM')
  return start === end ? fmt(start, true) : `${fmt(start, false)} to ${fmt(end, true)}`
}

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

/** Every ISO date from start to end (inclusive). Uses UTC to avoid TZ drift. */
function eachDateInRange(start: string, end: string): string[] {
  const out: string[] = []
  const cur = new Date(`${start}T00:00:00Z`)
  const last = new Date(`${end}T00:00:00Z`)
  while (cur <= last) {
    out.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return out
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
    .select('id, role, manager_id, full_name, email')
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
  policies: LeaveTypePolicy[],
  options?: { enforceBalance?: boolean }
) {
  const enforceBalance = options?.enforceBalance ?? true
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

  if (enforceBalance) {
    for (const [type, balance] of available.entries()) {
      if (balance < 0) {
        throw new ActionError(
          `Insufficient ${leaveTypeLabel(type, policies)} balance. You need ${fmtDays(Math.abs(balance))} more day(s).`
        )
      }
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

// Per-day breakdown for the Slack approval DM, e.g.:
//   Wed, 1 Jul 2026 - Leave
//   Thu, 2 Jul 2026 - WFH (half day)
function buildDayList(
  rows: Array<{ date: string; requested_type: string; half_day: boolean }>,
  policies: LeaveTypePolicy[]
) {
  return rows
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => {
      const day = format(parseISO(row.date), 'EEE, d MMM yyyy')
      const half = row.half_day ? ' (half day)' : ''
      return `${day} - ${leaveTypeLabel(row.requested_type, policies)}${half}`
    })
    .join('\n')
}

// Atomic balance change. Delegates to the apply_balance_delta SQL function so the
// increment is a single statement (no lost updates under concurrency). Used by the
// create flows; the approve/delete flows go through their own atomic RPCs which
// also flip status in the same transaction.
async function bumpUsed(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  type: string,
  delta: number,
  policies: LeaveTypePolicy[]
) {
  const year = getYearForType(type, policies)
  const { error } = await adminClient.rpc('apply_balance_delta', {
    p_user_id: userId,
    p_leave_year: year,
    p_type: type,
    p_delta: delta,
    p_enforce: false,
  })
  if (error) throw new ActionError(error.message)
}

// Map the RAISE messages from the atomic leave RPCs to friendly errors.
function rpcErrorToAction(message: string | undefined, fallback: string): ActionError {
  const m = message ?? ''
  if (m.includes('INSUFFICIENT_BALANCE')) {
    const type = m.split('INSUFFICIENT_BALANCE:')[1]?.split(/\s/)[0]
    return new ActionError(
      `Insufficient ${type ? type.replace(/_/g, ' ') : 'leave'} balance for this approval.`
    )
  }
  if (m.includes('ALREADY_PROCESSED')) {
    return new ActionError('This request was just actioned by someone else. Refresh and try again.')
  }
  if (m.includes('LEAVE_NOT_FOUND')) return new ActionError('Leave not found.')
  if (m.includes('NOT_DELETABLE')) return new ActionError('This leave can no longer be deleted.')
  return new ActionError(m || fallback)
}

// Shared planner-data assembly for a given user + date window. Used by the
// employee's own planner and the HR on-behalf planner (which uses a wider window
// so HR can navigate to past months).
async function buildPlannerData(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  startDate: string,
  endDate: string
) {
  const allLeaveTypes = await getLeaveTypePolicies(adminClient)
  const eligibleLeaveTypes = allLeaveTypes.filter(
    (policy) =>
      policy.is_active &&
      isSelectablePlanCategory(policy.category) &&
      isEligibleForPolicy(policy, userId)
  )

  const { data: memberships } = await adminClient
    .from('team_members')
    .select('team_id, is_primary')
    .eq('user_id', userId)
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
      .eq('user_id', userId)
      .in('leave_year', [CURRENT_LEAVE_YEAR, COMPOFF_YEAR]),
  ])

  const teamUserIds = Array.from(
    new Set([userId, ...(membersRes.data ?? []).map((member) => member.user_id)])
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
    if (leave.user_id !== userId || leave.status !== 'pending') continue
    const type = leave.requested_type ?? leave.type
    pending[type] = (pending[type] ?? 0) + Number(leave.days_deducted)
  }

  return {
    currentUserId: userId,
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

export async function getMyLeavePlannerData() {
  const user = await requireUser()
  const adminClient = createAdminClient()
  // Debit any expired comp-off before reading balances, so the planner shows and
  // enforces the post-expiry comp-off balance.
  await reconcileCompoffExpiry(adminClient, user.id)
  return buildPlannerData(adminClient, user.id, istMonthStart(0), istMonthEnd(3))
}

/**
 * HR on-behalf planner data for a chosen employee. Wider window (12 months back
 * to 3 ahead) so HR can navigate to past months to backdate. Same shape as the
 * employee planner so the calendar UI is identical.
 */
export async function getLeavePlannerDataForUser(userId: string) {
  await requireCapability('edit_leaves')
  const adminClient = createAdminClient()
  await reconcileCompoffExpiry(adminClient, userId)
  return buildPlannerData(adminClient, userId, istMonthStart(-12), istMonthEnd(3))
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
    const who = await slackMention(adminClient, user)
    await postWhereaboutsOnApproval(adminClient, `📅 ${who}: ${summary} (${formatWhen(startDate, endDate)})`)
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

    // Slack DM gets an itemised, per-day breakdown; the in-app body stays concise.
    const slackText = `*Leave approval needed*\n${user.full_name} requested ${summary}:\n${buildDayList(planRows, policies)}`

    await Promise.all([
      ...routing.approverIds.map((approverId) =>
        notifyUser({
          user_id: approverId,
          type: 'leave_requested',
          title: 'Leave approval needed',
          body: `${user.full_name} requested ${summary} for ${formatWhen(startDate, endDate)}. Open Orbit to approve.`,
          link_url: '/',
          related_entity_type: 'leave_request',
          related_entity_id: request.id,
          slackDm: true,
          slackText,
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

const CreatePlanForUserSchema = CreateLeavePlanSchema.extend({
  user_id: z.string().uuid(),
})

/**
 * HR adds a multi-day plan (mixed Leave/WFH/Comp-off) for an employee using the
 * same calendar as the employee planner. Differences vs createMyLeavePlan:
 *  - HR (`edit_leaves`), for a chosen employee.
 *  - Past AND future dates allowed (backdate or pre-add).
 *  - No approval — leaves are created ACTIVE immediately.
 *  - Balance may go negative (no shortage block).
 *  - Same day rules: weekly-offs, holidays, and WFH-only-on-office still apply.
 *  - Notifies the employee AND their manager, in-app + Slack, day by day.
 */
export async function createLeavePlanForUser(input: z.infer<typeof CreatePlanForUserSchema>) {
  const actor = await requireCapability('edit_leaves')
  const parsed = CreatePlanForUserSchema.parse(input)
  const adminClient = createAdminClient()
  const policies = await getLeaveTypePolicies(adminClient)

  const { data: employee } = await adminClient
    .from('users')
    .select('id, full_name, manager_id')
    .eq('id', parsed.user_id)
    .maybeSingle()
  if (!employee) throw new ActionError('Employee not found')

  const sortedDays = Array.from(
    new Map(parsed.days.map((day) => [day.date, day])).values()
  ).sort((a, b) => a.date.localeCompare(b.date))
  const startDate = sortedDays[0]?.date
  const endDate = sortedDays[sortedDays.length - 1]?.date
  if (!startDate || !endDate) throw new ActionError('Select at least one day.')

  for (const day of sortedDays) {
    const policy = getPolicyOrThrow(policies, day.type)
    if (!policy.is_active || !isSelectablePlanCategory(policy.category)) {
      throw new ActionError(`${leaveTypeLabel(day.type, policies)} cannot be added from the planner.`)
    }
    if (!isEligibleForPolicy(policy, parsed.user_id)) {
      throw new ActionError(`${leaveTypeLabel(day.type, policies)} is not available for this employee.`)
    }
  }
  // No past-date restriction — HR may backdate or pre-add future leaves.

  const [{ data: holidays }, { data: primaryMembership }] = await Promise.all([
    adminClient.from('holidays').select('date, name').gte('date', startDate).lte('date', endDate),
    adminClient
      .from('team_members')
      .select('team_id')
      .eq('user_id', parsed.user_id)
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
    if (isOffDayForPattern(day.date, offPattern)) {
      throw new ActionError(`${day.date} is a weekly off for this employee's team.`)
    }
    if (holidayByDate.has(day.date)) {
      throw new ActionError(`${day.date} is a holiday.`)
    }
    const category = leaveTypeCategory(day.type, policies)
    if (isWfhCategory(category) && !isWfoDayForPattern(day.date, wfoPattern)) {
      throw new ActionError(`${day.date} is already a work-from-home day for this employee.`)
    }
  }

  const { data: overlaps } = await adminClient
    .from('leaves')
    .select('id, start_date, end_date, type, requested_type')
    .eq('user_id', parsed.user_id)
    .in('status', ['active', 'pending', 'delete_requested'] as unknown as ('active' | 'pending' | 'delete_requested')[])
    .lte('start_date', endDate)
    .gte('end_date', startDate)
  for (const day of sortedDays) {
    const overlap = (overlaps ?? []).find(
      (leave) => leave.start_date <= day.date && leave.end_date >= day.date
    )
    if (overlap) {
      throw new ActionError(
        `${day.date} overlaps an existing ${leaveTypeLabel(overlap.requested_type ?? overlap.type, policies)} from ${overlap.start_date} to ${overlap.end_date}.`
      )
    }
  }

  await reconcileCompoffExpiry(adminClient, parsed.user_id)
  // Balance may go negative — HR is recording reality, so no shortage block.
  const planRows = buildPlanRows(sortedDays, new Map(), policies, { enforceBalance: false })

  const decidedAt = new Date().toISOString()
  const { data: request, error: requestError } = await adminClient
    .from('leave_requests')
    .insert({
      user_id: parsed.user_id,
      status: 'active',
      reason: parsed.reason ?? null,
      created_by: actor.id,
      decided_by: actor.id,
      decided_at: decidedAt,
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
        user_id: parsed.user_id,
        type: row.type,
        requested_type: row.requested_type,
        start_date: row.date,
        end_date: row.date,
        days_deducted: row.days_deducted,
        half_day_start: row.half_day,
        half_day_position: row.half_day_position,
        status: 'active' as const,
        created_by: actor.id,
        reason: parsed.reason ?? null,
        decided_by: actor.id,
        decided_at: decidedAt,
      }))
    )
    .select()
  if (leavesError || !leaves) {
    throw new ActionError(leavesError?.message ?? 'Create leave days failed')
  }

  const totals = new Map<string, number>()
  for (const row of planRows) totals.set(row.type, (totals.get(row.type) ?? 0) + row.days_deducted)
  for (const [type, days] of totals.entries()) {
    await bumpUsed(adminClient, parsed.user_id, type, days, policies)
  }

  const summary = summarizePlanRows(planRows, policies)
  const dayList = buildDayList(planRows, policies)
  const when = formatWhen(startDate, endDate)

  // Notify the employee (in-app + Slack DM, day by day).
  await notifyUser({
    user_id: parsed.user_id,
    type: 'leave_created_for_you',
    title: 'A leave was added to your record',
    body: `${actor.full_name} added ${summary} for ${when}.`,
    link_url: '/leaves',
    related_entity_type: 'leave_request',
    related_entity_id: request.id,
    slackDm: true,
    slackText: `*A leave was added to your record*\n${actor.full_name} added the following:\n${dayList}`,
  })

  // Notify the manager (in-app + Slack DM, day by day).
  const managerId = employee.manager_id
  if (managerId && managerId !== parsed.user_id && managerId !== actor.id) {
    await notifyUser({
      user_id: managerId,
      type: 'leave_created_for_report',
      title: 'A leave was added for your report',
      body: `${actor.full_name} added ${summary} for ${employee.full_name} (${when}).`,
      link_url: '/',
      related_entity_type: 'leave_request',
      related_entity_id: request.id,
      slackDm: true,
      slackText: `*Leave added for ${employee.full_name}*\n${actor.full_name} added:\n${dayList}`,
    })
  }

  await writeAudit(actor.id, 'leave_request.create_for_user', 'leave_request', request.id, {
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

  // Notify the employee AND their manager (in-app + Slack DM). No approval is
  // needed since HR added it, but both should know it happened.
  const { data: employee } = await adminClient
    .from('users')
    .select('full_name, manager_id')
    .eq('id', parsed.user_id)
    .maybeSingle()
  const typeLabel = leaveTypeLabel(parsed.type, policies)
  const when = formatWhen(parsed.start_date, parsed.end_date)

  await notifyUser({
    user_id: parsed.user_id,
    type: 'leave_created_for_you',
    title: 'A leave was added to your record',
    body: `${actor.full_name} added ${typeLabel} for ${when}.`,
    link_url: '/leaves',
    related_entity_type: 'leave',
    related_entity_id: leave.id,
    slackDm: true,
  })

  const managerId = employee?.manager_id
  if (managerId && managerId !== parsed.user_id && managerId !== actor.id) {
    await notifyUser({
      user_id: managerId,
      type: 'leave_created_for_report',
      title: 'A leave was added for your report',
      body: `${actor.full_name} added ${typeLabel} for ${employee?.full_name ?? 'a team member'} (${when}).`,
      link_url: '/',
      related_entity_type: 'leave',
      related_entity_id: leave.id,
      slackDm: true,
    })
  }

  revalidatePath('/', 'layout')
  return leave
}

/** HR backdates a leave (start_date in the past is allowed). Same logic as on-behalf but explicit. */
export async function backdateLeave(input: z.infer<typeof CreateOnBehalfSchema>) {
  // Identical to createLeaveOnBehalf — both bypass the future-only restriction.
  // Kept as a separate export so the UI labels remain semantically clear.
  return createLeaveOnBehalf(input)
}

const BacklogRowSchema = z.object({
  email: z.string().trim().email('Invalid email').transform((v) => v.toLowerCase()),
  type: z.string().trim().min(1, 'Type required'),
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  half_day: z.string().trim().optional().default(''),
  reason: z.string().trim().optional().default(''),
})

/**
 * Bulk-import already-taken (backlog) leaves from a CSV. HR-only (`edit_leaves`).
 * One row = one day (matching the per-day leave log), so a 10-day leave is 10
 * rows. Validates every row first; if any row is invalid nothing is imported.
 * Created leaves are `active` (no approval) and deduct balance. No notifications/
 * Slack — these are historical records. Columns: email,type,date,half_day,reason.
 */
export async function importBacklogLeavesCsv(
  rows: Record<string, string>[],
  options?: { confirmWarnings?: boolean }
) {
  const actor = await requireCapability('edit_leaves')
  const adminClient = createAdminClient()
  const policies = await getLeaveTypePolicies(adminClient)
  const typeByKey = new Map(policies.map((p) => [p.key.toLowerCase(), p]))
  const typeByName = new Map(policies.map((p) => [p.name.toLowerCase(), p]))

  const { data: usersData } = await adminClient
    .from('users')
    .select('id, email, full_name, manager_id')
    .eq('status', 'active')
  const userByEmail = new Map((usersData ?? []).map((u) => [u.email.toLowerCase(), u]))
  const userById = new Map((usersData ?? []).map((u) => [u.id, u]))

  type Prepared = {
    row: number
    user_id: string
    type: string
    start_date: string
    end_date: string
    half_day_start: boolean
    half_day_position: 'first_half' | 'second_half' | null
    days: number
    reason: string | null
  }
  const errors: { row: number; error: string }[] = []
  const warnings: { row: number; warning: string }[] = []
  const prepared: Prepared[] = []

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i]
    const rowNumber = Number(raw.__row ?? i + 1)
    const parsed = BacklogRowSchema.safeParse(raw)
    if (!parsed.success) {
      errors.push({ row: rowNumber, error: parsed.error.issues[0]?.message ?? 'Invalid row' })
      continue
    }
    const d = parsed.data
    const user = userByEmail.get(d.email)
    if (!user) {
      errors.push({ row: rowNumber, error: `No active user with email ${d.email}` })
      continue
    }
    const policy = typeByKey.get(d.type.toLowerCase()) ?? typeByName.get(d.type.toLowerCase())
    if (!policy) {
      errors.push({ row: rowNumber, error: `Unknown leave type: ${d.type}` })
      continue
    }
    const half = d.half_day.toLowerCase()
    if (half && half !== 'first_half' && half !== 'second_half') {
      errors.push({ row: rowNumber, error: 'half_day must be blank, first_half, or second_half' })
      continue
    }
    prepared.push({
      row: rowNumber,
      user_id: user.id,
      type: policy.key,
      // One row = one day, so start and end are the same date.
      start_date: d.date,
      end_date: d.date,
      half_day_start: Boolean(half),
      half_day_position: half ? (half as 'first_half' | 'second_half') : null,
      days: half ? 0.5 : 1,
      reason: d.reason || null,
    })
  }

  // Overlap checks: against existing leaves and within the batch itself.
  const involved = Array.from(new Set(prepared.map((p) => p.user_id)))
  const existingByUser = new Map<string, { start_date: string; end_date: string }[]>()
  if (involved.length > 0) {
    const { data: existing } = await adminClient
      .from('leaves')
      .select('user_id, start_date, end_date')
      .in('user_id', involved)
      .in('status', ['active', 'pending', 'delete_requested'] as unknown as ('active' | 'pending' | 'delete_requested')[])
    for (const l of existing ?? []) {
      const arr = existingByUser.get(l.user_id) ?? []
      arr.push({ start_date: l.start_date, end_date: l.end_date })
      existingByUser.set(l.user_id, arr)
    }
  }
  const batchByUser = new Map<string, { start_date: string; end_date: string }[]>()
  for (const p of prepared) {
    const overlapsExisting = (existingByUser.get(p.user_id) ?? []).some(
      (e) => e.start_date <= p.end_date && e.end_date >= p.start_date
    )
    const overlapsBatch = (batchByUser.get(p.user_id) ?? []).some(
      (e) => e.start_date <= p.end_date && e.end_date >= p.start_date
    )
    if (overlapsExisting) {
      errors.push({ row: p.row, error: 'Overlaps an existing leave for this person' })
    } else if (overlapsBatch) {
      errors.push({ row: p.row, error: 'Overlaps another row in this CSV for the same person' })
    } else {
      const arr = batchByUser.get(p.user_id) ?? []
      arr.push({ start_date: p.start_date, end_date: p.end_date })
      batchByUser.set(p.user_id, arr)
    }
  }

  // Schedule-aware checks (match the planner): holidays and weekly-off days are
  // HARD blocks. Logging WFH on a day that is already a WFH day (per the team
  // schedule) is only a SOFT warning — people change teams, so their schedule
  // can legitimately shift, and HR may still want to record it.
  const { data: holidayRows } = await adminClient.from('holidays').select('date')
  const holidaySet = new Set((holidayRows ?? []).map((h) => h.date))

  const { data: memberships } =
    involved.length > 0
      ? await adminClient
          .from('team_members')
          .select('user_id, team_id, is_primary')
          .in('user_id', involved)
          .is('left_at', null)
      : { data: [] as { user_id: string; team_id: string; is_primary: boolean }[] }
  const teamIdByUser = new Map<string, string>()
  for (const m of memberships ?? []) {
    if (m.is_primary || !teamIdByUser.has(m.user_id)) teamIdByUser.set(m.user_id, m.team_id)
  }
  const teamIds = Array.from(new Set(teamIdByUser.values()))
  const { data: teamRows } =
    teamIds.length > 0
      ? await adminClient.from('teams').select('id, wfo_pattern, off_days').in('id', teamIds)
      : { data: [] as { id: string; wfo_pattern: string | null; off_days: string | null }[] }
  const teamById = new Map((teamRows ?? []).map((t) => [t.id, t]))
  const patternFor = (userId: string) => {
    const team = teamById.get(teamIdByUser.get(userId) ?? '')
    return { wfo: team?.wfo_pattern ?? null, off: team?.off_days ?? null }
  }

  for (const p of prepared) {
    const name = userById.get(p.user_id)?.full_name ?? 'this employee'
    const pat = patternFor(p.user_id)
    const days = eachDateInRange(p.start_date, p.end_date)
    const holidayDays = days.filter((d) => holidaySet.has(d))
    const offDays = days.filter((d) => isOffDayForPattern(d, pat.off))
    if (holidayDays.length > 0) {
      errors.push({ row: p.row, error: `Falls on a holiday: ${holidayDays.join(', ')}` })
    }
    if (offDays.length > 0) {
      errors.push({ row: p.row, error: `Falls on a weekly-off day for ${name}: ${offDays.join(', ')}` })
    }
    if (isWfhCategory(leaveTypeCategory(p.type, policies))) {
      const wfhConflicts = days.filter(
        (d) => !isWfoDayForPattern(d, pat.wfo) && !holidaySet.has(d) && !isOffDayForPattern(d, pat.off)
      )
      if (wfhConflicts.length > 0) {
        warnings.push({
          row: p.row,
          warning: `${name} is already working from home (per their team schedule) on ${wfhConflicts.join(', ')} — logging WFH here is redundant.`,
        })
      }
    }
  }

  if (errors.length > 0) {
    return { imported: 0, errors, warnings, needsConfirm: false }
  }
  if (warnings.length > 0 && !options?.confirmWarnings) {
    return { imported: 0, errors: [], warnings, needsConfirm: true }
  }

  let imported = 0
  for (const p of prepared) {
    const { data: leave, error } = await adminClient
      .from('leaves')
      .insert({
        user_id: p.user_id,
        type: p.type,
        requested_type: p.type,
        start_date: p.start_date,
        end_date: p.end_date,
        half_day_start: p.half_day_start,
        half_day_end: false,
        half_day_position: p.half_day_position,
        reason: p.reason,
        days_deducted: p.days,
        created_by: actor.id,
      })
      .select('id')
      .single()
    if (error || !leave) {
      errors.push({ row: p.row, error: error?.message ?? 'Insert failed' })
      return { imported, errors, warnings, needsConfirm: false }
    }
    await bumpUsed(adminClient, p.user_id, p.type, p.days, policies)
    imported++
  }

  // Notify each employee (and their manager) about everything added for them,
  // entry by entry — same day-by-day style as the single backdate flow.
  const byUser = new Map<string, typeof prepared>()
  for (const p of prepared) {
    const arr = byUser.get(p.user_id) ?? []
    arr.push(p)
    byUser.set(p.user_id, arr)
  }
  for (const [userId, rows] of byUser.entries()) {
    const employee = userById.get(userId)
    if (!employee) continue
    const list = rows
      .slice()
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
      .map((r) => {
        const half = r.half_day_start ? ' (half day)' : ''
        return `${formatWhen(r.start_date, r.end_date)} - ${leaveTypeLabel(r.type, policies)}${half}`
      })
      .join('\n')
    const count = rows.length

    await notifyUser({
      user_id: userId,
      type: 'leave_created_for_you',
      title: 'Leave records were added',
      body: `${actor.full_name} added ${count} leave entr${count === 1 ? 'y' : 'ies'} to your record.`,
      link_url: '/leaves',
      slackDm: true,
      slackText: `*Leave records were added*\n${actor.full_name} added the following to your record:\n${list}`,
    })

    const managerId = employee.manager_id
    if (managerId && managerId !== userId && managerId !== actor.id) {
      await notifyUser({
        user_id: managerId,
        type: 'leave_created_for_report',
        title: 'Leave records were added for your report',
        body: `${actor.full_name} added ${count} leave entr${count === 1 ? 'y' : 'ies'} for ${employee.full_name}.`,
        link_url: '/',
        slackDm: true,
        slackText: `*Leave records added for ${employee.full_name}*\n${actor.full_name} added:\n${list}`,
      })
    }
  }

  await writeAudit(actor.id, 'leave.import_backlog', 'leave', 'batch', { after: { imported } })
  revalidatePath('/', 'layout')
  return { imported, errors, warnings, needsConfirm: false }
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

  // Atomic: flip the whole request pending -> active and deduct balance per type,
  // enforcing non-negative remaining, all in one transaction.
  const { error: rpcError } = await adminClient.rpc('approve_leave_atomic', {
    p_leave_id: firstLeave.id,
    p_actor: actor.id,
  })
  if (rpcError) throw rpcErrorToAction(rpcError.message, 'Approve leave request failed')

  const [{ data: updatedRequest }, { data: updatedLeaves }] = await Promise.all([
    adminClient.from('leave_requests').select('*').eq('id', requestId).single(),
    adminClient.from('leaves').select('*').eq('request_id', requestId),
  ])

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
    slackDm: true,
  })

  // Now that it's confirmed, tell everyone under the applicant they'll be away.
  const applicant = await getLeaveUser(adminClient, firstLeave.user_id)
  const downstreamSummary = Array.from(totals.entries())
    .map(([type, days]) => `${fmtDays(days)} ${leaveTypeLabel(type, policies)}`)
    .join(', ')
  const downstreamStart = requestLeaves[0].start_date
  const downstreamEnd = requestLeaves[requestLeaves.length - 1].end_date
  await notifyLeaveDownstream(
    adminClient,
    applicant,
    downstreamSummary,
    downstreamStart,
    downstreamEnd
  )
  const who = await slackMention(adminClient, applicant)
  await postWhereaboutsOnApproval(
    adminClient,
    `📅 ${who}: ${downstreamSummary} (${formatWhen(downstreamStart, downstreamEnd)})`
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
    slackDm: true,
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

  // Atomic: flip pending -> active and deduct balance (enforced) in one transaction.
  const { error: rpcError } = await adminClient.rpc('approve_leave_atomic', {
    p_leave_id: leaveId,
    p_actor: actor.id,
  })
  if (rpcError) throw rpcErrorToAction(rpcError.message, 'Approve leave failed')

  const { data: updated } = await adminClient.from('leaves').select('*').eq('id', leaveId).single()
  if (!updated) throw new ActionError('Approve leave failed')

  await writeAudit(actor.id, 'leave.approve', 'leave', leaveId, { before: leave, after: updated })
  await notifyUser({
    user_id: leave.user_id,
    type: 'leave_approved',
    title: 'Leave approved',
    body: `${actor.full_name} approved your ${leaveTypeLabel(leave.requested_type ?? leave.type, policies)} from ${leave.start_date} to ${leave.end_date}.`,
    link_url: '/leaves',
    related_entity_type: 'leave',
    related_entity_id: leave.id,
    slackDm: true,
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
    slackDm: true,
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

  // Compare-and-swap so two concurrent requests can't both fire reviewer DMs.
  const { data: updated, error } = await adminClient
    .from('leaves')
    .update({ status: 'delete_requested' })
    .eq('id', leaveId)
    .eq('status', 'active')
    .select()
    .maybeSingle()

  if (error) throw new ActionError(error.message)
  if (!updated) {
    throw new ActionError('This leave was just updated. Refresh and try again.')
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

  // Atomic: flip delete_requested -> deleted and refund balance in one transaction.
  const { error: rpcError } = await adminClient.rpc('mark_leave_deleted_atomic', {
    p_leave_id: leaveId,
    p_actor: actor.id,
  })
  if (rpcError) throw rpcErrorToAction(rpcError.message, 'Approve leave deletion failed')

  const { data: updated } = await adminClient.from('leaves').select('*').eq('id', leaveId).single()
  if (!updated) throw new ActionError('Approve leave deletion failed')

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

  // Employees / team leads must route an approved leave's deletion for approval.
  // HR & founders approve their own actions, so they delete directly below.
  if (isOwner && leave.status === 'active' && !isHR) {
    await requestLeaveDeletion(leaveId)
    return { status: 'delete_requested' as const }
  }

  if (!isHR && !(isOwner && leave.status === 'pending')) {
    throw new ActionError(
      leave.status === 'delete_requested'
        ? 'This leave is already waiting for deletion approval.'
        : 'Approved leaves need deletion approval. Contact HR otherwise.'
    )
  }

  // Atomic: flip to deleted and refund balance (only if it had consumed it) in
  // one transaction, compare-and-swapped so the refund happens exactly once.
  const { error: rpcError } = await adminClient.rpc('mark_leave_deleted_atomic', {
    p_leave_id: leaveId,
    p_actor: user.id,
  })
  if (rpcError) throw rpcErrorToAction(rpcError.message, 'Delete leave failed')

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
  return { status: 'deleted' as const }
}
