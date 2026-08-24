'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import type { Tables, Updates } from '@/lib/supabase/database.types'
import { ActionError } from './errors'
import { requireUser, requireCapability, writeAudit, revalidateHR } from './_helpers'
import { notifyUser } from './notifications'
import {
  dmLockupUser,
  lockupLink,
  lockupSlackApi,
  postLockupChannel,
  resolveSlackUserId,
} from '@/lib/slack-lockup'
import { generateItemCode } from '@/lib/lockup/codes'
import { EQUIPMENT_CATEGORIES, type EquipmentCategory } from '@/lib/lockup/constants'
import {
  getAvailabilityForWindow,
  getItemByCode,
  getItemHistory,
  type AvailabilityRow,
  type EquipmentItemRow,
  type ItemHistoryEvent,
} from '@/lib/queries/lockup'

type Admin = ReturnType<typeof createAdminClient>

// ============================================================
// Formatting + notification helpers
// ============================================================

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  })
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

/** In-app notification + Lockup-bot Slack DM (both respect notifications_muted). */
async function notifyLockup(input: {
  user_id: string
  type: string
  title: string
  body: string
  link_url?: string
}): Promise<void> {
  await notifyUser({
    user_id: input.user_id,
    type: input.type,
    title: input.title,
    body: input.body,
    link_url: input.link_url,
  })
  const admin = createAdminClient()
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
    [`*${input.title}*`, input.body, link].filter(Boolean).join('\n')
  )
}

