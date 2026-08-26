import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { notifyUser } from '@/lib/actions/notifications'
import {
  dmLockupUser,
  getLockupSlackSettings,
  lockupLink,
  postLockupChannelUrgent,
} from '@/lib/slack-lockup'

type AdminClient = SupabaseClient<Database>

// Daily Lockup sweep (called by /api/cron/equipment-sweep):
//   1. Due-today reminders + overdue reminders to holders
//   2. Overdue digest to equipment managers
//   3. Auto-expire reservations not picked up within 24h of shoot start
//   4. "Expected back today" repair reminders to managers

function istDay(iso: string | Date): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function fmtDayTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  })
}

async function notify(
  admin: AdminClient,
  input: { user_id: string; type: string; title: string; body: string; link_url?: string }
): Promise<void> {
  await notifyUser({
    user_id: input.user_id,
    type: input.type,
    title: input.title,
    body: input.body,
    link_url: input.link_url,
  })
  const { data: target } = await admin
    .from('users')
    .select('id, email, slack_user_id, notifications_muted')
    .eq('id', input.user_id)
    .single()
  if (!target || target.notifications_muted) return
  const link = input.link_url ? lockupLink(input.link_url, 'Open in Lockup') : null
  await dmLockupUser(
    admin,
    target,
    [`*${input.title}*`, input.body, link].filter(Boolean).join('\n'),
    'reminder'
  )
}

async function equipmentManagerIds(admin: AdminClient): Promise<string[]> {
  const { data } = await admin
    .from('user_capabilities')
    .select('user_id')
    .eq('capability_key', 'manage_equipment')
  const ids = Array.from(new Set((data ?? []).map((r) => r.user_id)))
  if (ids.length === 0) return []
  const { data: active } = await admin
    .from('users')
    .select('id')
    .in('id', ids)
    .eq('status', 'active')
  return (active ?? []).map((u) => u.id)
}

export type SweepResult = {
  due_today_reminders: number
  overdue_reminders: number
  reservations_expired: number
  repair_reminders: number
  shoots_archived: number
  shoots_deleted: number
  /** Past retention but skipped: their gear is still out. */
  shoots_kept_gear_out: number
  /** Overdue items escalated to the tech lead and the holder's manager. */
  escalated_to_leads: number
  /** True when the overdue list was posted to the Lockup channel today. */
  posted_to_channel: boolean
}

