'use server'

import { ActionError } from './errors'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { todayIST, istMonthStart, istMonthEnd } from '@/lib/date'
import {
  requireCapability,
  requireUser,
  revalidateHR,
  writeAudit,
} from './_helpers'
import { notifyUser } from './notifications'
import { listLeaveTypes } from '@/lib/queries/leave-types'
import { slackMentionById } from '@/lib/slack'
import { format, parseISO } from 'date-fns'

// Blockquote day list for comp-off Slack messages, with a type emoji + half-day
// marker, e.g. "> Sat, 4 Jul 2026 — Comp-off WFH 🏠 (half day)".
function slackCompoffLines(days: Array<{ date: string; type: string; half: boolean }>): string {
  return days
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => {
      const emoji = d.type === 'compoff_wfh' ? '🏠' : '🌴'
      const label = d.type === 'compoff_wfh' ? 'Comp-off WFH' : 'Comp-off Leave'
      return `> ${format(parseISO(d.date), 'EEE, d MMM yyyy')} — ${label} ${emoji}${d.half ? ' (half day)' : ''}`
    })
    .join('\n')
}

export async function decideCompoff(
  grantId: string,
  decision: 'approved' | 'rejected',
  reason?: string
) {
  const adminClient = createAdminClient()
  const { data: grant } = await adminClient
    .from('compoff_grants')
    .select('*')
    .eq('id', grantId)
    .single()

  if (!grant) throw new ActionError('Compoff grant not found')

  if (grant.status !== 'pending') {
    throw new ActionError('Only pending compoff requests can be decided')
  }

  const actor = await requireUser()
  if (grant.manager_id !== actor.id) {
    await requireCapability('approve_compoff', grant.user_id)
  }

  // Compare-and-swap on status so a double-click can't decide (and credit) twice.
  const { data: after, error } = await adminClient
    .from('compoff_grants')
    .update({
      status: decision,
      decided_at: new Date().toISOString(),
      decided_by: actor.id,
    })
    .eq('id', grantId)
    .eq('status', 'pending')
    .select()
    .maybeSingle()

  if (error) throw new ActionError(error.message)
  if (!after) throw new ActionError('This comp-off was just decided by someone else.')

  await writeAudit(actor.id, `compoff.${decision}`, 'compoff_grant', grantId, {
    before: grant,
    after,
  })

  const approverMention = await slackMentionById(adminClient, actor.id)
  const line = slackCompoffLines([
    { date: grant.work_date, type: grant.type, half: Number(grant.amount) === 0.5 },
  ])
  const cleanReason = reason?.trim()
  await notifyUser({
    user_id: grant.user_id,
    type: `compoff_${decision}`,
    title: decision === 'approved' ? 'Compoff approved' : 'Compoff rejected',
    body:
      decision === 'approved'
        ? `Your compoff request for ${grant.work_date} was approved (+${grant.amount} day(s)).`
        : `Your compoff request for ${grant.work_date} was rejected.`,
    link_url: '/leaves',
    related_entity_type: 'compoff_grant',
    related_entity_id: grantId,
    slackDm: true,
    slackText:
      decision === 'approved'
        ? `✅ *Your comp-off is approved*\n> *Earned for working:*\n${line}\n> Approved by ${approverMention}`
        : `❌ *Your comp-off was not approved*\n> *Worked on:*\n${line}${cleanReason ? `\n> Reason: ${cleanReason}` : ''}\n> Rejected by ${approverMention}`,
  })

  // Note: earning comp-off is a *credit* (the person worked extra), not an
  // absence, so it is a personal DM only — never a #whereabouts channel post.
  // The daily digest shows the *debit* side (who is actually away today).

  revalidatePath('/', 'layout')
  await revalidateHR()
  return after
}

/**
 * Remove a comp-off grant and refund the credit it added, atomically (audit
 * finding #5). HR-only. The SQL function blocks removal of an approved grant
 * whose credit has already been spent, so balances can never go negative; in
 * that case HR is told to handle it deliberately.
 */