/** Everyone who holds manage_equipment (individual grant or bundle-sourced). */
async function equipmentManagerIds(admin: Admin): Promise<string[]> {
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

async function notifyManagers(
  admin: Admin,
  exceptUserId: string | null,
  input: { type: string; title: string; body: string; link_url?: string }
): Promise<void> {
  const managers = await equipmentManagerIds(admin)
  await Promise.all(
    managers
      .filter((id) => id !== exceptUserId)
      .map((id) => notifyLockup({ user_id: id, ...input }))
  )
}

/** Non-throwing manage_equipment check (requireCapability throws). */
async function isEquipmentManager(admin: Admin, user: Tables<'users'>): Promise<boolean> {
  if (user.role === 'founder' || user.role === 'hr') return true
  const { data: grants } = await admin
    .from('user_capabilities')
    .select('id')
    .eq('user_id', user.id)
    .eq('capability_key', 'manage_equipment')
    .limit(1)
  return !!grants && grants.length > 0
}

async function getItemOrThrow(admin: Admin, itemId: string): Promise<Tables<'equipment_items'>> {
  const { data: item } = await admin
    .from('equipment_items')
    .select('*')
    .eq('id', itemId)
    .maybeSingle()
  if (!item) throw new ActionError('Item not found.')
  return item
}

function itemLabel(item: { name: string; code: string }): string {
  return `${item.name} (${item.code})`
}

async function userName(admin: Admin, userId: string | null): Promise<string | null> {
  if (!userId) return null
  const { data } = await admin.from('users').select('full_name').eq('id', userId).maybeSingle()
  return data?.full_name ?? null
}

// ============================================================
// Scanner lookup
// ============================================================

/** Scanner cart lookup: full live item state by QR code. */
export async function lookupItemByCode(code: string): Promise<EquipmentItemRow | null> {
  await requireUser()
  return getItemByCode(code)
}

/** History is loaded lazily (only when someone opens the History section), so
 *  item pages and item sheets render without paying for it. */
/** Wizard gear step: availability against a window that has no shoot yet. */
export async function fetchWindowAvailability(
  startsAt: string,
  endsAt: string
): Promise<AvailabilityRow[]> {
  await requireUser()
  return getAvailabilityForWindow(startsAt, endsAt)
}

export async function fetchItemHistory(itemId: string): Promise<ItemHistoryEvent[]> {
  await requireUser()
  return getItemHistory(itemId)
}

// ============================================================
// Checkout (cart, two-phase warn-but-allow)
// ============================================================

export type CheckoutWarning = {
  item_id: string
  item_name: string
  message: string
  reserved_by: string
  shoot_name: string
}

export type CheckoutResult =
  | { status: 'warnings'; warnings: CheckoutWarning[] }
  | { status: 'done'; count: number }

export async function checkoutItems(input: {
  itemIds: string[]
  dueAt: string
  shootId?: string
  /** false = dry-run that reports reservation conflicts; true = commit anyway */
  confirm: boolean
}): Promise<CheckoutResult> {
  const user = await requireUser()
  const admin = createAdminClient()

  if (input.itemIds.length === 0) throw new ActionError('No items selected.')
  const dueAt = new Date(input.dueAt)
  if (isNaN(dueAt.getTime()) || dueAt <= new Date()) {
    throw new ActionError('Pick a return date and time in the future.')
  }

  const { data: items } = await admin
    .from('equipment_items')
    .select('*')
    .in('id', input.itemIds)
  const itemList = items ?? []
  if (itemList.length !== input.itemIds.length) {
    throw new ActionError('Some items no longer exist.')
  }

  // Live (active or pending-approval) reservations for these items, joined
  // with live shoots. Pending counts as real intent for conflict warnings.
  const { data: reservations } = await admin
    .from('equipment_reservations')
    .select('*')
    .in('item_id', input.itemIds)
    .in('status', ['active', 'pending'] as unknown as ('active' | 'pending')[])
  const shootIds = Array.from(new Set((reservations ?? []).map((r) => r.shoot_id)))
  const { data: shoots } = shootIds.length
    ? await admin.from('equipment_shoots').select('*').in('id', shootIds)
    : { data: [] as Tables<'equipment_shoots'>[] }
  const shootMap = new Map((shoots ?? []).map((s) => [s.id, s]))

  // Validate each item's takeability + collect foreign-reservation warnings
  const warnings: CheckoutWarning[] = []
  const pickupReservations = new Map<string, Tables<'equipment_reservations'>>()
  const actorIsManager = await isEquipmentManager(admin, user)

  for (const item of itemList) {
    if (item.kind === 'assigned') {
      throw new ActionError(
        `${itemLabel(item)} is an assigned device. Open it to borrow it, it isn't part of shoot checkout.`
      )
    }
    if (item.status === 'retired' || item.status === 'lost') {
      throw new ActionError(`${itemLabel(item)} is marked ${item.status} and cannot be taken.`)
    }
    if (item.status === 'in_repair') {
      throw new ActionError(`${itemLabel(item)} is in repair.`)
    }
    if (item.status === 'checked_out') {
      throw new ActionError(
        `${itemLabel(item)} is already checked out. Open its page to take it over instead.`
      )
    }

    const itemReservations = (reservations ?? []).filter((r) => r.item_id === item.id)

    // Approval gate: a flagged item leaves the cupboard only against an
    // APPROVED reservation for this checkout's shoot (managers are exempt).
    // Without this, the approval flag could be bypassed by not reserving.
    if (item.requires_approval && !actorIsManager) {
      const mine = input.shootId
        ? itemReservations.find((r) => r.shoot_id === input.shootId)
        : undefined
      if (!mine || mine.status !== 'active') {
        throw new ActionError(
          mine?.status === 'pending'
            ? `${itemLabel(item)} is still awaiting approval. Ask the tech lead to approve it first.`
            : `${itemLabel(item)} needs tech lead approval. Reserve it through a shoot first.`
        )
      }
    }

    for (const r of itemReservations) {
      const shoot = shootMap.get(r.shoot_id)
      if (!shoot || shoot.status === 'cancelled' || shoot.status === 'done') continue
      if (input.shootId && r.shoot_id === input.shootId) {
        // Picking up gear reserved for this very shoot — not a conflict.
        // Only an approved reservation flips to picked_up; a pending one
        // (manager exemption path) stays pending for the approval queue.
        if (r.status === 'active') pickupReservations.set(item.id, r)
        continue
      }
      // Conflict when the reservation's shoot window overlaps [now, dueAt]
      const overlaps =
        new Date(shoot.starts_at) <= dueAt && new Date() <= new Date(shoot.ends_at)
      if (overlaps) {
        warnings.push({
          item_id: item.id,
          item_name: itemLabel(item),
          message: `Reserved for ${shoot.name} (${fmtDay(shoot.starts_at)} to ${fmtDay(shoot.ends_at)})`,
          reserved_by: r.reserved_by,
          shoot_name: shoot.name,
        })
      }
    }
  }

  if (warnings.length > 0 && !input.confirm) {
    return { status: 'warnings', warnings }
  }

  // Commit
  for (const item of itemList) {
    const { data: checkout, error } = await admin
      .from('equipment_checkouts')
      .insert({
        item_id: item.id,
        holder_id: user.id,
        due_at: dueAt.toISOString(),
        shoot_id: input.shootId ?? null,
      })
      .select('id')
      .single()
    if (error || !checkout) throw new ActionError(error?.message ?? 'Checkout failed.')

    const { error: itemError } = await admin
      .from('equipment_items')
      .update({
        status: 'checked_out',
        current_holder_id: user.id,
        current_checkout_id: checkout.id,
        current_location_id: null, // it is with a person now, not in a cupboard
      })
      .eq('id', item.id)
      .eq('status', 'available') // optimistic guard against double checkout
    if (itemError) throw new ActionError(itemError.message)

    const pickup = pickupReservations.get(item.id)
    if (pickup) {
      await admin
        .from('equipment_reservations')
        .update({ status: 'picked_up', resolved_at: new Date().toISOString() })
        .eq('id', pickup.id)
    }

    await writeAudit(
      user.id,
      'equipment.checkout',
      'equipment_item',
      item.id,
      { after: { holder: user.full_name, due_at: dueAt.toISOString() } },
      `${user.full_name} checked out ${itemLabel(item)}, due ${fmtDayTime(dueAt.toISOString())}`
    )
  }

  // Tell affected reservers (one message per person per shoot)
  const seen = new Set<string>()
  for (const w of warnings) {
    const key = `${w.reserved_by}:${w.shoot_name}`
    if (seen.has(key) || w.reserved_by === user.id) continue
    seen.add(key)
    const affected = warnings.filter((x) => x.reserved_by === w.reserved_by && x.shoot_name === w.shoot_name)
    await notifyLockup({
      user_id: w.reserved_by,
      type: 'lockup_reservation_conflict',
      title: 'Reserved gear was taken',
      body: `${user.full_name} checked out ${affected.map((a) => a.item_name).join(', ')} until ${fmtDayTime(dueAt.toISOString())}. You have ${affected.length === 1 ? 'it' : 'them'} reserved for ${w.shoot_name}.`,
      link_url: '/lockup?tab=shoots',
    })
  }

  const names = itemList.map((i) => itemLabel(i)).join(', ')
  await postLockupChannel(
    admin,
    `📤 ${user.full_name} checked out ${names}, due ${fmtDayTime(dueAt.toISOString())}`
  )

  await revalidateHR()
  return { status: 'done', count: itemList.length }
}

// ============================================================
// Check-in
// ============================================================

export async function checkinItem(input: {
  itemId: string
  locationId: string
  issueNote?: string
}): Promise<void> {
  const user = await requireUser()
  const admin = createAdminClient()
  const item = await getItemOrThrow(admin, input.itemId)

  if (item.status !== 'checked_out' || !item.current_checkout_id) {
    throw new ActionError('This item is not checked out.')
  }
  if (item.current_holder_id !== user.id) {
    throw new ActionError('Only the current holder can check this in. Use "take over" first.')
  }

  const { data: location } = await admin
    .from('equipment_locations')
    .select('id, label')
    .eq('id', input.locationId)
    .maybeSingle()
  if (!location) throw new ActionError('Pick where the item was put back.')

  await admin
    .from('equipment_checkouts')
    .update({
      returned_at: new Date().toISOString(),
      returned_location_id: location.id,
    })
    .eq('id', item.current_checkout_id)

  await admin
    .from('equipment_items')
    .update({
      status: 'available',
      current_holder_id: null,
      current_checkout_id: null,
      // Record where it was actually dropped, so the next person looks here.
      current_location_id: location.id,
    })
    .eq('id', item.id)

  await writeAudit(
    user.id,
    'equipment.checkin',
    'equipment_item',
    item.id,
    { after: { returned_to: location.label } },
    `${user.full_name} checked in ${itemLabel(item)} to ${location.label}`
  )

  const issueNote = input.issueNote?.trim()
  if (issueNote) {
    const { data: issue } = await admin
      .from('equipment_issues')
      .insert({
        item_id: item.id,
        reported_by: user.id,
        checkout_id: item.current_checkout_id,
        note: issueNote,
      })
      .select('id')
      .single()
    await writeAudit(
      user.id,
      'equipment.issue_report',
      'equipment_item',
      item.id,
      null,
      `${user.full_name} reported a problem with ${itemLabel(item)}: ${issueNote}`
    )
    await notifyManagers(admin, user.id, {
      type: 'lockup_issue',
      title: 'Gear problem reported',
      body: `${user.full_name} returned ${itemLabel(item)} with a problem: ${issueNote}`,
      link_url: `/e/${item.code}?src=app`,
    })
    void issue
  }

  await postLockupChannel(admin, `📥 ${user.full_name} returned ${itemLabel(item)} to ${location.label}`)
  await revalidateHR()
}

// ============================================================
// Take over (on-set handover)
// ============================================================

export async function takeOverItem(input: { itemId: string; dueAt?: string }): Promise<void> {
  const user = await requireUser()
  const admin = createAdminClient()
  const item = await getItemOrThrow(admin, input.itemId)

  if (item.status !== 'checked_out' || !item.current_checkout_id || !item.current_holder_id) {
    throw new ActionError('This item is not checked out, so there is nothing to take over.')
  }
  if (item.current_holder_id === user.id) {
    throw new ActionError('You already hold this item.')
  }

  const { data: oldCheckout } = await admin
    .from('equipment_checkouts')
    .select('*')
    .eq('id', item.current_checkout_id)
    .single()
  if (!oldCheckout) throw new ActionError('Open checkout not found.')

  // Assigned-device loans have no due date; keep it null through the handoff.
  // Pooled gear carries the old due date unless the taker sets a new one.
  let newDueAt: string | null
  if (item.kind === 'assigned') {
    newDueAt = null
  } else if (input.dueAt) {
    const d = new Date(input.dueAt)
    if (isNaN(d.getTime())) throw new ActionError('Invalid return date.')
    newDueAt = d.toISOString()
  } else {
    newDueAt = oldCheckout.due_at
  }

  const now = new Date().toISOString()
  await admin
    .from('equipment_checkouts')
    .update({ returned_at: now })
    .eq('id', oldCheckout.id)

  const { data: newCheckout, error } = await admin
    .from('equipment_checkouts')
    .insert({
      item_id: item.id,
      holder_id: user.id,
      due_at: newDueAt,
      transferred_from_checkout_id: oldCheckout.id,
      shoot_id: oldCheckout.shoot_id,
    })
    .select('id')
    .single()
  if (error || !newCheckout) throw new ActionError(error?.message ?? 'Transfer failed.')

  await admin
    .from('equipment_items')
    .update({ current_holder_id: user.id, current_checkout_id: newCheckout.id })
    .eq('id', item.id)

  const { data: prevHolder } = await admin
    .from('users')
    .select('id, full_name')
    .eq('id', oldCheckout.holder_id)
    .single()

  await writeAudit(
    user.id,
    'equipment.transfer',
    'equipment_item',
    item.id,
    { before: { holder: prevHolder?.full_name }, after: { holder: user.full_name } },
    `${user.full_name} took over ${itemLabel(item)} from ${prevHolder?.full_name ?? 'previous holder'}`
  )

  await notifyLockup({
    user_id: oldCheckout.holder_id,
    type: 'lockup_transfer',
    title: 'Gear handed over',
    body: `${user.full_name} took over ${itemLabel(item)} from you. It is now their responsibility.`,
    link_url: `/e/${item.code}?src=app`,
  })
  await postLockupChannel(
    admin,
    `🔁 ${user.full_name} took over ${itemLabel(item)} from ${prevHolder?.full_name ?? 'previous holder'}`
  )
  await revalidateHR()
}

// ============================================================
// Assigned devices (laptops, phones, SSDs)
// ============================================================

/** Borrow an assigned device that is resting with its owner. Pure chain of
 *  custody: no due date. Scan-gated in the UI like a pooled checkout. */
export async function borrowDevice(itemId: string): Promise<void> {
  const user = await requireUser()
  const admin = createAdminClient()
  const item = await getItemOrThrow(admin, itemId)

  if (item.kind !== 'assigned') throw new ActionError('This is not an assigned device.')
  if (item.status === 'in_repair') throw new ActionError(`${itemLabel(item)} is in repair.`)
  if (item.status === 'retired' || item.status === 'lost') {
    throw new ActionError(`${itemLabel(item)} is marked ${item.status}.`)
  }
  if (item.status === 'checked_out') {
    throw new ActionError(
      `${itemLabel(item)} is already with someone. Open its page to take it over instead.`
    )
  }
  if (item.current_holder_id === user.id) throw new ActionError('You already hold this device.')
  const assigneeName = await userName(admin, item.assignee_id)

  const { data: checkout, error } = await admin
    .from('equipment_checkouts')
    .insert({ item_id: item.id, holder_id: user.id, due_at: null })
    .select('id')
    .single()
  if (error || !checkout) throw new ActionError(error?.message ?? 'Could not borrow the device.')

  await admin
    .from('equipment_items')
    .update({
      status: 'checked_out',
      current_holder_id: user.id,
      current_checkout_id: checkout.id,
      current_location_id: null,
    })
    .eq('id', item.id)

  await writeAudit(
    user.id,
    'equipment.borrow',
    'equipment_item',
    item.id,
    { after: { holder: user.full_name } },
    `${user.full_name} borrowed ${itemLabel(item)}${assigneeName ? ` from ${assigneeName}` : ''}`
  )

  // Let the owner know their device is on loan.
  if (item.assignee_id && item.assignee_id !== user.id) {
    await notifyLockup({
      user_id: item.assignee_id,
      type: 'lockup_device_borrowed',
      title: 'Your device was borrowed',
      body: `${user.full_name} borrowed ${itemLabel(item)}. They can hand it back to you any time.`,
      link_url: `/e/${item.code}?src=app`,
    })
  }
  await revalidateHR()
}

/** Hand a borrowed device back to its owner (not to a cupboard). */
export async function handBackDevice(itemId: string): Promise<void> {
  const user = await requireUser()
  const admin = createAdminClient()
  const item = await getItemOrThrow(admin, itemId)

  if (item.kind !== 'assigned') throw new ActionError('This is not an assigned device.')
  if (item.status !== 'checked_out' || !item.current_checkout_id) {
    throw new ActionError('This device is not currently on loan.')
  }
  if (item.current_holder_id !== user.id) {
    throw new ActionError('Only the person holding it can hand it back. Use "take over" first.')
  }
  const assigneeName = await userName(admin, item.assignee_id)

  await admin
    .from('equipment_checkouts')
    .update({ returned_at: new Date().toISOString() })
    .eq('id', item.current_checkout_id)

  // Resting state returns to the owner (or unassigned/nobody if there is none).
  await admin
    .from('equipment_items')
    .update({
      status: 'available',
      current_holder_id: item.assignee_id,
      current_checkout_id: null,
    })
    .eq('id', item.id)

  await writeAudit(
    user.id,
    'equipment.handback',
    'equipment_item',
    item.id,
    null,
    `${user.full_name} handed ${itemLabel(item)} back${assigneeName ? ` to ${assigneeName}` : ''}`
  )
  if (item.assignee_id && item.assignee_id !== user.id) {
    await notifyLockup({
      user_id: item.assignee_id,
      type: 'lockup_device_returned',
      title: 'Your device is back',
      body: `${user.full_name} handed ${itemLabel(item)} back to you.`,
      link_url: `/e/${item.code}?src=app`,
    })
  }
  await revalidateHR()
}

/** Set or clear a device's long-term owner (managers only). If the device is
 *  resting, its current holder moves to the new owner too. */
export async function setItemAssignee(input: {
  itemId: string
  assigneeId: string | null
}): Promise<void> {
  const user = await requireCapability('manage_equipment')
  const admin = createAdminClient()
  const item = await getItemOrThrow(admin, input.itemId)
  if (item.kind !== 'assigned') throw new ActionError('Only assigned devices have an owner.')

  let assigneeName: string | null = null
  if (input.assigneeId) {
    const { data: target } = await admin
      .from('users')
      .select('id, full_name, status')
      .eq('id', input.assigneeId)
      .maybeSingle()
    if (!target || target.status !== 'active') throw new ActionError('Pick an active employee.')
    assigneeName = target.full_name
  }

  const updates: Updates<'equipment_items'> = { assignee_id: input.assigneeId }
  // If it is resting (not currently on loan), it now rests with the new owner.
  if (item.status === 'available') updates.current_holder_id = input.assigneeId

  const { error } = await admin.from('equipment_items').update(updates).eq('id', item.id)
  if (error) throw new ActionError(error.message)

  await writeAudit(
    user.id,
    'equipment.assign',
    'equipment_item',
    item.id,
    { after: { assignee: assigneeName } },
    assigneeName
      ? `${user.full_name} assigned ${itemLabel(item)} to ${assigneeName}`
      : `${user.full_name} cleared the owner of ${itemLabel(item)}`
  )
  if (input.assigneeId && input.assigneeId !== user.id) {
    await notifyLockup({
      user_id: input.assigneeId,
      type: 'lockup_device_assigned',
      title: 'A device was assigned to you',
      body: `${itemLabel(item)} is now assigned to you.`,
      link_url: `/e/${item.code}?src=app`,
    })
  }
  await revalidateHR()
}

// ============================================================
// Shoots + reservations
// ============================================================

export async function createShoot(input: {
  name: string
  location?: string
  startsAt: string
  endsAt: string
  notes?: string
}): Promise<string> {
  const user = await requireUser()
  const admin = createAdminClient()

  const name = input.name.trim()
  if (!name) throw new ActionError('Give the shoot a name.')
  const starts = new Date(input.startsAt)
  const ends = new Date(input.endsAt)
  if (isNaN(starts.getTime()) || isNaN(ends.getTime())) throw new ActionError('Invalid dates.')
  if (ends <= starts) throw new ActionError('The shoot must end after it starts.')

  const { data: shoot, error } = await admin
    .from('equipment_shoots')
    .insert({
      name,
      location: input.location?.trim() || null,
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      owner_id: user.id,
      notes: input.notes?.trim() || null,
    })
    .select('id')
    .single()
  if (error || !shoot) throw new ActionError(error?.message ?? 'Could not create the shoot.')

  await writeAudit(
    user.id,
    'equipment.shoot_create',
    'equipment_shoot',
    shoot.id,
    null,
    `${user.full_name} created shoot ${name} (${fmtDayTime(starts.toISOString())} to ${fmtDayTime(ends.toISOString())})`
  )
  await revalidateHR()
  return shoot.id
}

export type ShootPlanInput = {
  name: string
  location?: string
  notes?: string
  startsAt: string
  endsAt: string
  /** Extra people who may plan this shoot (owner is implicit). */
  editorIds?: string[]
  studio?: { studioId: string; startsAt: string; endsAt: string }
  itemIds?: string[]
}

export type ShootPlanResult = {
  shootId: string
  reserved: number
  pendingApproval: number
}

/** One-submit wizard action: shoot + optional editors + optional studio block +
 *  optional reservations. Validates the studio slot and the gear list BEFORE
 *  creating anything, and rolls the shoot back if a later step fails, so a
 *  half-created plan never survives. */
export async function createShootPlan(input: ShootPlanInput): Promise<ShootPlanResult> {
  const user = await requireUser()
  const admin = createAdminClient()

  const name = input.name.trim()
  if (!name) throw new ActionError('Give the shoot a name.')
  const starts = new Date(input.startsAt)
  const ends = new Date(input.endsAt)
  if (isNaN(starts.getTime()) || isNaN(ends.getTime())) throw new ActionError('Invalid dates.')
  if (ends <= starts) throw new ActionError('The shoot must end after it starts.')

  // ---- validate the studio slot up front (friendly named-clash error) ----
  let studio: Tables<'equipment_studios'> | null = null
  let blockStarts: Date | null = null
  let blockEnds: Date | null = null
  if (input.studio) {
    blockStarts = new Date(input.studio.startsAt)
    blockEnds = new Date(input.studio.endsAt)
    if (isNaN(blockStarts.getTime()) || isNaN(blockEnds.getTime())) {
      throw new ActionError('Invalid studio times.')
    }
    if (blockEnds <= blockStarts) throw new ActionError('The studio booking must end after it starts.')
    if (blockEnds <= new Date()) throw new ActionError('That studio time is already in the past.')

    const { data: studioRow } = await admin
      .from('equipment_studios')
      .select('*')
      .eq('id', input.studio.studioId)
      .maybeSingle()
    if (!studioRow) throw new ActionError('Pick a studio.')
    studio = studioRow

    const { data: clashes } = await admin
      .from('equipment_studio_blocks')
      .select('*')
      .eq('studio_id', studio.id)
      .lt('starts_at', blockEnds.toISOString())
      .gt('ends_at', blockStarts.toISOString())
      .limit(1)
    if (clashes && clashes.length > 0) {
      const clash = clashes[0]
      const { data: holder } = await admin
        .from('equipment_shoots')
        .select('name')
        .eq('id', clash.shoot_id)
        .maybeSingle()
      throw new ActionError(
        `${studio.name} is already booked by ${holder?.name ?? 'another shoot'} from ${fmtDayTime(clash.starts_at)} to ${fmtDayTime(clash.ends_at)}. Pick a different time or studio.`
      )
    }
  }

  // ---- validate the gear list up front ----
  const itemIds = Array.from(new Set(input.itemIds ?? []))
  if (itemIds.length > 0) {
    const { data: items } = await admin
      .from('equipment_items')
      .select('id, kind, status')
      .in('id', itemIds)
    const reservable = (items ?? []).filter(
      (i) => i.kind !== 'assigned' && i.status !== 'retired' && i.status !== 'lost'
    )
    if (reservable.length === 0) {
      throw new ActionError('None of the selected items can be reserved.')
    }
  }

  // ---- validate editors up front ----
  const editorIds = Array.from(new Set(input.editorIds ?? [])).filter((id) => id !== user.id)
  let editors: { id: string; full_name: string }[] = []
  if (editorIds.length > 0) {
    const { data: editorRows } = await admin
      .from('users')
      .select('id, full_name, status')
      .in('id', editorIds)
    editors = (editorRows ?? []).filter((e) => e.status === 'active')
  }

  // ---- create the shoot ----
  const { data: shoot, error } = await admin
    .from('equipment_shoots')
    .insert({
      name,
      location: input.location?.trim() || (studio ? studio.name : null),
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      owner_id: user.id,
      notes: input.notes?.trim() || null,
    })
    .select('*')
    .single()
  if (error || !shoot) throw new ActionError(error?.message ?? 'Could not create the shoot.')

  // Everything after this point rolls the shoot back on failure (FK cascade
  // removes editors, blocks, and reservations with it).
  try {
    if (editors.length > 0) {
      const { error: editorError } = await admin.from('equipment_shoot_editors').insert(
        editors.map((e) => ({ shoot_id: shoot.id, user_id: e.id, added_by: user.id }))
      )
      if (editorError) throw new ActionError(editorError.message)
    }

    if (studio && blockStarts && blockEnds) {
      const { error: blockError } = await admin.from('equipment_studio_blocks').insert({
        studio_id: studio.id,
        shoot_id: shoot.id,
        starts_at: blockStarts.toISOString(),
        ends_at: blockEnds.toISOString(),
        created_by: user.id,
      })
      if (blockError) {
        // 23P01 = exclusion constraint (someone booked the same slot this instant)
        throw new ActionError(
          blockError.code === '23P01'
            ? `${studio.name} was just booked by someone else for an overlapping time. Pick a different slot.`
            : blockError.message
        )
      }
    }

    let reserved = 0
    let pendingCount = 0
    if (itemIds.length > 0) {
      const result = await insertReservationsForShoot(admin, user, shoot, itemIds)
      reserved = result.reserved
      pendingCount = result.pending.length
    }

    const parts = [
      `${user.full_name} planned shoot ${name} (${fmtDayTime(starts.toISOString())} to ${fmtDayTime(ends.toISOString())})`,
    ]
    if (studio && blockStarts && blockEnds) {
      parts.push(
        `booked ${studio.name} ${fmtDayTime(blockStarts.toISOString())} to ${fmtDayTime(blockEnds.toISOString())}`
      )
    }
    if (reserved > 0) {
      parts.push(
        `reserved ${reserved} item(s)` +
          (pendingCount > 0 ? ` (${pendingCount} awaiting approval)` : '')
      )
    }
    if (editors.length > 0) {
      parts.push(`with ${editors.map((e) => e.full_name).join(', ')} as editor(s)`)
    }
    await writeAudit(user.id, 'equipment.shoot_plan', 'equipment_shoot', shoot.id, null, parts.join('; '))

    if (studio && blockStarts && blockEnds) {
      await postLockupChannel(
        admin,
        `🎬 ${studio.name} booked for ${name}: ${fmtDayTime(blockStarts.toISOString())} to ${fmtDayTime(blockEnds.toISOString())}`
      )
    }
    await Promise.all(
      editors.map((e) =>
        notifyLockup({
          user_id: e.id,
          type: 'lockup_shoot_editor',
          title: 'You can plan a shoot',
          body: `${user.full_name} added you as an editor of ${name}. You can reserve gear and change its details.`,
          link_url: `/lockup/shoots/${shoot.id}`,
        })
      )
    )

    await revalidateHR()
    return { shootId: shoot.id, reserved, pendingApproval: pendingCount }
  } catch (err) {
    await admin.from('equipment_shoots').delete().eq('id', shoot.id)
    throw err
  }
}

/** Shoot write access: owner, an added editor, HR/Founder, or manage_equipment. */
async function requireShootAccess(
  admin: Admin,
  shootId: string,
  user: Tables<'users'>
): Promise<Tables<'equipment_shoots'>> {
  const { data: shoot } = await admin
    .from('equipment_shoots')
    .select('*')
    .eq('id', shootId)
    .maybeSingle()
  if (!shoot) throw new ActionError('Shoot not found.')
  if (shoot.owner_id === user.id) return shoot
  if (user.role === 'hr' || user.role === 'founder') return shoot
  const [{ data: editors }, { data: grants }] = await Promise.all([
    admin
      .from('equipment_shoot_editors')
      .select('id')
      .eq('shoot_id', shootId)
      .eq('user_id', user.id)
      .limit(1),
    admin
      .from('user_capabilities')
      .select('id')
      .eq('user_id', user.id)
      .eq('capability_key', 'manage_equipment')
      .limit(1),
  ])
  if (editors && editors.length > 0) return shoot
  if (grants && grants.length > 0) return shoot
  throw new ActionError(
    'Only the shoot owner, its editors, or an equipment manager can change this shoot.'
  )
}

export async function addShootEditor(input: { shootId: string; userId: string }): Promise<void> {
  const user = await requireUser()
  const admin = createAdminClient()
  const shoot = await requireShootAccess(admin, input.shootId, user)

  const { data: target } = await admin
    .from('users')
    .select('id, full_name, status')
    .eq('id', input.userId)
    .maybeSingle()
  if (!target || target.status !== 'active') throw new ActionError('Pick an active employee.')
  if (target.id === shoot.owner_id) throw new ActionError('The owner can already edit the shoot.')

  const { error } = await admin.from('equipment_shoot_editors').insert({
    shoot_id: shoot.id,
    user_id: target.id,
    added_by: user.id,
  })
  if (error) {
    if (error.message.includes('duplicate') || error.code === '23505') {
      throw new ActionError(`${target.full_name} can already edit this shoot.`)
    }
    throw new ActionError(error.message)
  }

  await writeAudit(
    user.id,
    'equipment.shoot_editor_add',
    'equipment_shoot',
    shoot.id,
    null,
    `${user.full_name} let ${target.full_name} edit shoot ${shoot.name}`
  )
  await notifyLockup({
    user_id: target.id,
    type: 'lockup_shoot_editor',
    title: 'You can now plan a shoot',
    body: `${user.full_name} added you as an editor of ${shoot.name}. You can reserve and remove gear for it.`,
    link_url: `/lockup/shoots/${shoot.id}`,
  })
  await revalidateHR()
}

export async function removeShootEditor(editorRowId: string): Promise<void> {
  const user = await requireUser()
  const admin = createAdminClient()
  const { data: row } = await admin
    .from('equipment_shoot_editors')
    .select('*')
    .eq('id', editorRowId)
    .maybeSingle()
  if (!row) throw new ActionError('Editor entry not found.')
  const shoot = await requireShootAccess(admin, row.shoot_id, user)

  const { error } = await admin.from('equipment_shoot_editors').delete().eq('id', row.id)
  if (error) throw new ActionError(error.message)

  await writeAudit(
    user.id,
    'equipment.shoot_editor_remove',
    'equipment_shoot',
    shoot.id,
    null,
    `${user.full_name} removed an editor from shoot ${shoot.name}`
  )
  await revalidateHR()
}

export async function updateShoot(input: {
  shootId: string
  name?: string
  location?: string
  startsAt?: string
  endsAt?: string
  notes?: string
  status?: 'planned' | 'done'
}): Promise<void> {
  const user = await requireUser()
  const admin = createAdminClient()
  const shoot = await requireShootAccess(admin, input.shootId, user)

  const updates: Updates<'equipment_shoots'> = {}
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (!name) throw new ActionError('The shoot needs a name.')
    updates.name = name
  }
  if (input.location !== undefined) updates.location = input.location.trim() || null
  if (input.notes !== undefined) updates.notes = input.notes.trim() || null
  if (input.startsAt) updates.starts_at = new Date(input.startsAt).toISOString()
  if (input.endsAt) updates.ends_at = new Date(input.endsAt).toISOString()
  if (input.status) updates.status = input.status

  const starts = new Date((updates.starts_at as string) ?? shoot.starts_at)
  const ends = new Date((updates.ends_at as string) ?? shoot.ends_at)
  if (ends <= starts) throw new ActionError('The shoot must end after it starts.')

  const { error } = await admin
    .from('equipment_shoots')
    .update(updates)
    .eq('id', shoot.id)
  if (error) throw new ActionError(error.message)

  await writeAudit(
    user.id,
    'equipment.shoot_update',
    'equipment_shoot',
    shoot.id,
    null,
    `${user.full_name} updated shoot ${shoot.name}`
  )
  await revalidateHR()
}