export async function runLockupSweep(admin: AdminClient): Promise<SweepResult> {
  const now = new Date()
  const today = istDay(now)
  const result: SweepResult = {
    due_today_reminders: 0,
    overdue_reminders: 0,
    reservations_expired: 0,
    repair_reminders: 0,
    shoots_archived: 0,
    shoots_deleted: 0,
    shoots_kept_gear_out: 0,
    escalated_to_leads: 0,
    posted_to_channel: false,
  }

  // ---------- 0a: archive shoots as soon as they finish ----------
  // A shoot that is over is over; it moves to Finished the same day rather
  // than lingering as "planned" for a week.
  const { data: archived } = await admin
    .from('equipment_shoots')
    .update({ status: 'done' })
    .in('status', ['planned', 'active'] as unknown as ('planned' | 'active')[])
    .lt('ends_at', now.toISOString())
    .select('id')
  result.shoots_archived = archived?.length ?? 0

  // ---------- 0b: delete shoots 90 days after they finished ----------
  // Retention, not tidying: 90 days matches how far back the app shows shoots
  // at all, so nothing visible is lost. Reservations, editors and studio
  // blocks cascade away with the shoot. Checkouts do NOT: they are the gear's
  // own history and survive with shoot_id set to null (migration 032).
  const deleteCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const { data: expired } = await admin
    .from('equipment_shoots')
    .select('id, name, ends_at, owner_id')
    .in('status', ['done', 'cancelled'] as unknown as ('done' | 'cancelled')[])
    .lt('ends_at', deleteCutoff)
    .limit(200)

  for (const shoot of expired ?? []) {
    // Same rule the manual buttons follow: a shoot whose gear never came back
    // is not tidied away, it is left standing as the record of who has it.
    const { data: stillOut } = await admin
      .from('equipment_checkouts')
      .select('id')
      .eq('shoot_id', shoot.id)
      .is('returned_at', null)
      .limit(1)
    if (stillOut && stillOut.length > 0) {
      result.shoots_kept_gear_out++
      continue
    }

    const { error } = await admin.from('equipment_shoots').delete().eq('id', shoot.id)
    if (error) {
      // Never let one stubborn row stop the rest of the sweep.
      console.error('[lockup-sweep] could not delete shoot', shoot.id, error.message)
      continue
    }
    result.shoots_deleted++
    // Deleting production data leaves a trail, always. audit_log.actor_id is
    // NOT NULL and there is no system user, so the row is attributed to the
    // shoot's owner — the note makes clear nobody actually pressed anything.
    await admin.from('audit_log').insert({
      actor_id: shoot.owner_id,
      action: 'equipment.shoot_retention_delete',
      entity_type: 'equipment_shoot',
      entity_id: shoot.id,
      note: `Retention sweep (automatic) deleted "${shoot.name}", which finished ${shoot.ends_at}, after the 90-day window. Gear history for its items is unaffected.`,
    })
  }

  // ---------- 1 + 2: due today / overdue ----------
  const { data: openCheckouts } = await admin
    .from('equipment_checkouts')
    .select('*')
    .is('returned_at', null)
  // Assigned-device loans have no due date — they never trigger reminders.
  const checkouts = (openCheckouts ?? []).filter(
    (c): c is typeof c & { due_at: string } => c.due_at !== null
  )

  const itemIds = Array.from(new Set(checkouts.map((c) => c.item_id)))
  const { data: items } = itemIds.length
    ? await admin.from('equipment_items').select('id, name, code').in('id', itemIds)
    : { data: [] as { id: string; name: string; code: string }[] }
  const itemMap = new Map((items ?? []).map((i) => [i.id, i]))
  const label = (itemId: string) => {
    const item = itemMap.get(itemId)
    return item ? `${item.name} (${item.code})` : 'an item'
  }

  const overdue = checkouts.filter((c) => new Date(c.due_at) < now)
  const dueToday = checkouts.filter(
    (c) => new Date(c.due_at) >= now && istDay(c.due_at) === today
  )

  // Group per holder so one person gets one message, not five
  const byHolder = (list: typeof checkouts) => {
    const map = new Map<string, typeof checkouts>()
    for (const c of list) {
      const arr = map.get(c.holder_id) ?? []
      arr.push(c)
      map.set(c.holder_id, arr)
    }
    return map
  }

  for (const [holderId, list] of byHolder(dueToday)) {
    const lines = list.map((c) => `${label(c.item_id)}: due ${fmtDayTime(c.due_at)}`)
    await notify(admin, {
      user_id: holderId,
      type: 'lockup_due_today',
      title: list.length === 1 ? 'Gear due back today' : `${list.length} items due back today`,
      body: lines.join('\n'),
      link_url: '/lockup?tab=mine',
    })
    result.due_today_reminders++
  }

  for (const [holderId, list] of byHolder(overdue)) {
    const lines = list.map((c) => `${label(c.item_id)}: was due ${fmtDayTime(c.due_at)}`)
    await notify(admin, {
      user_id: holderId,
      type: 'lockup_overdue',
      title: list.length === 1 ? 'Gear is overdue' : `${list.length} items are overdue`,
      body: lines.join('\n') + '\nPlease return the gear or extend by checking it in and out again.',
      link_url: '/lockup?tab=mine',
    })
    result.overdue_reminders++
  }

  // ---------- 2b: escalate ----------
  // Day N: the tech lead (set in the Tech Console Slack tab) and the holder's
  // own manager hear about it. Day M: it goes to the Lockup channel. The daily
  // DM to the holder keeps running underneath either way.
  if (overdue.length > 0) {
    const settings = await getLockupSlackSettings(admin)
    const daysLate = (dueAt: string) =>
      Math.floor((now.getTime() - new Date(dueAt).getTime()) / 86400000)

    const forLeads = overdue.filter((c) => daysLate(c.due_at) >= settings.escalateToLeadsAfterDays)
    if (forLeads.length > 0) {
      const holderIds = Array.from(new Set(forLeads.map((c) => c.holder_id)))
      const { data: holderRows } = await admin
        .from('users')
        .select('id, full_name, manager_id')
        .in('id', holderIds)
      const holderById = new Map((holderRows ?? []).map((h) => [h.id, h]))

      // Each recipient gets ONE message about everything they need to chase,
      // not one per item.
      const linesFor = (list: typeof forLeads) =>
        list
          .map(
            (c) =>
              `${label(c.item_id)}: with ${holderById.get(c.holder_id)?.full_name ?? 'someone'}, ${daysLate(c.due_at)} day(s) late (due ${fmtDayTime(c.due_at)})`
          )
          .join('\n')

      // The tech lead, if one is named; otherwise every equipment manager.
      const leadIds = settings.techLeadUserId
        ? [settings.techLeadUserId]
        : await equipmentManagerIds(admin)
      for (const leadId of leadIds) {
        await notify(admin, {
          user_id: leadId,
          type: 'lockup_overdue_escalation',
          title: `${forLeads.length} overdue item(s) need chasing`,
          body: linesFor(forLeads),
          link_url: '/tech?tab=overdue',
        })
        result.escalated_to_leads++
      }

      // Each holder's own manager, about their reports only.
      const byManager = new Map<string, typeof forLeads>()
      for (const c of forLeads) {
        const managerId = holderById.get(c.holder_id)?.manager_id
        if (!managerId || managerId === c.holder_id) continue
        byManager.set(managerId, [...(byManager.get(managerId) ?? []), c])
      }
      for (const [managerId, list] of byManager) {
        // A lead who is also someone's manager already got the full list.
        if (leadIds.includes(managerId)) continue
        await notify(admin, {
          user_id: managerId,
          type: 'lockup_overdue_escalation',
          title: `Someone on your team has overdue gear`,
          body: linesFor(list),
          link_url: '/tech?tab=overdue',
        })
        result.escalated_to_leads++
      }
    }

    const forChannel = overdue.filter(
      (c) => daysLate(c.due_at) >= settings.escalateToChannelAfterDays
    )
    if (forChannel.length > 0) {
      const { data: chHolders } = await admin
        .from('users')
        .select('id, full_name')
        .in('id', Array.from(new Set(forChannel.map((c) => c.holder_id))))
      const chName = new Map((chHolders ?? []).map((h) => [h.id, h.full_name]))
      const lines = forChannel
        .map(
          (c) =>
            `• ${label(c.item_id)} — ${chName.get(c.holder_id) ?? 'someone'}, ${daysLate(c.due_at)} day(s) late`
        )
        .join('\n')
      await postLockupChannelUrgent(
        `⏰ *Gear that is more than ${settings.escalateToChannelAfterDays} day(s) overdue*\n${lines}\n\nIf you have one of these, please drop it back in the cupboard.`
      )
      result.posted_to_channel = true
    }
  }

  if (overdue.length > 0) {
    const holderIds = Array.from(new Set(overdue.map((c) => c.holder_id)))
    const { data: holders } = await admin
      .from('users')
      .select('id, full_name')
      .in('id', holderIds)
    const holderName = new Map((holders ?? []).map((h) => [h.id, h.full_name]))
    const digest = overdue
      .map(
        (c) =>
          `${label(c.item_id)}: with ${holderName.get(c.holder_id) ?? 'unknown'}, was due ${fmtDayTime(c.due_at)}`
      )
      .join('\n')
    for (const managerId of await equipmentManagerIds(admin)) {
      await notify(admin, {
        user_id: managerId,
        type: 'lockup_overdue_digest',
        title: `Lockup: ${overdue.length} overdue item(s)`,
        body: digest,
        link_url: '/tech',
      })
    }
  }

  // ---------- 3: expire stale reservations ----------
  // Pending (awaiting-approval) reservations expire on the same clock: an
  // unapproved request is pointless once the pickup window has passed.
  const { data: activeReservations } = await admin
    .from('equipment_reservations')
    .select('*')
    .in('status', ['active', 'pending'] as unknown as ('active' | 'pending')[])
  if (activeReservations && activeReservations.length > 0) {
    const shootIds = Array.from(
      new Set(activeReservations.flatMap((r) => (r.shoot_id ? [r.shoot_id] : [])))
    )
    const { data: shoots } = await admin
      .from('equipment_shoots')
      .select('*')
      .in('id', shootIds)
    const shootMap = new Map((shoots ?? []).map((s) => [s.id, s]))

    const resItemIds = Array.from(new Set(activeReservations.map((r) => r.item_id)))
    const { data: resItems } = await admin
      .from('equipment_items')
      .select('id, name, code')
      .in('id', resItemIds)
    const resItemMap = new Map((resItems ?? []).map((i) => [i.id, i]))

    for (const r of activeReservations) {
      // Expire 24h after the window opens (shoot start, or the hold's own
      // start), whether or not there is a shoot behind it.
      let windowStart: Date | null = null
      let label = ''
      let link = '/lockup?tab=mine'
      if (r.shoot_id) {
        const shoot = shootMap.get(r.shoot_id)
        if (!shoot || shoot.status === 'cancelled' || shoot.status === 'done') continue
        windowStart = new Date(shoot.starts_at)
        label = `for ${shoot.name}`
        link = `/lockup/shoots/${shoot.id}`
      } else if (r.starts_at) {
        windowStart = new Date(r.starts_at)
        label = 'you held'
      }
      if (!windowStart) continue
      const cutoff = new Date(windowStart.getTime() + 24 * 60 * 60 * 1000)
      if (now <= cutoff) continue

      await admin
        .from('equipment_reservations')
        .update({ status: 'expired', resolved_at: now.toISOString() })
        .eq('id', r.id)
        .in('status', ['active', 'pending'] as unknown as ('active' | 'pending')[])
      result.reservations_expired++

      const item = resItemMap.get(r.item_id)
      await notify(admin, {
        user_id: r.reserved_by,
        type: 'lockup_reservation_expired',
        title: 'Reservation expired',
        body: `Your reservation of ${item ? `${item.name} (${item.code})` : 'an item'} ${label} expired because it was not picked up within 24 hours of the window opening.`,
        link_url: link,
      })
    }
  }

  // ---------- 4: repairs expected back today ----------
  const { data: dueRepairs } = await admin
    .from('equipment_repairs')
    .select('*')
    .is('returned_at', null)
    .eq('expected_back_on', today)
  if (dueRepairs && dueRepairs.length > 0) {
    const repairItemIds = dueRepairs.map((r) => r.item_id)
    const { data: repairItems } = await admin
      .from('equipment_items')
      .select('id, name, code')
      .in('id', repairItemIds)
    const repairItemMap = new Map((repairItems ?? []).map((i) => [i.id, i]))
    const lines = dueRepairs.map((r) => {
      const item = repairItemMap.get(r.item_id)
      return `${item ? `${item.name} (${item.code})` : 'An item'}${r.vendor ? ` at ${r.vendor}` : ''} is expected back today`
    })
    for (const managerId of await equipmentManagerIds(admin)) {
      await notify(admin, {
        user_id: managerId,
        type: 'lockup_repair_due',
        title: 'Repairs expected back today',
        body: lines.join('\n'),
        link_url: '/tech?tab=repairs',
      })
      result.repair_reminders++
    }
  }

  return result
}