export async function removeCompoffGrant(grantId: string) {
  const actor = await requireCapability('approve_compoff')
  const adminClient = createAdminClient()

  const { data: grant } = await adminClient
    .from('compoff_grants')
    .select('*')
    .eq('id', grantId)
    .single()
  if (!grant) throw new ActionError('Comp-off grant not found')

  const { error } = await adminClient.rpc('remove_compoff_grant_atomic', {
    p_grant_id: grantId,
    p_actor: actor.id,
  })
  if (error) {
    const m = error.message ?? ''
    if (m.includes('COMPOFF_ALREADY_USED')) {
      throw new ActionError(
        'This comp-off has already been spent, so it cannot be removed automatically. Adjust the balance with HR first.'
      )
    }
    if (m.includes('GRANT_NOT_FOUND')) throw new ActionError('Comp-off grant not found.')
    throw new ActionError(m || 'Could not remove comp-off grant')
  }

  await writeAudit(actor.id, 'compoff.remove', 'compoff_grant', grantId, { before: grant })
  await notifyUser({
    user_id: grant.user_id,
    type: 'compoff_removed',
    title: 'A comp-off entry was removed',
    body: `${actor.full_name} removed a comp-off entry (${grant.work_date}, ${grant.amount} day(s)) from your record.`,
    link_url: '/leaves',
    related_entity_type: 'compoff_grant',
    related_entity_id: grantId,
  })

  revalidatePath('/', 'layout')
  await revalidateHR()
  return { ok: true }
}

const RequestCompoffSchema = z.object({
  type: z.enum(['compoff_wfh', 'compoff_leave']),
  amount: z.number().min(0.5).max(2),
  work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().min(1, 'Reason required'),
})

export async function requestCompoff(input: z.infer<typeof RequestCompoffSchema>) {
  const user = await requireUser()
  const parsed = RequestCompoffSchema.parse(input)

  // Cannot request compoff for a future date
  const today = todayIST()
  if (parsed.work_date > today) {
    throw new ActionError('Compoff can only be requested for work you already did, not future dates.')
  }

  const adminClient = createAdminClient()

  // Founders auto-approve their own comp-off. The `handle_compoff_approved`
  // trigger credits the balance on insert when status is already 'approved'.
  if (user.role === 'founder') {
    const { data: grant, error } = await adminClient
      .from('compoff_grants')
      .insert({
        user_id: user.id,
        type: parsed.type,
        amount: parsed.amount,
        work_date: parsed.work_date,
        reason: parsed.reason,
        manager_id: user.id,
        status: 'approved',
        decided_by: user.id,
        decided_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error || !grant) throw new ActionError(error?.message ?? 'Request failed')

    await writeAudit(user.id, 'compoff.request', 'compoff_grant', grant.id, {
      after: grant,
      autoApproved: true,
    })
    revalidatePath('/', 'layout')
    return grant
  }

  // Determine approver: user's manager, falling back to HR
  let approverId: string | null = user.manager_id

  if (!approverId) {
    // No manager — find any HR/founder to approve
    const { data: hrUser } = await adminClient
      .from('users')
      .select('id')
      .in('role', ['hr', 'founder'])
      .eq('status', 'active')
      .neq('id', user.id)
      .limit(1)
      .maybeSingle()
    approverId = hrUser?.id ?? null
  }

  if (!approverId) {
    throw new ActionError('No approver available. Contact your founder or HR.')
  }

  const { data: grant, error } = await adminClient
    .from('compoff_grants')
    .insert({
      user_id: user.id,
      type: parsed.type,
      amount: parsed.amount,
      work_date: parsed.work_date,
      reason: parsed.reason,
      manager_id: approverId,
      status: 'pending',
    })
    .select()
    .single()

  if (error || !grant) throw new ActionError(error?.message ?? 'Request failed')

  await writeAudit(user.id, 'compoff.request', 'compoff_grant', grant.id, { after: grant })

  // Notify approver
  await notifyUser({
    user_id: approverId,
    type: 'compoff_request',
    title: 'New compoff request',
    body: `${user.full_name} requested ${parsed.amount} day(s) of ${parsed.type} for work done on ${parsed.work_date}.`,
    link_url: '/',
    related_entity_type: 'compoff_grant',
    related_entity_id: grant.id,
  })

  revalidatePath('/', 'layout')
  return grant
}

/**
 * Calendar data for the comp-off request planner: holidays + the team's
 * off-days for the past months (so the grid mirrors the leave planner), the two
 * comp-off types, and the days the user already requested (to mark them).
 * Shared by the self planner and the HR on-behalf planner.
 */
async function buildCompoffPlannerData(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string
) {
  const startDate = istMonthStart(-6)
  const endDate = istMonthEnd(0)

  const { data: memberships } = await adminClient
    .from('team_members')
    .select('team_id, is_primary')
    .eq('user_id', userId)
    .is('left_at', null)
  const primaryTeamId =
    (memberships ?? []).find((m) => m.is_primary)?.team_id ?? (memberships ?? [])[0]?.team_id ?? null

  const [{ data: holidays }, teamRes, allTypes, { data: grants }] = await Promise.all([
    adminClient.from('holidays').select('*').gte('date', startDate).lte('date', endDate).order('date'),
    primaryTeamId
      ? adminClient.from('teams').select('name, wfo_pattern, off_days').eq('id', primaryTeamId).maybeSingle()
      : Promise.resolve({ data: null }),
    listLeaveTypes(),
    adminClient
      .from('compoff_grants')
      .select('work_date, type, status')
      .eq('user_id', userId)
      .gte('work_date', startDate),
  ])

  const compoffTypes = allTypes
    .filter((t) => (t.category === 'compoff_leave' || t.category === 'compoff_wfh') && t.is_active)
    .map((t) => ({ key: t.key, name: t.name, category: t.category }))

  return {
    holidays: holidays ?? [],
    primaryTeam: teamRes.data ?? null,
    compoffTypes,
    existingGrants: grants ?? [],
  }
}

export async function getCompoffPlannerData() {
  const user = await requireUser()
  return buildCompoffPlannerData(createAdminClient(), user.id)
}

/** HR on-behalf comp-off planner data for a chosen employee. */
export async function getCompoffPlannerDataForUser(userId: string) {
  await requireCapability('approve_compoff')
  return buildCompoffPlannerData(createAdminClient(), userId)
}

const CompoffDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(['compoff_wfh', 'compoff_leave']),
  half_day: z.boolean().optional(),
})
const RequestCompoffPlanSchema = z.object({
  days: z.array(CompoffDaySchema).min(1, 'Pick at least one day').max(31),
  reason: z.string().trim().min(1, 'Reason required'),
})