export async function cancelShoot(shootId: string): Promise<void> {
  const user = await requireUser()
  const admin = createAdminClient()
  const shoot = await requireShootAccess(admin, shootId, user)

  const { data: activeReservations } = await admin
    .from('equipment_reservations')
    .select('*')
    .eq('shoot_id', shoot.id)
    .eq('status', 'active')

  await admin.from('equipment_shoots').update({ status: 'cancelled' }).eq('id', shoot.id)
  await admin
    .from('equipment_reservations')
    .update({ status: 'cancelled', resolved_at: new Date().toISOString() })
    .eq('shoot_id', shoot.id)
    .eq('status', 'active')
  // Free the studio: a cancelled shoot must not keep it blocked.
  await admin.from('equipment_studio_blocks').delete().eq('shoot_id', shoot.id)

  await writeAudit(
    user.id,
    'equipment.shoot_cancel',
    'equipment_shoot',
    shoot.id,
    null,
    `${user.full_name} cancelled shoot ${shoot.name}`
  )

  const reserverIds = Array.from(
    new Set((activeReservations ?? []).map((r) => r.reserved_by))
  ).filter((id) => id !== user.id)
  await Promise.all(
    reserverIds.map((id) =>
      notifyLockup({
        user_id: id,
        type: 'lockup_shoot_cancelled',
        title: 'Shoot cancelled',
        body: `${user.full_name} cancelled ${shoot.name}. Your gear reservations for it were released.`,
        link_url: '/lockup?tab=shoots',
      })
    )
  )
  await revalidateHR()
}

