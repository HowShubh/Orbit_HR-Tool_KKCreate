import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { notifyUser } from '@/lib/actions/notifications'
import { dmLockupUser, lockupLink } from '@/lib/slack-lockup'

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
  }

  // ---------- 0: archive finished shoots ----------
  // A week after a shoot's last day it is marked done (the list already hides
  // it at that point; this keeps the stored status honest too).
  const archiveCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: archived } = await admin
    .from('equipment_shoots')
    .update({ status: 'done' })
    .in('status', ['planned', 'active'] as unknown as ('planned' | 'active')[])
    .lt('ends_at', archiveCutoff)
    .select('id')
  result.shoots_archived = archived?.length ?? 0

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
    const shootIds = Array.from(new Set(activeReservations.map((r) => r.shoot_id)))
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
      const shoot = shootMap.get(r.shoot_id)
      if (!shoot || shoot.status === 'cancelled' || shoot.status === 'done') continue
      const cutoff = new Date(new Date(shoot.starts_at).getTime() + 24 * 60 * 60 * 1000)
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
        body: `Your reservation of ${item ? `${item.name} (${item.code})` : 'an item'} for ${shoot.name} expired because it was not picked up within 24 hours of the shoot start.`,
        link_url: `/lockup/shoots/${shoot.id}`,
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