/**
 * Request comp-off for one or more days at once via the calendar. Creates a
 * compoff_grant per day (1 day each, or 0.5 for a half day), with the per-day
 * type. Founders auto-approve; everyone else routes to their manager (HR
 * fallback) with one day-by-day notification.
 */
export async function requestCompoffPlan(input: z.infer<typeof RequestCompoffPlanSchema>) {
  const user = await requireUser()
  const parsed = RequestCompoffPlanSchema.parse(input)
  const today = todayIST()

  const days = Array.from(new Map(parsed.days.map((d) => [d.date, d])).values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  )
  for (const d of days) {
    if (d.date > today) {
      throw new ActionError('Comp-off is for work already done — future dates are not allowed.')
    }
  }

  const adminClient = createAdminClient()

  const { data: existing } = await adminClient
    .from('compoff_grants')
    .select('work_date')
    .eq('user_id', user.id)
    .in('work_date', days.map((d) => d.date))
  const existingDates = new Set((existing ?? []).map((g) => g.work_date))
  const dup = days.find((d) => existingDates.has(d.date))
  if (dup) throw new ActionError(`You already have a comp-off request for ${dup.date}.`)

  const isFounder = user.role === 'founder'
  let approverId: string | null = null
  if (!isFounder) {
    approverId = user.manager_id
    if (!approverId) {
      const { data: hrUser } = await adminClient
        .from('users')
        .select('id')
        .in('role', ['hr', 'founder'] as unknown as ('hr' | 'founder')[])
        .eq('status', 'active')
        .neq('id', user.id)
        .limit(1)
        .maybeSingle()
      approverId = hrUser?.id ?? null
    }
    if (!approverId) throw new ActionError('No approver available. Contact your founder or HR.')
  }

  const decidedAt = new Date().toISOString()
  const grants = days.map((d) => ({
    user_id: user.id,
    type: d.type,
    amount: d.half_day ? 0.5 : 1,
    work_date: d.date,
    reason: parsed.reason,
    manager_id: isFounder ? user.id : approverId!,
    status: isFounder ? ('approved' as const) : ('pending' as const),
    ...(isFounder ? { decided_by: user.id, decided_at: decidedAt } : {}),
  }))

  const { data: inserted, error } = await adminClient.from('compoff_grants').insert(grants).select('id')
  if (error || !inserted) throw new ActionError(error?.message ?? 'Comp-off request failed')

  await writeAudit(user.id, 'compoff.request_plan', 'compoff_grant', 'batch', {
    after: { count: inserted.length, autoApproved: isFounder },
  })

  if (!isFounder && approverId) {
    const total = days.reduce((s, d) => s + (d.half_day ? 0.5 : 1), 0)
    const leaveCount = days.filter((d) => d.type === 'compoff_leave').length
    const wfhCount = days.filter((d) => d.type === 'compoff_wfh').length
    const summary = [
      leaveCount ? `${leaveCount} Comp-off Leave` : null,
      wfhCount ? `${wfhCount} Comp-off WFH` : null,
    ]
      .filter(Boolean)
      .join(' and ')
    const requesterMention = await slackMentionById(adminClient, user.id)
    const compoffDays = slackCompoffLines(
      days.map((d) => ({ date: d.date, type: d.type, half: Boolean(d.half_day) }))
    )
    await notifyUser({
      user_id: approverId,
      type: 'compoff_request',
      title: 'New comp-off request',
      body: `${user.full_name} requested ${total} day(s) of comp-off across ${days.length} day(s).`,
      link_url: '/',
      slackDm: true,
      slackText: `*Comp-off approval needed*\n${requesterMention} applied for *${summary}*\n> *Worked on:*\n${compoffDays}\n> Reason: ${parsed.reason}`,
      slackLinkLabel: 'Approve or reject in Orbit',
    })
  }

  revalidatePath('/', 'layout')
  await revalidateHR()
  return { count: inserted.length }
}