/** Permanently remove a shoot (owner or equipment manager). Reservations,
 *  studio bookings and the editor list go with it (FK cascade); checkout
 *  history is kept but unlinked from the shoot. For "this shoot is not
 *  happening", cancel instead — it keeps the record. */
export async function deleteShoot(shootId: string): Promise<void> {
  const user = await requireUser()
  const admin = createAdminClient()
  const shoot = await requireShootAccess(admin, shootId, user)
  if (shoot.owner_id !== user.id) {
    // Editors can plan, but destroying the whole shoot needs the owner or a manager
    if (user.role !== 'hr' && user.role !== 'founder') {
      const { data: grants } = await admin
        .from('user_capabilities')
        .select('id')
        .eq('user_id', user.id)
        .eq('capability_key', 'manage_equipment')
        .limit(1)
      if (!grants || grants.length === 0) {
        throw new ActionError('Only the shoot owner or an equipment manager can delete a shoot.')
      }
    }
  }

  // Keep checkout history but detach it from the shoot being removed
  await admin
    .from('equipment_checkouts')
    .update({ shoot_id: null })
    .eq('shoot_id', shoot.id)

  const { error } = await admin.from('equipment_shoots').delete().eq('id', shoot.id)
  if (error) throw new ActionError(error.message)

  await writeAudit(
    user.id,
    'equipment.shoot_delete',
    'equipment_shoot',
    shoot.id,
    null,
    `${user.full_name} deleted shoot ${shoot.name}`
  )
  await revalidateHR()
}

/** Insert reservations for a shoot. Approval-flagged items land as 'pending'
 *  (managers reserving for themselves skip the queue) and the equipment
 *  managers get asked to approve; everything else is 'active'. Shared by
 *  reserveItems (detail page) and createShootPlan (wizard). */
async function insertReservationsForShoot(
  admin: Admin,
  user: Tables<'users'>,
  shoot: Tables<'equipment_shoots'>,
  itemIds: string[]
): Promise<{ reserved: number; pending: Tables<'equipment_items'>[] }> {
  const { data: items } = await admin.from('equipment_items').select('*').in('id', itemIds)
  const itemList = (items ?? []).filter(
    (i) => i.kind !== 'assigned' && i.status !== 'retired' && i.status !== 'lost'
  )
  if (itemList.length === 0) throw new ActionError('None of the selected items can be reserved.')

  const { data: existing } = await admin
    .from('equipment_reservations')
    .select('item_id')
    .eq('shoot_id', shoot.id)
    .in('status', ['active', 'pending'] as unknown as ('active' | 'pending')[])
  const alreadyReserved = new Set((existing ?? []).map((r) => r.item_id))

  const fresh = itemList.filter((i) => !alreadyReserved.has(i.id))
  if (fresh.length === 0) return { reserved: 0, pending: [] }

  const actorIsManager = await isEquipmentManager(admin, user)
  const toInsert = fresh.map((i) => ({
    item_id: i.id,
    shoot_id: shoot.id,
    reserved_by: user.id,
    status: (i.requires_approval && !actorIsManager ? 'pending' : 'active') as
      | 'pending'
      | 'active',
  }))
  const { error } = await admin.from('equipment_reservations').insert(toInsert)
  if (error) throw new ActionError(error.message)

  const pending = actorIsManager ? [] : fresh.filter((i) => i.requires_approval)
  if (pending.length > 0) {
    await notifyManagers(admin, user.id, {
      type: 'lockup_approval_request',
      title: 'Gear approval needed',
      body: `${user.full_name} wants ${pending.map((i) => itemLabel(i)).join(', ')} for ${shoot.name} (${fmtDayTime(shoot.starts_at)} to ${fmtDayTime(shoot.ends_at)}).`,
      link_url: '/tech?tab=approvals',
    })
  }
  return { reserved: fresh.length, pending }
}

export async function reserveItems(input: {
  shootId: string
  itemIds: string[]
}): Promise<void> {
  const user = await requireUser()
  const admin = createAdminClient()

  if (input.itemIds.length === 0) throw new ActionError('No items selected.')
  // Shoots are readable org-wide, but only the owner, its editors, or an
  // equipment manager may change what is reserved for one.
  const shoot = await requireShootAccess(admin, input.shootId, user)
  if (shoot.status === 'cancelled' || shoot.status === 'done') {
    throw new ActionError('This shoot is closed; reservations are not possible.')
  }
  if (new Date(shoot.ends_at) < new Date()) {
    throw new ActionError('This shoot has already ended.')
  }

  const { reserved, pending } = await insertReservationsForShoot(
    admin,
    user,
    shoot,
    input.itemIds
  )
  if (reserved === 0) return

  await writeAudit(
    user.id,
    'equipment.reserve',
    'equipment_shoot',
    shoot.id,
    null,
    `${user.full_name} reserved ${reserved} item(s) for ${shoot.name}` +
      (pending.length > 0 ? ` (${pending.length} awaiting approval)` : '')
  )
  await revalidateHR()
}