const RequestCompoffPlanForUserSchema = RequestCompoffPlanSchema.extend({
  user_id: z.string().uuid(),
})

/**
 * HR grants comp-off to an employee via the calendar. Same rules as the
 * self-service planner, but added directly as APPROVED (credited immediately,
 * no manager approval), and the employee + their manager are notified day by day.
 */
export async function requestCompoffPlanForUser(
  input: z.infer<typeof RequestCompoffPlanForUserSchema>
) {
  const actor = await requireCapability('approve_compoff')
  const parsed = RequestCompoffPlanForUserSchema.parse(input)
  const today = todayIST()

  const days = Array.from(new Map(parsed.days.map((d) => [d.date, d])).values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  )
  for (const d of days) {
    if (d.date > today) {
      throw new ActionError('Comp-off is for work already done — future dates are not allowed.')
    }
  }

  const adminClient = createAdminClient()
  const { data: employee } = await adminClient
    .from('users')
    .select('id, full_name, manager_id')
    .eq('id', parsed.user_id)
    .maybeSingle()
  if (!employee) throw new ActionError('Employee not found')

  const { data: existing } = await adminClient
    .from('compoff_grants')
    .select('work_date')
    .eq('user_id', parsed.user_id)
    .in('work_date', days.map((d) => d.date))
  const existingDates = new Set((existing ?? []).map((g) => g.work_date))
  const dup = days.find((d) => existingDates.has(d.date))
  if (dup) throw new ActionError(`A comp-off entry already exists for ${dup.date}.`)

  const decidedAt = new Date().toISOString()
  const grants = days.map((d) => ({
    user_id: parsed.user_id,
    type: d.type,
    amount: d.half_day ? 0.5 : 1,
    work_date: d.date,
    reason: parsed.reason,
    manager_id: actor.id,
    status: 'approved' as const,
    decided_by: actor.id,
    decided_at: decidedAt,
  }))

  const { data: inserted, error } = await adminClient.from('compoff_grants').insert(grants).select('id')
  if (error || !inserted) throw new ActionError(error?.message ?? 'Comp-off grant failed')

  await writeAudit(actor.id, 'compoff.grant_for_user', 'compoff_grant', 'batch', {
    after: { user_id: parsed.user_id, count: inserted.length },
  })

  const total = days.reduce((s, d) => s + (d.half_day ? 0.5 : 1), 0)
  const compoffDays = slackCompoffLines(
    days.map((d) => ({ date: d.date, type: d.type, half: Boolean(d.half_day) }))
  )
  const adderMention = await slackMentionById(adminClient, actor.id)
  const employeeMention = await slackMentionById(adminClient, parsed.user_id)

  await notifyUser({
    user_id: parsed.user_id,
    type: 'compoff_granted',
    title: 'Comp-off was added to your balance',
    body: `${actor.full_name} added ${total} comp-off day(s) to your balance.`,
    link_url: '/leaves',
    slackDm: true,
    slackText: `⭐ Comp-off was added to your balance\n> *Earned for working:*\n${compoffDays}\n> Added by ${adderMention}`,
  })

  const managerId = employee.manager_id
  if (managerId && managerId !== parsed.user_id && managerId !== actor.id) {
    await notifyUser({
      user_id: managerId,
      type: 'compoff_granted_for_report',
      title: 'Comp-off was added for your report',
      body: `${actor.full_name} added ${total} comp-off day(s) for ${employee.full_name}.`,
      link_url: '/',
      slackDm: true,
      slackText: `Comp-off record updated for ${employeeMention}\n> *Earned for working:*\n${compoffDays}\n> Added by ${adderMention}`,
    })
  }

  revalidatePath('/', 'layout')
  await revalidateHR()
  return { count: inserted.length }
}