export async function cancelReservation(reservationId: string): Promise<void> {
  const user = await requireUser()
  const admin = createAdminClient()
  const { data: reservation } = await admin
    .from('equipment_reservations')
    .select('*')
    .eq('id', reservationId)
    .maybeSingle()
  if (!reservation) throw new ActionError('Reservation not found.')
  if (reservation.status !== 'active' && reservation.status !== 'pending') {
    throw new ActionError('This reservation is not active.')
  }

  // Reserver, shoot owner, or equipment manager
  if (reservation.reserved_by !== user.id) {
    await requireShootAccess(admin, reservation.shoot_id, user)
  }

  await admin
    .from('equipment_reservations')
    .update({ status: 'cancelled', resolved_at: new Date().toISOString() })
    .eq('id', reservation.id)

  const item = await getItemOrThrow(admin, reservation.item_id)
  await writeAudit(
    user.id,
    'equipment.reservation_cancel',
    'equipment_item',
    item.id,
    null,
    `${user.full_name} removed the reservation of ${itemLabel(item)}`
  )
  await revalidateHR()
}

// ============================================================
// Reservation approvals (flagged items only)
// ============================================================

async function getPendingReservationOrThrow(
  admin: Admin,
  reservationId: string
): Promise<{
  reservation: Tables<'equipment_reservations'>
  item: Tables<'equipment_items'>
  shoot: Tables<'equipment_shoots'>
}> {
  const { data: reservation } = await admin
    .from('equipment_reservations')
    .select('*')
    .eq('id', reservationId)
    .maybeSingle()
  if (!reservation) throw new ActionError('Reservation not found.')
  if (reservation.status !== 'pending') {
    throw new ActionError('This reservation is not awaiting approval.')
  }
  const item = await getItemOrThrow(admin, reservation.item_id)
  const { data: shoot } = await admin
    .from('equipment_shoots')
    .select('*')
    .eq('id', reservation.shoot_id)
    .maybeSingle()
  if (!shoot) throw new ActionError('Shoot not found.')
  return { reservation, item, shoot }
}

export async function approveReservation(reservationId: string): Promise<void> {
  const user = await requireCapability('manage_equipment')
  const admin = createAdminClient()
  const { reservation, item, shoot } = await getPendingReservationOrThrow(admin, reservationId)

  const { error } = await admin
    .from('equipment_reservations')
    .update({ status: 'active' })
    .eq('id', reservation.id)
    .eq('status', 'pending') // guard against a concurrent decision
  if (error) throw new ActionError(error.message)

  await writeAudit(
    user.id,
    'equipment.reservation_approve',
    'equipment_item',
    item.id,
    null,
    `${user.full_name} approved ${itemLabel(item)} for ${shoot.name}`
  )
  await notifyLockup({
    user_id: reservation.reserved_by,
    type: 'lockup_approval_decision',
    title: 'Gear approved',
    body: `${user.full_name} approved ${itemLabel(item)} for ${shoot.name}. It is reserved for you.`,
    link_url: `/lockup/shoots/${shoot.id}`,
  })
  await revalidateHR()
}

export async function rejectReservation(input: {
  reservationId: string
  reason?: string
}): Promise<void> {
  const user = await requireCapability('manage_equipment')
  const admin = createAdminClient()
  const { reservation, item, shoot } = await getPendingReservationOrThrow(
    admin,
    input.reservationId
  )

  const { error } = await admin
    .from('equipment_reservations')
    .update({ status: 'rejected', resolved_at: new Date().toISOString() })
    .eq('id', reservation.id)
    .eq('status', 'pending')
  if (error) throw new ActionError(error.message)

  const reason = input.reason?.trim()
  await writeAudit(
    user.id,
    'equipment.reservation_reject',
    'equipment_item',
    item.id,
    null,
    `${user.full_name} declined ${itemLabel(item)} for ${shoot.name}` +
      (reason ? ` (${reason})` : '')
  )
  await notifyLockup({
    user_id: reservation.reserved_by,
    type: 'lockup_approval_decision',
    title: 'Gear request declined',
    body:
      `${user.full_name} declined ${itemLabel(item)} for ${shoot.name}.` +
      (reason ? ` Reason: ${reason}` : ''),
    link_url: `/lockup/shoots/${shoot.id}`,
  })
  await revalidateHR()
}

// ============================================================
// Kits (selection shortcuts; Tech Console defines them)
// ============================================================

async function validKitItemIds(admin: Admin, itemIds: string[]): Promise<string[]> {
  const unique = Array.from(new Set(itemIds))
  if (unique.length === 0) return []
  const { data: items } = await admin
    .from('equipment_items')
    .select('id, kind, status')
    .in('id', unique)
  return (items ?? [])
    .filter((i) => i.kind === 'pooled' && i.status !== 'retired' && i.status !== 'lost')
    .map((i) => i.id)
}

export async function createKit(input: {
  name: string
  notes?: string
  itemIds: string[]
}): Promise<string> {
  const user = await requireCapability('manage_equipment')
  const admin = createAdminClient()

  const name = input.name.trim()
  if (!name) throw new ActionError('The kit needs a name.')
  const memberIds = await validKitItemIds(admin, input.itemIds)
  if (memberIds.length === 0) {
    throw new ActionError('Pick at least one pooled item for the kit.')
  }

  const { data: kit, error } = await admin
    .from('equipment_kits')
    .insert({ name, notes: input.notes?.trim() || null, created_by: user.id })
    .select('id')
    .single()
  if (error || !kit) {
    if (error?.code === '23505') throw new ActionError(`A kit named ${name} already exists.`)
    throw new ActionError(error?.message ?? 'Could not create the kit.')
  }

  const { error: memberError } = await admin
    .from('equipment_kit_items')
    .insert(memberIds.map((id) => ({ kit_id: kit.id, item_id: id })))
  if (memberError) throw new ActionError(memberError.message)

  await writeAudit(
    user.id,
    'equipment.kit_create',
    'equipment_kit',
    kit.id,
    null,
    `${user.full_name} created kit ${name} with ${memberIds.length} item(s)`
  )
  await revalidateHR()
  return kit.id
}

export async function updateKit(input: {
  kitId: string
  name?: string
  notes?: string
  /** Full replacement of the member list when provided. */
  itemIds?: string[]
}): Promise<void> {
  const user = await requireCapability('manage_equipment')
  const admin = createAdminClient()

  const { data: kit } = await admin
    .from('equipment_kits')
    .select('*')
    .eq('id', input.kitId)
    .maybeSingle()
  if (!kit) throw new ActionError('Kit not found.')

  const updates: Updates<'equipment_kits'> = {}
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (!name) throw new ActionError('The kit needs a name.')
    updates.name = name
  }
  if (input.notes !== undefined) updates.notes = input.notes.trim() || null
  if (Object.keys(updates).length > 0) {
    const { error } = await admin.from('equipment_kits').update(updates).eq('id', kit.id)
    if (error) {
      if (error.code === '23505') throw new ActionError('Another kit already has that name.')
      throw new ActionError(error.message)
    }
  }

  if (input.itemIds !== undefined) {
    const memberIds = await validKitItemIds(admin, input.itemIds)
    if (memberIds.length === 0) {
      throw new ActionError('Pick at least one pooled item for the kit.')
    }
    await admin.from('equipment_kit_items').delete().eq('kit_id', kit.id)
    const { error } = await admin
      .from('equipment_kit_items')
      .insert(memberIds.map((id) => ({ kit_id: kit.id, item_id: id })))
    if (error) throw new ActionError(error.message)
  }

  await writeAudit(
    user.id,
    'equipment.kit_update',
    'equipment_kit',
    kit.id,
    null,
    `${user.full_name} edited kit ${updates.name ?? kit.name}`
  )
  await revalidateHR()
}

export async function deleteKit(kitId: string): Promise<void> {
  const user = await requireCapability('manage_equipment')
  const admin = createAdminClient()
  const { data: kit } = await admin
    .from('equipment_kits')
    .select('*')
    .eq('id', kitId)
    .maybeSingle()
  if (!kit) throw new ActionError('Kit not found.')

  const { error } = await admin.from('equipment_kits').delete().eq('id', kit.id)
  if (error) throw new ActionError(error.message)

  await writeAudit(
    user.id,
    'equipment.kit_delete',
    'equipment_kit',
    kit.id,
    null,
    `${user.full_name} deleted kit ${kit.name}`
  )
  await revalidateHR()
}

// ============================================================
// Studio blocking (hard block: overlaps are refused)
// ============================================================

export async function addStudioBlock(input: {
  shootId: string
  studioId: string
  startsAt: string
  endsAt: string
}): Promise<void> {
  const user = await requireUser()
  const admin = createAdminClient()
  const shoot = await requireShootAccess(admin, input.shootId, user)
  if (shoot.status === 'cancelled' || shoot.status === 'done') {
    throw new ActionError('This shoot is closed.')
  }

  const starts = new Date(input.startsAt)
  const ends = new Date(input.endsAt)
  if (isNaN(starts.getTime()) || isNaN(ends.getTime())) throw new ActionError('Invalid times.')
  if (ends <= starts) throw new ActionError('The booking must end after it starts.')
  if (ends <= new Date()) throw new ActionError('That time is already in the past.')

  const { data: studio } = await admin
    .from('equipment_studios')
    .select('*')
    .eq('id', input.studioId)
    .maybeSingle()
  if (!studio) throw new ActionError('Pick a studio.')

  // Friendly pre-check naming the clash; the DB exclusion constraint is the
  // race-safe backstop.
  const { data: clashes } = await admin
    .from('equipment_studio_blocks')
    .select('*')
    .eq('studio_id', studio.id)
    .lt('starts_at', ends.toISOString())
    .gt('ends_at', starts.toISOString())
    .limit(1)
  if (clashes && clashes.length > 0) {
    const clash = clashes[0]
    const { data: holder } = await admin
      .from('equipment_shoots')
      .select('name')
      .eq('id', clash.shoot_id)
      .maybeSingle()
    throw new ActionError(
      `${studio.name} is already booked by ${holder?.name ?? 'another shoot'} from ${fmtDayTime(clash.starts_at)} to ${fmtDayTime(clash.ends_at)}. Pick a different time or studio.`
    )
  }

  const { error } = await admin.from('equipment_studio_blocks').insert({
    studio_id: studio.id,
    shoot_id: shoot.id,
    starts_at: starts.toISOString(),
    ends_at: ends.toISOString(),
    created_by: user.id,
  })
  if (error) {
    // 23P01 = exclusion constraint (someone booked the same slot this instant)
    if (error.code === '23P01') {
      throw new ActionError(
        `${studio.name} was just booked by someone else for an overlapping time. Pick a different slot.`
      )
    }
    throw new ActionError(error.message)
  }

  await writeAudit(
    user.id,
    'equipment.studio_block',
    'equipment_shoot',
    shoot.id,
    null,
    `${user.full_name} booked ${studio.name} for ${shoot.name}, ${fmtDayTime(starts.toISOString())} to ${fmtDayTime(ends.toISOString())}`
  )
  await postLockupChannel(
    admin,
    `🎬 ${studio.name} booked for ${shoot.name}: ${fmtDayTime(starts.toISOString())} to ${fmtDayTime(ends.toISOString())}`
  )
  await revalidateHR()
}

export async function removeStudioBlock(blockId: string): Promise<void> {
  const user = await requireUser()
  const admin = createAdminClient()
  const { data: block } = await admin
    .from('equipment_studio_blocks')
    .select('*')
    .eq('id', blockId)
    .maybeSingle()
  if (!block) throw new ActionError('Booking not found.')
  const shoot = await requireShootAccess(admin, block.shoot_id, user)

  const { error } = await admin.from('equipment_studio_blocks').delete().eq('id', block.id)
  if (error) throw new ActionError(error.message)

  await writeAudit(
    user.id,
    'equipment.studio_unblock',
    'equipment_shoot',
    shoot.id,
    null,
    `${user.full_name} released a studio booking of ${shoot.name}`
  )
  await revalidateHR()
}

export async function createStudio(name: string): Promise<void> {
  const user = await requireCapability('manage_equipment')
  const admin = createAdminClient()
  const trimmed = name.trim()
  if (!trimmed) throw new ActionError('The studio needs a name.')
  const { error } = await admin.from('equipment_studios').insert({ name: trimmed })
  if (error) throw new ActionError(error.message)
  await writeAudit(user.id, 'equipment.studio_create', 'equipment_studio', trimmed, null,
    `${user.full_name} added studio ${trimmed}`)
  await revalidateHR()
}

export async function renameStudio(input: { studioId: string; name: string }): Promise<void> {
  const user = await requireCapability('manage_equipment')
  const admin = createAdminClient()
  const trimmed = input.name.trim()
  if (!trimmed) throw new ActionError('The studio needs a name.')
  const { error } = await admin
    .from('equipment_studios')
    .update({ name: trimmed })
    .eq('id', input.studioId)
  if (error) throw new ActionError(error.message)
  await writeAudit(user.id, 'equipment.studio_rename', 'equipment_studio', input.studioId, null,
    `${user.full_name} renamed a studio to ${trimmed}`)
  await revalidateHR()
}

export async function deleteStudio(studioId: string): Promise<void> {
  const user = await requireCapability('manage_equipment')
  const admin = createAdminClient()
  const { count } = await admin
    .from('equipment_studio_blocks')
    .select('id', { count: 'exact', head: true })
    .eq('studio_id', studioId)
  if ((count ?? 0) > 0) {
    throw new ActionError('This studio has bookings (past or upcoming). Remove them first.')
  }
  const { error } = await admin.from('equipment_studios').delete().eq('id', studioId)
  if (error) throw new ActionError(error.message)
  await writeAudit(user.id, 'equipment.studio_delete', 'equipment_studio', studioId, null,
    `${user.full_name} deleted a studio`)
  await revalidateHR()
}

// ============================================================
// Issues
// ============================================================

export async function reportIssue(input: { itemId: string; note: string }): Promise<void> {
  const user = await requireUser()
  const admin = createAdminClient()
  const item = await getItemOrThrow(admin, input.itemId)
  const note = input.note.trim()
  if (!note) throw new ActionError('Describe the problem.')

  const { error } = await admin.from('equipment_issues').insert({
    item_id: item.id,
    reported_by: user.id,
    note,
  })
  if (error) throw new ActionError(error.message)

  await writeAudit(
    user.id,
    'equipment.issue_report',
    'equipment_item',
    item.id,
    null,
    `${user.full_name} reported a problem with ${itemLabel(item)}: ${note}`
  )
  await notifyManagers(admin, user.id, {
    type: 'lockup_issue',
    title: 'Gear problem reported',
    body: `${user.full_name} reported a problem with ${itemLabel(item)}: ${note}`,
    link_url: `/e/${item.code}?src=app`,
  })
  await revalidateHR()
}

export async function resolveIssue(issueId: string): Promise<void> {
  const user = await requireCapability('manage_equipment')
  const admin = createAdminClient()
  const { data: issue } = await admin
    .from('equipment_issues')
    .select('*')
    .eq('id', issueId)
    .maybeSingle()
  if (!issue) throw new ActionError('Issue not found.')

  await admin
    .from('equipment_issues')
    .update({ status: 'resolved', resolved_by: user.id, resolved_at: new Date().toISOString() })
    .eq('id', issue.id)

  const item = await getItemOrThrow(admin, issue.item_id)
  await writeAudit(
    user.id,
    'equipment.issue_resolve',
    'equipment_item',
    item.id,
    null,
    `${user.full_name} resolved a reported problem on ${itemLabel(item)}`
  )
  await revalidateHR()
}

// ============================================================
// Repairs
// ============================================================

export async function sendToRepair(input: {
  itemId: string
  expectedBackOn?: string
  vendor?: string
  notes?: string
}): Promise<void> {
  const user = await requireCapability('manage_equipment')
  const admin = createAdminClient()
  const item = await getItemOrThrow(admin, input.itemId)

  if (item.status === 'checked_out') {
    throw new ActionError('Check the item in first (or force check-in), then send it to repair.')
  }
  if (item.status === 'in_repair') throw new ActionError('This item is already in repair.')
  if (item.status === 'retired' || item.status === 'lost') {
    throw new ActionError(`This item is marked ${item.status}.`)
  }

  const { error } = await admin.from('equipment_repairs').insert({
    item_id: item.id,
    sent_by: user.id,
    expected_back_on: input.expectedBackOn || null,
    vendor: input.vendor?.trim() || null,
    notes: input.notes?.trim() || null,
  })
  if (error) throw new ActionError(error.message)

  await admin.from('equipment_items').update({ status: 'in_repair' }).eq('id', item.id)

  const backText = input.expectedBackOn
    ? `expected back ${fmtDay(input.expectedBackOn)}`
    : 'no expected return date yet'
  await writeAudit(
    user.id,
    'equipment.repair_send',
    'equipment_item',
    item.id,
    null,
    `${user.full_name} sent ${itemLabel(item)} for repair (${backText})`
  )

  // Warn owners + reservers of upcoming shoots that reserve this item
  const { data: reservations } = await admin
    .from('equipment_reservations')
    .select('*')
    .eq('item_id', item.id)
    .eq('status', 'active')
  const shootIds = Array.from(new Set((reservations ?? []).map((r) => r.shoot_id)))
  if (shootIds.length > 0) {
    const { data: shoots } = await admin
      .from('equipment_shoots')
      .select('*')
      .in('id', shootIds)
      .in('status', ['planned', 'active'] as unknown as ('planned' | 'active')[])
    for (const shoot of shoots ?? []) {
      if (new Date(shoot.ends_at) < new Date()) continue
      const affectsShoot =
        !input.expectedBackOn || new Date(input.expectedBackOn) >= new Date(shoot.starts_at)
      if (!affectsShoot) continue
      const recipientIds = Array.from(
        new Set([
          shoot.owner_id,
          ...(reservations ?? [])
            .filter((r) => r.shoot_id === shoot.id)
            .map((r) => r.reserved_by),
        ])
      ).filter((id) => id !== user.id)
      await Promise.all(
        recipientIds.map((id) =>
          notifyLockup({
            user_id: id,
            type: 'lockup_repair_conflict',
            title: 'Reserved gear went to repair',
            body: `${itemLabel(item)} is reserved for ${shoot.name} (starts ${fmtDay(shoot.starts_at)}) but was just sent for repair, ${backText}.`,
            link_url: `/lockup/shoots/${shoot.id}`,
          })
        )
      )
    }
  }

  await postLockupChannel(admin, `🔧 ${itemLabel(item)} sent for repair, ${backText}`)
  await revalidateHR()
}

export async function receiveFromRepair(repairId: string): Promise<void> {
  const user = await requireCapability('manage_equipment')
  const admin = createAdminClient()
  const { data: repair } = await admin
    .from('equipment_repairs')
    .select('*')
    .eq('id', repairId)
    .maybeSingle()
  if (!repair) throw new ActionError('Repair record not found.')
  if (repair.returned_at) throw new ActionError('This repair is already closed.')

  const repairItem = await getItemOrThrow(admin, repair.item_id)
  await admin
    .from('equipment_repairs')
    .update({ returned_at: new Date().toISOString() })
    .eq('id', repair.id)
  await admin
    .from('equipment_items')
    .update({ status: 'available', current_location_id: repairItem.home_location_id })
    .eq('id', repair.item_id)
    .eq('status', 'in_repair')

  const item = await getItemOrThrow(admin, repair.item_id)
  await writeAudit(
    user.id,
    'equipment.repair_receive',
    'equipment_item',
    item.id,
    null,
    `${user.full_name} received ${itemLabel(item)} back from repair`
  )

  // Tell upcoming reservers the gear is back
  const { data: reservations } = await admin
    .from('equipment_reservations')
    .select('reserved_by')
    .eq('item_id', item.id)
    .eq('status', 'active')
  const reserverIds = Array.from(new Set((reservations ?? []).map((r) => r.reserved_by))).filter(
    (id) => id !== user.id
  )
  await Promise.all(
    reserverIds.map((id) =>
      notifyLockup({
        user_id: id,
        type: 'lockup_repair_back',
        title: 'Gear back from repair',
        body: `${itemLabel(item)} is back from repair and available again.`,
        link_url: `/e/${item.code}?src=app`,
      })
    )
  )
  await postLockupChannel(admin, `✅ ${itemLabel(item)} is back from repair`)
  await revalidateHR()
}