/** Map a CSV `type` cell to a comp-off type, accepting a few friendly aliases. */
function normalizeCompoffType(raw: string): 'compoff_leave' | 'compoff_wfh' | null {
  const t = raw.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (['compoff_leave', 'comp_off_leave', 'comp_leave', 'leave'].includes(t)) return 'compoff_leave'
  if (['compoff_wfh', 'comp_off_wfh', 'comp_wfh', 'wfh'].includes(t)) return 'compoff_wfh'
  return null
}

/** A truthy `half_day` cell means a half-day (0.5) credit; blank means a full day. */
function isHalfDayCell(raw: string): boolean {
  return ['true', 'yes', 'y', 'half', '0.5'].includes(raw.trim().toLowerCase())
}

/**
 * Bulk-grant comp-off from a CSV (HR Console). Each row credits one person's
 * balance for a day they worked. Columns: email, type, work_date, half_day,
 * reason. Like the single "Add comp-off" flow, grants are inserted as APPROVED
 * (credited immediately by the DB trigger) and the employee + manager are
 * notified day by day. Validation is all-or-nothing: if any row is bad, nothing
 * is imported.
 */
export async function importCompoffGrantsCsv(rows: Record<string, string>[]) {
  const actor = await requireCapability('approve_compoff')
  const adminClient = createAdminClient()
  const today = todayIST()
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

  const { data: usersData } = await adminClient
    .from('users')
    .select('id, email, full_name, manager_id')
    .eq('status', 'active')
  const userByEmail = new Map((usersData ?? []).map((u) => [u.email.toLowerCase(), u]))
  const userById = new Map((usersData ?? []).map((u) => [u.id, u]))

  type Prepared = {
    row: number
    user_id: string
    type: 'compoff_leave' | 'compoff_wfh'
    work_date: string
    amount: number
    reason: string
  }
  const errors: { row: number; error: string }[] = []
  const prepared: Prepared[] = []

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i]
    const rowNumber = Number(raw.__row ?? i + 1)
    const email = (raw.email ?? '').trim().toLowerCase()
    const typeRaw = (raw.type ?? '').trim()
    const workDate = (raw.work_date ?? '').trim()
    const reason = (raw.reason ?? '').trim()

    if (!email) {
      errors.push({ row: rowNumber, error: 'email required' })
      continue
    }
    const user = userByEmail.get(email)
    if (!user) {
      errors.push({ row: rowNumber, error: `No active user with email ${email}` })
      continue
    }
    const type = normalizeCompoffType(typeRaw)
    if (!type) {
      errors.push({ row: rowNumber, error: `type must be compoff_leave or compoff_wfh (got "${typeRaw}")` })
      continue
    }
    if (!DATE_RE.test(workDate)) {
      errors.push({ row: rowNumber, error: 'work_date must be YYYY-MM-DD' })
      continue
    }
    if (workDate > today) {
      errors.push({ row: rowNumber, error: 'work_date cannot be in the future' })
      continue
    }
    if (!reason) {
      errors.push({ row: rowNumber, error: 'reason required' })
      continue
    }
    prepared.push({
      row: rowNumber,
      user_id: user.id,
      type,
      work_date: workDate,
      amount: isHalfDayCell(raw.half_day ?? '') ? 0.5 : 1,
      reason,
    })
  }

  // One comp-off per (person, work_date): check the DB and within this batch.
  const involved = Array.from(new Set(prepared.map((p) => p.user_id)))
  const existingByUser = new Map<string, Set<string>>()
  if (involved.length > 0) {
    const { data: existing } = await adminClient
      .from('compoff_grants')
      .select('user_id, work_date')
      .in('user_id', involved)
    for (const g of existing ?? []) {
      const set = existingByUser.get(g.user_id) ?? new Set<string>()
      set.add(g.work_date)
      existingByUser.set(g.user_id, set)
    }
  }
  const batchByUser = new Map<string, Set<string>>()
  for (const p of prepared) {
    const batchSet = batchByUser.get(p.user_id) ?? new Set<string>()
    if (existingByUser.get(p.user_id)?.has(p.work_date)) {
      errors.push({ row: p.row, error: `A comp-off entry already exists for ${p.work_date}` })
    } else if (batchSet.has(p.work_date)) {
      errors.push({ row: p.row, error: `Duplicate ${p.work_date} for the same person in this CSV` })
    } else {
      batchSet.add(p.work_date)
      batchByUser.set(p.user_id, batchSet)
    }
  }

  if (errors.length > 0) return { imported: 0, errors }
  if (prepared.length === 0) return { imported: 0, errors: [{ row: 0, error: 'No rows to import' }] }

  const decidedAt = new Date().toISOString()
  const { data: inserted, error } = await adminClient
    .from('compoff_grants')
    .insert(
      prepared.map((p) => ({
        user_id: p.user_id,
        type: p.type,
        amount: p.amount,
        work_date: p.work_date,
        reason: p.reason,
        manager_id: actor.id,
        status: 'approved' as const,
        decided_by: actor.id,
        decided_at: decidedAt,
      }))
    )
    .select('id')
  if (error || !inserted) {
    return { imported: 0, errors: [{ row: 0, error: error?.message ?? 'Insert failed' }] }
  }

  // Notify each employee (and their manager) about everything added for them.
  const adderMention = await slackMentionById(adminClient, actor.id)
  const byUser = new Map<string, Prepared[]>()
  for (const p of prepared) {
    const arr = byUser.get(p.user_id) ?? []
    arr.push(p)
    byUser.set(p.user_id, arr)
  }
  for (const [userId, list] of byUser.entries()) {
    const employee = userById.get(userId)
    if (!employee) continue
    const compoffDays = slackCompoffLines(
      list.map((r) => ({ date: r.work_date, type: r.type, half: r.amount === 0.5 }))
    )
    const total = list.reduce((s, r) => s + r.amount, 0)

    await notifyUser({
      user_id: userId,
      type: 'compoff_granted',
      title: 'Comp-off was added to your balance',
      body: `${actor.full_name} added ${total} comp-off day(s) to your balance.`,
      link_url: '/leaves',
      slackDm: true,
      slackText: `⭐ Comp-off was added to your balance\n> *Earned for working:*\n${compoffDays}\n> Added by ${adderMention}`,
    })

    const managerId = employee.manager_id
    if (managerId && managerId !== userId && managerId !== actor.id) {
      const employeeMention = await slackMentionById(adminClient, userId)
      await notifyUser({
        user_id: managerId,
        type: 'compoff_granted_for_report',
        title: 'Comp-off was added for your report',
        body: `${actor.full_name} added ${total} comp-off day(s) for ${employee.full_name}.`,
        link_url: '/',
        slackDm: true,
        slackText: `Comp-off record updated for ${employeeMention}\n> *Earned for working:*\n${compoffDays}\n> Added by ${adderMention}`,
      })
    }
  }

  await writeAudit(actor.id, 'compoff.import_csv', 'compoff_grant', 'batch', {
    after: { imported: inserted.length },
  })
  revalidatePath('/', 'layout')
  await revalidateHR()
  return { imported: inserted.length, errors }
}