// ============================================================
// Item management (Tech Console)
// ============================================================

type ItemFields = {
  name: string
  category: EquipmentCategory
  brandModel?: string
  serialNumber?: string
  homeLocationId?: string
  notes?: string
  purchaseDate?: string
  purchasePriceInr?: number
  purchaseNotes?: string
  kind?: 'pooled' | 'assigned'
  assigneeId?: string | null
  requiresApproval?: boolean
}

function validCategory(category: string): category is EquipmentCategory {
  return EQUIPMENT_CATEGORIES.some((c) => c.key === category)
}

type NewItemFields = {
  name: string
  category: EquipmentCategory
  brand_model: string | null
  serial_number: string | null
  home_location_id: string | null
  notes: string | null
  kind?: 'pooled' | 'assigned'
  assignee_id?: string | null
  requires_approval?: boolean
}

async function insertItemWithFreshCode(
  admin: Admin,
  fields: NewItemFields
): Promise<{ id: string; code: string }> {
  const isAssigned = fields.kind === 'assigned'
  // Retry a few times in the (unlikely) case of a code collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateItemCode()
    const { data, error } = await admin
      .from('equipment_items')
      .insert({
        ...fields,
        code,
        // Pooled gear rests in its home cupboard; an assigned device rests
        // with its owner (no cupboard).
        current_location_id: isAssigned ? null : fields.home_location_id,
        current_holder_id: isAssigned ? fields.assignee_id ?? null : null,
      })
      .select('id, code')
      .single()
    if (!error && data) return data
    if (error && !error.message.includes('equipment_items_code')) {
      throw new ActionError(error.message)
    }
  }
  throw new ActionError('Could not generate a unique item code. Try again.')
}

export async function createItem(input: ItemFields): Promise<string> {
  const user = await requireCapability('manage_equipment')
  const admin = createAdminClient()

  const name = input.name.trim()
  if (!name) throw new ActionError('The item needs a name.')
  if (!validCategory(input.category)) throw new ActionError('Pick a valid category.')
  const kind = input.kind === 'assigned' ? 'assigned' : 'pooled'

  const created = await insertItemWithFreshCode(admin, {
    name,
    category: input.category,
    brand_model: input.brandModel?.trim() || null,
    serial_number: input.serialNumber?.trim() || null,
    home_location_id: input.homeLocationId || null,
    notes: input.notes?.trim() || null,
    kind,
    assignee_id: kind === 'assigned' ? input.assigneeId ?? null : null,
    requires_approval: kind === 'pooled' && input.requiresApproval === true,
  })

  if (input.purchaseDate || input.purchasePriceInr != null || input.purchaseNotes) {
    await admin.from('equipment_private').insert({
      item_id: created.id,
      purchase_date: input.purchaseDate || null,
      purchase_price_inr: input.purchasePriceInr ?? null,
      purchase_notes: input.purchaseNotes?.trim() || null,
    })
  }

  await writeAudit(
    user.id,
    'equipment.item_create',
    'equipment_item',
    created.id,
    null,
    `${user.full_name} added ${name} (${created.code}) to the inventory`
  )
  await revalidateHR()
  return created.id
}

export async function updateItem(input: { itemId: string } & Partial<ItemFields>): Promise<void> {
  const user = await requireCapability('manage_equipment')
  const admin = createAdminClient()
  const item = await getItemOrThrow(admin, input.itemId)

  const updates: Updates<'equipment_items'> = {}
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (!name) throw new ActionError('The item needs a name.')
    updates.name = name
  }
  if (input.category !== undefined) {
    if (!validCategory(input.category)) throw new ActionError('Pick a valid category.')
    updates.category = input.category
  }
  if (input.brandModel !== undefined) updates.brand_model = input.brandModel.trim() || null
  if (input.serialNumber !== undefined) updates.serial_number = input.serialNumber.trim() || null
  if (input.homeLocationId !== undefined) updates.home_location_id = input.homeLocationId || null
  if (input.notes !== undefined) updates.notes = input.notes.trim() || null
  if (input.requiresApproval !== undefined && item.kind === 'pooled') {
    updates.requires_approval = input.requiresApproval
  }

  // Reassigning an owner (assigned devices only). Kind itself is fixed at
  // creation. If the device is resting, its holder follows the new owner.
  if (input.assigneeId !== undefined && item.kind === 'assigned') {
    updates.assignee_id = input.assigneeId || null
    if (item.status === 'available') updates.current_holder_id = input.assigneeId || null
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await admin.from('equipment_items').update(updates).eq('id', item.id)
    if (error) throw new ActionError(error.message)
  }

  if (
    input.purchaseDate !== undefined ||
    input.purchasePriceInr !== undefined ||
    input.purchaseNotes !== undefined
  ) {
    const { error } = await admin.from('equipment_private').upsert({
      item_id: item.id,
      purchase_date: input.purchaseDate || null,
      purchase_price_inr: input.purchasePriceInr ?? null,
      purchase_notes: input.purchaseNotes?.trim() || null,
    })
    if (error) throw new ActionError(error.message)
  }

  await writeAudit(
    user.id,
    'equipment.item_update',
    'equipment_item',
    item.id,
    null,
    `${user.full_name} edited ${itemLabel(item)}`
  )
  await revalidateHR()
}

/** Retire / mark lost / bring back to available. Closes any open checkout. */
export async function setItemStatus(input: {
  itemId: string
  status: 'available' | 'retired' | 'lost'
}): Promise<void> {
  const user = await requireCapability('manage_equipment')
  const admin = createAdminClient()
  const item = await getItemOrThrow(admin, input.itemId)

  if (item.current_checkout_id) {
    await admin
      .from('equipment_checkouts')
      .update({ returned_at: new Date().toISOString() })
      .eq('id', item.current_checkout_id)
  }
  // Close any open repair when the status is decided manually
  await admin
    .from('equipment_repairs')
    .update({ returned_at: new Date().toISOString() })
    .eq('item_id', item.id)
    .is('returned_at', null)

  // Assigned devices rest with their owner (not a cupboard) when available.
  const backToRest = input.status === 'available'
  const { error } = await admin
    .from('equipment_items')
    .update({
      status: input.status,
      current_holder_id: backToRest && item.kind === 'assigned' ? item.assignee_id : null,
      current_checkout_id: null,
      current_location_id:
        backToRest && item.kind === 'pooled' ? item.home_location_id : null,
    })
    .eq('id', item.id)
  if (error) throw new ActionError(error.message)

  await writeAudit(
    user.id,
    'equipment.item_status',
    'equipment_item',
    item.id,
    { before: { status: item.status }, after: { status: input.status } },
    `${user.full_name} marked ${itemLabel(item)} as ${input.status}`
  )
  await revalidateHR()
}

/** Fix reality: the gear is on the shelf but the app thinks it is out. */
export async function forceCheckin(itemId: string): Promise<void> {
  const user = await requireCapability('manage_equipment')
  const admin = createAdminClient()
  const item = await getItemOrThrow(admin, itemId)
  if (item.status !== 'checked_out' || !item.current_checkout_id) {
    throw new ActionError('This item is not checked out.')
  }

  await admin
    .from('equipment_checkouts')
    .update({ returned_at: new Date().toISOString() })
    .eq('id', item.current_checkout_id)
  const isAssigned = item.kind === 'assigned'
  await admin
    .from('equipment_items')
    .update({
      status: 'available',
      // Assigned device goes back to its owner; pooled gear to its home shelf.
      current_holder_id: isAssigned ? item.assignee_id : null,
      current_checkout_id: null,
      current_location_id: isAssigned ? null : item.home_location_id,
    })
    .eq('id', item.id)

  await writeAudit(
    user.id,
    'equipment.force_checkin',
    'equipment_item',
    item.id,
    null,
    `${user.full_name} force checked in ${itemLabel(item)}`
  )
  await revalidateHR()
}

export async function uploadItemPhoto(itemId: string, formData: FormData): Promise<string> {
  const user = await requireCapability('manage_equipment')
  const admin = createAdminClient()
  const item = await getItemOrThrow(admin, itemId)

  const file = formData.get('file') as File | null
  if (!file || file.size === 0) throw new ActionError('No image was provided.')
  if (file.size > 5 * 1024 * 1024) throw new ActionError('Image must be under 5 MB.')
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new ActionError('Use a JPG, PNG, or WebP image.')
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `items/${item.id}/${Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: uploadError } = await admin.storage
    .from('equipment-photos')
    .upload(path, buffer, { contentType: file.type, upsert: false })
  if (uploadError) throw new ActionError(uploadError.message)

  const { data: pub } = admin.storage.from('equipment-photos').getPublicUrl(path)
  await admin.from('equipment_items').update({ photo_url: pub.publicUrl }).eq('id', item.id)

  await writeAudit(
    user.id,
    'equipment.item_photo',
    'equipment_item',
    item.id,
    null,
    `${user.full_name} updated the photo of ${itemLabel(item)}`
  )
  await revalidateHR()
  return pub.publicUrl
}

// ============================================================
// Locations
// ============================================================

export async function createLocation(label: string): Promise<void> {
  const user = await requireCapability('manage_equipment')
  const admin = createAdminClient()
  const trimmed = label.trim()
  if (!trimmed) throw new ActionError('The location needs a label.')
  const { error } = await admin.from('equipment_locations').insert({ label: trimmed })
  if (error) throw new ActionError(error.message)
  await writeAudit(user.id, 'equipment.location_create', 'equipment_location', trimmed, null,
    `${user.full_name} added storage location ${trimmed}`)
  await revalidateHR()
}

export async function renameLocation(input: { locationId: string; label: string }): Promise<void> {
  const user = await requireCapability('manage_equipment')
  const admin = createAdminClient()
  const trimmed = input.label.trim()
  if (!trimmed) throw new ActionError('The location needs a label.')
  const { error } = await admin
    .from('equipment_locations')
    .update({ label: trimmed })
    .eq('id', input.locationId)
  if (error) throw new ActionError(error.message)
  await writeAudit(user.id, 'equipment.location_rename', 'equipment_location', input.locationId,
    null, `${user.full_name} renamed a storage location to ${trimmed}`)
  await revalidateHR()
}

export async function deleteLocation(locationId: string): Promise<void> {
  const user = await requireCapability('manage_equipment')
  const admin = createAdminClient()
  const { count } = await admin
    .from('equipment_items')
    .select('id', { count: 'exact', head: true })
    .eq('home_location_id', locationId)
  if ((count ?? 0) > 0) {
    throw new ActionError('Move the items stored here to another location first.')
  }
  const { error } = await admin.from('equipment_locations').delete().eq('id', locationId)
  if (error) throw new ActionError(error.message)
  await writeAudit(user.id, 'equipment.location_delete', 'equipment_location', locationId, null,
    `${user.full_name} deleted a storage location`)
  await revalidateHR()
}

// ============================================================
// CSV import
// ============================================================

export type ImportRow = {
  name: string
  category: string
  brand_model?: string
  serial_number?: string
  location: string
  quantity?: number
  purchase_date?: string
  purchase_price_inr?: number
  notes?: string
}

export type ImportResult = {
  created: number
  errors: { row: number; message: string }[]
}

export async function importEquipmentCsv(rows: ImportRow[]): Promise<ImportResult> {
  const user = await requireCapability('manage_equipment')
  const admin = createAdminClient()

  if (rows.length === 0) throw new ActionError('The file has no data rows.')
  if (rows.length > 500) throw new ActionError('Import at most 500 rows at a time.')

  const { data: locations } = await admin.from('equipment_locations').select('id, label')
  const locationByLabel = new Map(
    (locations ?? []).map((l) => [l.label.toLowerCase(), l.id])
  )

  const errors: ImportResult['errors'] = []
  let created = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNo = i + 2 // header is row 1 in the file
    const name = (row.name ?? '').trim()
    const category = (row.category ?? '').trim().toLowerCase()
    const locationLabel = (row.location ?? '').trim()
    const quantity = Math.floor(row.quantity ?? 1)

    if (!name) {
      errors.push({ row: rowNo, message: 'Missing name' })
      continue
    }
    if (!validCategory(category)) {
      errors.push({ row: rowNo, message: `Unknown category "${row.category}"` })
      continue
    }
    const locationId = locationByLabel.get(locationLabel.toLowerCase())
    if (!locationId) {
      errors.push({ row: rowNo, message: `Unknown location "${row.location}" (use L1 or L2)` })
      continue
    }
    if (quantity < 1 || quantity > 99) {
      errors.push({ row: rowNo, message: 'Quantity must be between 1 and 99' })
      continue
    }
    if (quantity > 1 && row.serial_number?.trim()) {
      errors.push({ row: rowNo, message: 'Serial number only works with quantity 1' })
      continue
    }

    for (let n = 1; n <= quantity; n++) {
      const unitName = quantity > 1 ? `${name} #${n}` : name
      try {
        const item = await insertItemWithFreshCode(admin, {
          name: unitName,
          category,
          brand_model: row.brand_model?.trim() || null,
          serial_number: quantity === 1 ? row.serial_number?.trim() || null : null,
          home_location_id: locationId,
          notes: row.notes?.trim() || null,
        })
        if (row.purchase_date || row.purchase_price_inr != null) {
          await admin.from('equipment_private').insert({
            item_id: item.id,
            purchase_date: row.purchase_date || null,
            purchase_price_inr: row.purchase_price_inr ?? null,
          })
        }
        created++
      } catch (err) {
        errors.push({
          row: rowNo,
          message: err instanceof Error ? err.message : 'Insert failed',
        })
        break
      }
    }
  }

  await writeAudit(
    user.id,
    'equipment.import',
    'equipment_item',
    'csv-import',
    { after: { created, errors: errors.length } },
    `${user.full_name} imported ${created} item(s) from CSV`
  )
  await revalidateHR()
  return { created, errors }
}

// ============================================================
// Slack bot controls (Tech Console)
// ============================================================

const LOCKUP_SLACK_TOGGLES = [
  'slack_dm_enabled',
  'slack_reminders_enabled',
  'slack_channel_feed',
] as const
type LockupSlackToggleKey = (typeof LOCKUP_SLACK_TOGGLES)[number]

/** Flip one of the Lockup Slack feature toggles (equipment_settings singleton). */
export async function updateLockupSlackSetting(
  key: LockupSlackToggleKey,
  value: boolean
): Promise<void> {
  const user = await requireCapability('manage_equipment')
  if (!LOCKUP_SLACK_TOGGLES.includes(key)) throw new ActionError('Unknown setting')

  const admin = createAdminClient()
  const base = { id: 1, updated_at: new Date().toISOString() }
  const payload =
    key === 'slack_dm_enabled'
      ? { ...base, slack_dm_enabled: value }
      : key === 'slack_reminders_enabled'
        ? { ...base, slack_reminders_enabled: value }
        : { ...base, slack_channel_feed: value }
  const { error } = await admin.from('equipment_settings').upsert(payload)
  if (error) throw new ActionError(error.message)

  await writeAudit(user.id, 'equipment.slack_setting_update', 'equipment_settings', '1', {
    after: { [key]: value },
  })
  await revalidateHR()
}

/** Read-only health check shown at the top of the Tech Console Slack tab. */
export async function getLockupSlackStatus() {
  await requireCapability('manage_equipment')
  const tokenSet = Boolean(process.env.LOCKUP_SLACK_BOT_TOKEN)
  const channelSet = Boolean(process.env.LOCKUP_SLACK_CHANNEL)
  if (!tokenSet) {
    return { tokenSet, channelSet, ok: false, team: null, botUser: null, error: null }
  }

  const res = await lockupSlackApi('auth.test', {})
  return {
    tokenSet,
    channelSet,
    ok: Boolean(res?.ok),
    team: (res?.team as string | undefined) ?? null,
    botUser: (res?.user as string | undefined) ?? null,
    error: (res?.error as string | undefined) ?? null,
  }
}

/**
 * Post a one-off test message so the Tech Lead can confirm wiring. Goes to the
 * activity channel when LOCKUP_SLACK_CHANNEL is set, otherwise DMs the caller.
 * Deliberately bypasses the feature toggles: a test should always send.
 */
export async function sendLockupSlackTest(): Promise<{ via: 'channel' | 'dm' }> {
  const user = await requireCapability('manage_equipment')
  if (!process.env.LOCKUP_SLACK_BOT_TOKEN) {
    throw new ActionError('Lockup Slack bot token is not configured.')
  }

  const channel = process.env.LOCKUP_SLACK_CHANNEL
  if (channel) {
    const res = await lockupSlackApi('chat.postMessage', {
      channel,
      text: '✅ Lockup is connected to this channel. (Test message sent from the Tech Console.)',
      unfurl_links: false,
    })
    if (!res?.ok) throw new ActionError(`Slack rejected the message: ${res?.error ?? 'unknown error'}`)
    return { via: 'channel' }
  }

  const admin = createAdminClient()
  const { data: me } = await admin
    .from('users')
    .select('id, email, slack_user_id')
    .eq('id', user.id)
    .single()
  const slackId = me ? await resolveSlackUserId(admin, me) : null
  if (!slackId) {
    throw new ActionError('Could not match your Slack account. Run "Sync IDs from email" first.')
  }
  const opened = await lockupSlackApi('conversations.open', { users: slackId })
  const channelId =
    opened && opened.ok ? (opened.channel as { id?: string } | undefined)?.id : undefined
  if (!channelId) {
    throw new ActionError(`Slack could not open a DM: ${(opened?.error as string) ?? 'unknown error'}`)
  }
  const res = await lockupSlackApi('chat.postMessage', {
    channel: channelId,
    text: '✅ The Lockup bot can DM you. (Test message sent from the Tech Console.)',
    unfurl_links: false,
  })
  if (!res?.ok) throw new ActionError(`Slack rejected the message: ${res?.error ?? 'unknown error'}`)
  return { via: 'dm' }
}

/**
 * Bulk-fill Slack member ids by matching each active user's email against the
 * workspace member list, using the Lockup bot's token. Writes the same
 * users.slack_user_id column the Orbit bot and profiles use (one workspace,
 * one cached id), so running it here helps both bots.
 */
export async function syncLockupSlackIds(): Promise<{
  matched: number
  already: number
  unmatched: number
}> {
  const user = await requireCapability('manage_equipment')
  if (!process.env.LOCKUP_SLACK_BOT_TOKEN) {
    throw new ActionError('Lockup Slack bot token is not configured.')
  }

  type SlackMember = {
    id: string
    deleted?: boolean
    is_bot?: boolean
    profile?: { email?: string | null }
  }

  // Email -> slack id from the full workspace member list (cursor-paged).
  const slackByEmail = new Map<string, string>()
  let cursor: string | undefined
  for (let page = 0; page < 25; page++) {
    const res = await lockupSlackApi('users.list', { limit: 200, ...(cursor ? { cursor } : {}) })
    if (!res?.ok) {
      throw new ActionError(`Slack error while listing members: ${(res?.error as string) ?? 'unknown'}`)
    }
    for (const m of (res.members as SlackMember[] | undefined) ?? []) {
      const email = m.profile?.email
      if (email && !m.deleted && !m.is_bot) {
        slackByEmail.set(email.toLowerCase(), m.id)
      }
    }
    cursor = ((res.response_metadata as { next_cursor?: string } | undefined)?.next_cursor) || undefined
    if (!cursor) break
  }

  const admin = createAdminClient()
  const { data: users } = await admin
    .from('users')
    .select('id, email, slack_user_id')
    .eq('status', 'active')

  let matched = 0
  let already = 0
  let unmatched = 0
  for (const u of users ?? []) {
    if (u.slack_user_id) {
      already++
      continue
    }
    const id = u.email ? slackByEmail.get(u.email.toLowerCase()) : undefined
    if (id) {
      await admin.from('users').update({ slack_user_id: id }).eq('id', u.id)
      matched++
    } else {
      unmatched++
    }
  }

  await writeAudit(user.id, 'equipment.slack_sync_ids', 'equipment_settings', '1', {
    after: { matched, already, unmatched },
  })
  await revalidateHR()
  return { matched, already, unmatched }
}
