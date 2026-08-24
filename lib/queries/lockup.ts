import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLockupSlackSettings, type LockupSlackSettings } from '@/lib/slack-lockup'
import type { Tables } from '@/lib/supabase/database.types'
import type { EquipmentCategory, EquipmentStatus, ShootStatus } from '@/lib/lockup/constants'

// ============================================================
// Shared shapes
// ============================================================

export type ReservationBadge = {
  id: string
  shoot_id: string
  shoot_name: string
  shoot_starts_at: string
  shoot_ends_at: string
  reserved_by: string
  reserved_by_name: string
  /** 'pending' = flagged item awaiting manager approval; still real intent. */
  status: 'active' | 'pending'
}

export type EquipmentItemRow = Tables<'equipment_items'> & {
  home_location_label: string | null
  /** Where the item was actually last dropped (may differ from its home shelf).
   *  Null while checked out. This is what "Available in ..." should show. */
  current_location_label: string | null
  /** Long-term owner name (assigned devices only). */
  assignee_name: string | null
  holder_name: string | null
  /** Open checkout (when checked out) */
  due_at: string | null
  checked_out_at: string | null
  checkout_shoot_name: string | null
  /** Open repair (when in repair) */
  repair_expected_back_on: string | null
  repair_vendor: string | null
  /** Active reservations on upcoming/running shoots */
  active_reservations: ReservationBadge[]
}

export type MyGearRow = {
  checkout_id: string
  item_id: string
  item_code: string
  item_name: string
  category: EquipmentCategory
  photo_url: string | null
  home_location_label: string | null
  checked_out_at: string
  due_at: string | null
  overdue: boolean
  shoot_name: string | null
}

/** A device the current user holds — either their own assigned one (resting)
 *  or one they borrowed from someone else. */
export type MyDeviceRow = {
  item_id: string
  item_code: string
  item_name: string
  category: EquipmentCategory
  photo_url: string | null
  assignee_id: string | null
  assignee_name: string | null
}

export type MyDevices = {
  assignedToMe: MyDeviceRow[]
  borrowedByMe: MyDeviceRow[]
}

export type ShootConflict = {
  kind: 'in_repair' | 'still_out' | 'double_reserved' | 'unavailable'
  message: string
  /** Compact badge form of message, e.g. "out til Fri 14" / "reserved: Ep 43". */
  short: string
}

export type ShootReservationRow = {
  id: string
  status: Tables<'equipment_reservations'>['status']
  reserved_by: string
  reserved_by_name: string
  item: {
    id: string
    code: string
    name: string
    category: EquipmentCategory
    photo_url: string | null
    status: EquipmentStatus
    holder_name: string | null
    due_at: string | null
    repair_expected_back_on: string | null
  }
  conflict: ShootConflict | null
}

export type StudioBlockRow = {
  id: string
  studio_id: string
  studio_name: string
  starts_at: string
  ends_at: string
}

export type StudioScheduleEntry = StudioBlockRow & {
  /** Null for a standalone hold: someone blocked the room without a shoot. */
  shoot_id: string | null
  /** The shoot's name, or the hold's own title. Always something to show. */
  shoot_name: string
  created_by: string
  created_by_name: string
}

export type ShootSummary = {
  id: string
  name: string
  location: string | null
  starts_at: string
  ends_at: string
  owner_id: string
  owner_name: string
  status: ShootStatus
  /** planned shoots whose window has started display as active */
  effective_status: ShootStatus
  reserved_count: number
  picked_up_count: number
  conflict_count: number
  notes: string | null
  studio_blocks: StudioBlockRow[]
}

export type ShootEditor = {
  editor_row_id: string
  user_id: string
  full_name: string
}

export type ShootDetail = ShootSummary & {
  reservations: ShootReservationRow[]
  editors: ShootEditor[]
}

export type AvailabilityRow = {
  item_id: string
  code: string
  name: string
  category: EquipmentCategory
  photo_url: string | null
  status: EquipmentStatus
  home_location_label: string | null
  requires_approval: boolean
  available: boolean
  conflict: ShootConflict | null
  already_reserved_for_shoot: boolean
}

export type KitRow = {
  id: string
  name: string
  notes: string | null
  items: {
    item_id: string
    code: string
    name: string
    category: EquipmentCategory
    status: EquipmentStatus
    requires_approval: boolean
  }[]
}

export type PendingApprovalRow = {
  reservation_id: string
  created_at: string
  reserved_by: string
  reserved_by_name: string
  item: {
    id: string
    code: string
    name: string
    category: EquipmentCategory
    photo_url: string | null
  }
  shoot: {
    id: string
    name: string
    starts_at: string
    ends_at: string
  }
}

export type ActivityEvent = {
  at: string
  kind:
    | 'checkout'
    | 'return'
    | 'transfer'
    | 'repair_sent'
    | 'repair_back'
    | 'issue_open'
    | 'issue_resolved'
  item_id: string
  item_name: string
  item_code: string
  actor_name: string
  detail: string
}

export type TechConsoleData = {
  stats: {
    items: number
    out_now: number
    overdue: number
    in_repair: number
    open_issues: number
  }
  repairs: (Tables<'equipment_repairs'> & {
    item_name: string
    item_code: string
    sent_by_name: string
  })[]
  issues: (Tables<'equipment_issues'> & {
    item_name: string
    item_code: string
    reported_by_name: string
  })[]
  activity: ActivityEvent[]
  locations: (Tables<'equipment_locations'> & { item_count: number })[]
  studios: (Tables<'equipment_studios'> & { upcoming_blocks: number })[]
  /** item_id -> purchase data, only loaded for the console (capability-gated page) */
  privateByItem: Record<string, Tables<'equipment_private'>>
}

// ============================================================
// Internal helpers
// ============================================================

type Admin = ReturnType<typeof createAdminClient>

async function nameMap(adminClient: Admin, ids: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter(Boolean)))
  if (unique.length === 0) return new Map()
  const { data } = await adminClient.from('users').select('id, full_name').in('id', unique)
  return new Map((data ?? []).map((u) => [u.id, u.full_name]))
}

// The next four helpers back several query functions that often run within the
// same page render (listEquipment + listShoots on /lockup, for example). They
// are wrapped in React.cache so one request fetches each table at most ONCE,
// no matter how many query functions need it. The cache lives per request, so
// no staleness survives a mutation + revalidate.

const locationMap = cache(async (): Promise<Map<string, string>> => {
  const adminClient = createAdminClient()
  const { data } = await adminClient.from('equipment_locations').select('id, label')
  return new Map((data ?? []).map((l) => [l.id, l.label]))
})

const studioMap = cache(async (): Promise<Map<string, string>> => {
  const adminClient = createAdminClient()
  const { data } = await adminClient.from('equipment_studios').select('id, name')
  return new Map((data ?? []).map((s) => [s.id, s.name]))
})

/** Studio blocks for a set of shoots, grouped by shoot id, names resolved. */
async function studioBlocksByShoot(
  adminClient: Admin,
  shootIds: string[]
): Promise<Map<string, StudioBlockRow[]>> {
  if (shootIds.length === 0) return new Map()
  const [{ data: blocks }, studios] = await Promise.all([
    adminClient
      .from('equipment_studio_blocks')
      .select('*')
      .in('shoot_id', shootIds)
      .order('starts_at'),
    studioMap(),
  ])
  const byShoot = new Map<string, StudioBlockRow[]>()
  for (const b of blocks ?? []) {
    // Standalone holds have no shoot to group under.
    if (!b.shoot_id) continue
    const list = byShoot.get(b.shoot_id) ?? []
    list.push({
      id: b.id,
      studio_id: b.studio_id,
      studio_name: studios.get(b.studio_id) ?? 'Studio',
      starts_at: b.starts_at,
      ends_at: b.ends_at,
    })
    byShoot.set(b.shoot_id, list)
  }
  return byShoot
}

function shootWindowOverlaps(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return new Date(aStart) <= new Date(bEnd) && new Date(bStart) <= new Date(aEnd)
}

function effectiveShootStatus(shoot: Tables<'equipment_shoots'>): ShootStatus {
  if (shoot.status === 'cancelled' || shoot.status === 'done') return shoot.status
  const now = new Date()
  if (now < new Date(shoot.starts_at)) return 'planned'
  if (now <= new Date(shoot.ends_at)) return 'active'
  return 'done'
}

/** Conflict of one item against one shoot window, given open checkout/repair
 *  info and the item's other active reservations. */
function computeConflict(args: {
  itemStatus: EquipmentStatus
  dueAt: string | null
  repairBackOn: string | null
  shootStartsAt: string
  shootEndsAt: string
  otherReservations: ReservationBadge[]
}): ShootConflict | null {
  const { itemStatus, dueAt, repairBackOn, shootStartsAt, shootEndsAt, otherReservations } = args

  if (itemStatus === 'retired' || itemStatus === 'lost') {
    return { kind: 'unavailable', message: `Item is marked ${itemStatus}`, short: itemStatus }
  }
  if (itemStatus === 'in_repair') {
    if (!repairBackOn) {
      return {
        kind: 'in_repair',
        message: 'In repair, no expected return date',
        short: 'in repair',
      }
    }
    if (new Date(repairBackOn) >= new Date(shootStartsAt)) {
      return {
        kind: 'in_repair',
        message: `In repair, expected back ${formatDay(repairBackOn)}`,
        short: `repair til ${formatDay(repairBackOn)}`,
      }
    }
  }
  if (itemStatus === 'checked_out' && dueAt && new Date(dueAt) > new Date(shootStartsAt)) {
    return {
      kind: 'still_out',
      message: `Checked out until ${formatDayTime(dueAt)}`,
      short: `out til ${formatDay(dueAt)}`,
    }
  }
  const clash = otherReservations.find((r) =>
    shootWindowOverlaps(shootStartsAt, shootEndsAt, r.shoot_starts_at, r.shoot_ends_at)
  )
  if (clash) {
    return {
      kind: 'double_reserved',
      message: `Also reserved for ${clash.shoot_name} (${formatDay(clash.shoot_starts_at)} to ${formatDay(clash.shoot_ends_at)})`,
      short: `reserved: ${clash.shoot_name}`,
    }
  }
  return null
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  })
}

function formatDayTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  })
}

/** Live (active + pending-approval) reservations joined with their (not
 *  cancelled/done) shoots, grouped by item. Pending counts as intent for
 *  conflict purposes. */
const activeReservationsByItem = cache(async (): Promise<Map<string, ReservationBadge[]>> => {
  const adminClient = createAdminClient()
  const { data: reservations } = await adminClient
    .from('equipment_reservations')
    .select('id, item_id, shoot_id, reserved_by, status')
    .in('status', ['active', 'pending'] as unknown as ('active' | 'pending')[])
  if (!reservations || reservations.length === 0) return new Map()

  const shootIds = Array.from(new Set(reservations.map((r) => r.shoot_id)))
  const { data: shoots } = await adminClient
    .from('equipment_shoots')
    .select('id, name, starts_at, ends_at, status')
    .in('id', shootIds)
  const shootMap = new Map((shoots ?? []).map((s) => [s.id, s]))
  const names = await nameMap(adminClient, reservations.map((r) => r.reserved_by))

  const byItem = new Map<string, ReservationBadge[]>()
  for (const r of reservations) {
    const shoot = shootMap.get(r.shoot_id)
    if (!shoot || shoot.status === 'cancelled' || shoot.status === 'done') continue
    const list = byItem.get(r.item_id) ?? []
    list.push({
      id: r.id,
      shoot_id: r.shoot_id,
      shoot_name: shoot.name,
      shoot_starts_at: shoot.starts_at,
      shoot_ends_at: shoot.ends_at,
      reserved_by: r.reserved_by,
      reserved_by_name: names.get(r.reserved_by) ?? 'Unknown',
      status: r.status as 'active' | 'pending',
    })
    byItem.set(r.item_id, list)
  }
  return byItem
})

/** Open checkouts (returned_at IS NULL) keyed by item, with shoot names. */
const openCheckoutsByItem = cache(async () => {
  const adminClient = createAdminClient()
  const { data: checkouts } = await adminClient
    .from('equipment_checkouts')
    .select('*')
    .is('returned_at', null)
  const list = checkouts ?? []
  const shootIds = Array.from(new Set(list.map((c) => c.shoot_id).filter(Boolean))) as string[]
  let shootNames = new Map<string, string>()
  if (shootIds.length > 0) {
    const { data: shoots } = await adminClient
      .from('equipment_shoots')
      .select('id, name')
      .in('id', shootIds)
    shootNames = new Map((shoots ?? []).map((s) => [s.id, s.name]))
  }
  return {
    byItem: new Map(list.map((c) => [c.item_id, c])),
    shootNames,
    all: list,
  }
})

const openRepairsByItem = cache(async () => {
  const adminClient = createAdminClient()
  const { data: repairs } = await adminClient
    .from('equipment_repairs')
    .select('*')
    .is('returned_at', null)
  return new Map((repairs ?? []).map((r) => [r.item_id, r]))
})

async function enrichItems(
  adminClient: Admin,
  items: Tables<'equipment_items'>[]
): Promise<EquipmentItemRow[]> {
  const [locations, reservations, checkouts, repairs] = await Promise.all([
    locationMap(),
    activeReservationsByItem(),
    openCheckoutsByItem(),
    openRepairsByItem(),
  ])
  const names = await nameMap(adminClient, [
    ...(items.map((i) => i.current_holder_id).filter(Boolean) as string[]),
    ...(items.map((i) => i.assignee_id).filter(Boolean) as string[]),
  ])

  return items.map((item) => {
    const checkout = checkouts.byItem.get(item.id) ?? null
    const repair = repairs.get(item.id) ?? null
    return {
      ...item,
      home_location_label: item.home_location_id
        ? locations.get(item.home_location_id) ?? null
        : null,
      current_location_label: item.current_location_id
        ? locations.get(item.current_location_id) ?? null
        : null,
      assignee_name: item.assignee_id ? names.get(item.assignee_id) ?? null : null,
      holder_name: item.current_holder_id
        ? names.get(item.current_holder_id) ?? null
        : null,
      due_at: checkout?.due_at ?? null,
      checked_out_at: checkout?.checked_out_at ?? null,
      checkout_shoot_name: checkout?.shoot_id
        ? checkouts.shootNames.get(checkout.shoot_id) ?? null
        : null,
      repair_expected_back_on: repair?.expected_back_on ?? null,
      repair_vendor: repair?.vendor ?? null,
      active_reservations: reservations.get(item.id) ?? [],
    }
  })
}

// ============================================================
// Public queries
// ============================================================

export async function listEquipment(): Promise<EquipmentItemRow[]> {
  const adminClient = createAdminClient()
  const { data: items } = await adminClient
    .from('equipment_items')
    .select('*')
    .order('name')
  return enrichItems(adminClient, items ?? [])
}

export async function getItemByCode(code: string): Promise<EquipmentItemRow | null> {
  const adminClient = createAdminClient()
  const { data: item } = await adminClient
    .from('equipment_items')
    .select('*')
    .eq('code', code.toUpperCase())
    .maybeSingle()
  if (!item) return null
  const [enriched] = await enrichItems(adminClient, [item])
  return enriched ?? null
}

export type ItemHistoryEvent = {
  at: string
  kind: 'checkout' | 'return' | 'transfer' | 'repair_sent' | 'repair_back' | 'issue_open' | 'issue_resolved'
  text: string
}

/** Chronological history of one item (newest first), assembled from checkouts,
 *  repairs and issues. */
export async function getItemHistory(itemId: string, limit = 25): Promise<ItemHistoryEvent[]> {
  const adminClient = createAdminClient()
  const [{ data: checkouts }, { data: repairs }, { data: issues }, locations] = await Promise.all([
    adminClient
      .from('equipment_checkouts')
      .select('*')
      .eq('item_id', itemId)
      .order('checked_out_at', { ascending: false })
      .limit(limit),
    adminClient
      .from('equipment_repairs')
      .select('*')
      .eq('item_id', itemId)
      .order('sent_at', { ascending: false })
      .limit(limit),
    adminClient
      .from('equipment_issues')
      .select('*')
      .eq('item_id', itemId)
      .order('created_at', { ascending: false })
      .limit(limit),
    locationMap(),
  ])

  const userIds = [
    ...(checkouts ?? []).map((c) => c.holder_id),
    ...(repairs ?? []).map((r) => r.sent_by),
    ...(issues ?? []).map((i) => i.reported_by),
  ]
  const names = await nameMap(adminClient, userIds)
  const name = (id: string) => names.get(id) ?? 'Unknown'

  const events: ItemHistoryEvent[] = []
  for (const c of checkouts ?? []) {
    events.push({
      at: c.checked_out_at,
      kind: c.transferred_from_checkout_id ? 'transfer' : 'checkout',
      text: c.transferred_from_checkout_id
        ? `${name(c.holder_id)} took over`
        : c.due_at
          ? `${name(c.holder_id)} checked out, due ${formatDayTime(c.due_at)}`
          : `${name(c.holder_id)} borrowed it`,
    })
    if (c.returned_at) {
      const loc = c.returned_location_id ? locations.get(c.returned_location_id) : null
      events.push({
        at: c.returned_at,
        kind: 'return',
        // Pooled gear returns to a cupboard; assigned devices go back to the owner.
        text: `${name(c.holder_id)} ${loc ? `checked in to ${loc}` : 'handed it back'}`,
      })
    }
  }
  for (const r of repairs ?? []) {
    events.push({
      at: r.sent_at,
      kind: 'repair_sent',
      text: `${name(r.sent_by)} sent for repair${r.vendor ? ` (${r.vendor})` : ''}${
        r.expected_back_on ? `, expected back ${formatDay(r.expected_back_on)}` : ''
      }`,
    })
    if (r.returned_at) {
      events.push({ at: r.returned_at, kind: 'repair_back', text: 'Back from repair' })
    }
  }
  for (const i of issues ?? []) {
    events.push({
      at: i.created_at,
      kind: 'issue_open',
      text: `${name(i.reported_by)} reported a problem: ${i.note}`,
    })
    if (i.resolved_at) {
      events.push({ at: i.resolved_at, kind: 'issue_resolved', text: 'Problem resolved' })
    }
  }
  return events
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit)
}

export async function getMyGear(userId: string): Promise<MyGearRow[]> {
  const adminClient = createAdminClient()
  const { data: checkouts } = await adminClient
    .from('equipment_checkouts')
    .select('*')
    .eq('holder_id', userId)
    .is('returned_at', null)
    .order('due_at')
  const list = checkouts ?? []
  if (list.length === 0) return []

  const [{ data: items }, locations] = await Promise.all([
    adminClient
      .from('equipment_items')
      .select('*')
      .in('id', list.map((c) => c.item_id)),
    locationMap(),
  ])
  const itemMap = new Map((items ?? []).map((i) => [i.id, i]))

  const shootIds = Array.from(new Set(list.map((c) => c.shoot_id).filter(Boolean))) as string[]
  let shootNames = new Map<string, string>()
  if (shootIds.length > 0) {
    const { data: shoots } = await adminClient
      .from('equipment_shoots')
      .select('id, name')
      .in('id', shootIds)
    shootNames = new Map((shoots ?? []).map((s) => [s.id, s.name]))
  }

  const now = new Date()
  return list.flatMap((c) => {
    const item = itemMap.get(c.item_id)
    // Assigned-device loans surface in "My Devices", not the pooled gear list.
    if (!item || item.kind === 'assigned') return []
    return [
      {
        checkout_id: c.id,
        item_id: item.id,
        item_code: item.code,
        item_name: item.name,
        category: item.category,
        photo_url: item.photo_url,
        home_location_label: item.home_location_id
          ? locations.get(item.home_location_id) ?? null
          : null,
        checked_out_at: c.checked_out_at,
        due_at: c.due_at,
        overdue: c.due_at ? new Date(c.due_at) < now : false,
        shoot_name: c.shoot_id ? shootNames.get(c.shoot_id) ?? null : null,
      },
    ]
  })
}

/** The devices a person currently has: their own assigned ones, plus any they
 *  borrowed from someone else. Powers the dashboard "Device With Me" view. */
export async function getMyDevices(userId: string): Promise<MyDevices> {
  const adminClient = createAdminClient()
  // Everything assigned that is either owned by me, or physically with me.
  const { data: rows } = await adminClient
    .from('equipment_items')
    .select('*')
    .eq('kind', 'assigned')
    .or(`assignee_id.eq.${userId},current_holder_id.eq.${userId}`)
    .order('name')
  const items = rows ?? []
  if (items.length === 0) return { assignedToMe: [], borrowedByMe: [] }

  const assigneeNames = await nameMap(
    adminClient,
    items.map((i) => i.assignee_id).filter(Boolean) as string[]
  )
  const toRow = (i: (typeof items)[number]): MyDeviceRow => ({
    item_id: i.id,
    item_code: i.code,
    item_name: i.name,
    category: i.category,
    photo_url: i.photo_url,
    assignee_id: i.assignee_id,
    assignee_name: i.assignee_id ? assigneeNames.get(i.assignee_id) ?? null : null,
  })

  const assignedToMe = items.filter((i) => i.assignee_id === userId).map(toRow)
  // Borrowed = physically with me but owned by someone else (or unassigned).
  const borrowedByMe = items
    .filter((i) => i.current_holder_id === userId && i.assignee_id !== userId)
    .map(toRow)
  return { assignedToMe, borrowedByMe }
}

// ============================================================
// Shoots
// ============================================================

async function buildShootReservations(
  adminClient: Admin,
  shoot: Tables<'equipment_shoots'>
): Promise<ShootReservationRow[]> {
  const { data: reservations } = await adminClient
    .from('equipment_reservations')
    .select('*')
    .eq('shoot_id', shoot.id)
    .in('status', ['active', 'pending', 'picked_up'] as unknown as (
      | 'active'
      | 'pending'
      | 'picked_up'
    )[])
    .order('created_at')
  const list = reservations ?? []
  if (list.length === 0) return []

  const itemIds = list.map((r) => r.item_id)
  const [{ data: items }, reservationsByItem, checkouts, repairs] = await Promise.all([
    adminClient.from('equipment_items').select('*').in('id', itemIds),
    activeReservationsByItem(),
    openCheckoutsByItem(),
    openRepairsByItem(),
  ])
  const itemMap = new Map((items ?? []).map((i) => [i.id, i]))
  const names = await nameMap(adminClient, [
    ...list.map((r) => r.reserved_by),
    ...(items ?? []).map((i) => i.current_holder_id).filter(Boolean) as string[],
  ])

  return list.flatMap((r) => {
    const item = itemMap.get(r.item_id)
    if (!item) return []
    const checkout = checkouts.byItem.get(item.id) ?? null
    const repair = repairs.get(item.id) ?? null
    const others = (reservationsByItem.get(item.id) ?? []).filter((b) => b.id !== r.id)
    const conflict =
      r.status === 'picked_up'
        ? null
        : computeConflict({
            itemStatus: item.status,
            dueAt: checkout?.due_at ?? null,
            repairBackOn: repair?.expected_back_on ?? null,
            shootStartsAt: shoot.starts_at,
            shootEndsAt: shoot.ends_at,
            otherReservations: others,
          })
    return [
      {
        id: r.id,
        status: r.status,
        reserved_by: r.reserved_by,
        reserved_by_name: names.get(r.reserved_by) ?? 'Unknown',
        item: {
          id: item.id,
          code: item.code,
          name: item.name,
          category: item.category,
          photo_url: item.photo_url,
          status: item.status,
          holder_name: item.current_holder_id
            ? names.get(item.current_holder_id) ?? null
            : null,
          due_at: checkout?.due_at ?? null,
          repair_expected_back_on: repair?.expected_back_on ?? null,
        },
        conflict,
      },
    ]
  })
}

export async function listShoots(): Promise<ShootSummary[]> {
  const adminClient = createAdminClient()
  // Auto-archive: shoots vanish from the list one week after their last day.
  // Nothing is deleted; the detail page still opens via a direct link, and
  // checkout history keeps its shoot names.
  const archiveCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: shoots } = await adminClient
    .from('equipment_shoots')
    .select('*')
    .neq('status', 'cancelled')
    .gte('ends_at', archiveCutoff)
    .order('starts_at', { ascending: false })
    .limit(50)
  const list = shoots ?? []
  if (list.length === 0) return []

  // Batched on purpose: one round trip per table, NOT per shoot. Latency to
  // Supabase dominates page time, so per-shoot loops are the enemy here.
  const shootIds = list.map((s) => s.id)
  const [{ data: allReservations }, reservationsByItem, checkouts, repairs, names, studioBlocks] =
    await Promise.all([
      adminClient
        .from('equipment_reservations')
        .select('*')
        .in('shoot_id', shootIds)
        .in('status', ['active', 'pending', 'picked_up'] as unknown as (
          | 'active'
          | 'pending'
          | 'picked_up'
        )[]),
      activeReservationsByItem(),
      openCheckoutsByItem(),
      openRepairsByItem(),
      nameMap(adminClient, list.map((s) => s.owner_id)),
      studioBlocksByShoot(adminClient, shootIds),
    ])
  const reservations = allReservations ?? []

  const itemIds = Array.from(new Set(reservations.map((r) => r.item_id)))
  const { data: items } = itemIds.length
    ? await adminClient.from('equipment_items').select('*').in('id', itemIds)
    : { data: [] as Tables<'equipment_items'>[] }
  const itemMap = new Map((items ?? []).map((i) => [i.id, i]))

  return list.map((shoot) => {
    const shootReservations = reservations.filter((r) => r.shoot_id === shoot.id)
    let conflictCount = 0
    for (const r of shootReservations) {
      if (r.status !== 'active') continue
      const item = itemMap.get(r.item_id)
      if (!item) continue
      const checkout = checkouts.byItem.get(item.id) ?? null
      const repair = repairs.get(item.id) ?? null
      const others = (reservationsByItem.get(item.id) ?? []).filter((b) => b.id !== r.id)
      const conflict = computeConflict({
        itemStatus: item.status,
        dueAt: checkout?.due_at ?? null,
        repairBackOn: repair?.expected_back_on ?? null,
        shootStartsAt: shoot.starts_at,
        shootEndsAt: shoot.ends_at,
        otherReservations: others,
      })
      if (conflict) conflictCount++
    }
    return {
      id: shoot.id,
      name: shoot.name,
      location: shoot.location,
      starts_at: shoot.starts_at,
      ends_at: shoot.ends_at,
      owner_id: shoot.owner_id,
      owner_name: names.get(shoot.owner_id) ?? 'Unknown',
      status: shoot.status,
      effective_status: effectiveShootStatus(shoot),
      reserved_count: shootReservations.length,
      picked_up_count: shootReservations.filter((r) => r.status === 'picked_up').length,
      conflict_count: conflictCount,
      notes: shoot.notes,
      studio_blocks: studioBlocks.get(shoot.id) ?? [],
    }
  })
}

export async function getShootDetail(shootId: string): Promise<ShootDetail | null> {
  const adminClient = createAdminClient()
  const { data: shoot } = await adminClient
    .from('equipment_shoots')
    .select('*')
    .eq('id', shootId)
    .maybeSingle()
  if (!shoot) return null

  const [reservations, { data: editorRows }, studioBlocks] = await Promise.all([
    buildShootReservations(adminClient, shoot),
    adminClient
      .from('equipment_shoot_editors')
      .select('id, user_id')
      .eq('shoot_id', shoot.id)
      .order('created_at'),
    studioBlocksByShoot(adminClient, [shoot.id]),
  ])
  const names = await nameMap(adminClient, [
    shoot.owner_id,
    ...(editorRows ?? []).map((e) => e.user_id),
  ])
  return {
    id: shoot.id,
    name: shoot.name,
    location: shoot.location,
    starts_at: shoot.starts_at,
    ends_at: shoot.ends_at,
    owner_id: shoot.owner_id,
    owner_name: names.get(shoot.owner_id) ?? 'Unknown',
    status: shoot.status,
    effective_status: effectiveShootStatus(shoot),
    reserved_count: reservations.length,
    picked_up_count: reservations.filter((r) => r.status === 'picked_up').length,
    conflict_count: reservations.filter((r) => r.conflict).length,
    notes: shoot.notes,
    studio_blocks: studioBlocks.get(shoot.id) ?? [],
    reservations,
    editors: (editorRows ?? []).map((e) => ({
      editor_row_id: e.id,
      user_id: e.user_id,
      full_name: names.get(e.user_id) ?? 'Unknown',
    })),
  }
}

/** Every reservable item with its availability against an arbitrary time
 *  window. Backs the wizard's gear step (no shoot exists yet) and, via
 *  getAvailabilityForShoot, the detail-page reservation picker. */
export async function getAvailabilityForWindow(
  startsAt: string,
  endsAt: string,
  excludeShootId?: string
): Promise<AvailabilityRow[]> {
  const items = await listEquipment()
  return items
    // Assigned devices are never reservable for shoots.
    .filter((i) => i.kind !== 'assigned' && i.status !== 'retired' && i.status !== 'lost')
    .map((item) => {
      const forThisShoot = excludeShootId
        ? item.active_reservations.some((r) => r.shoot_id === excludeShootId)
        : false
      const others = excludeShootId
        ? item.active_reservations.filter((r) => r.shoot_id !== excludeShootId)
        : item.active_reservations
      const conflict = computeConflict({
        itemStatus: item.status,
        dueAt: item.due_at,
        repairBackOn: item.repair_expected_back_on,
        shootStartsAt: startsAt,
        shootEndsAt: endsAt,
        otherReservations: others,
      })
      return {
        item_id: item.id,
        code: item.code,
        name: item.name,
        category: item.category,
        photo_url: item.photo_url,
        status: item.status,
        home_location_label: item.home_location_label,
        requires_approval: item.requires_approval,
        available: !conflict,
        conflict,
        already_reserved_for_shoot: forThisShoot,
      }
    })
}

/** Every item with its availability against a shoot's window, for the
 *  reservation picker. */
export async function getAvailabilityForShoot(shootId: string): Promise<AvailabilityRow[]> {
  const adminClient = createAdminClient()
  const { data: shoot } = await adminClient
    .from('equipment_shoots')
    .select('*')
    .eq('id', shootId)
    .maybeSingle()
  if (!shoot) return []
  return getAvailabilityForWindow(shoot.starts_at, shoot.ends_at, shootId)
}

// ============================================================
// Kits
// ============================================================

/** All kits with their member items, alphabetical. Availability against a
 *  window is derived client-side by joining member item_ids against
 *  getAvailabilityForWindow rows. */
export async function listKits(): Promise<KitRow[]> {
  const adminClient = createAdminClient()
  const [{ data: kits }, { data: members }] = await Promise.all([
    adminClient.from('equipment_kits').select('*').order('name'),
    adminClient.from('equipment_kit_items').select('*'),
  ])
  const kitList = kits ?? []
  if (kitList.length === 0) return []

  const itemIds = Array.from(new Set((members ?? []).map((m) => m.item_id)))
  const { data: items } = itemIds.length
    ? await adminClient
        .from('equipment_items')
        .select('id, code, name, category, status, requires_approval')
        .in('id', itemIds)
    : { data: [] as Pick<
        Tables<'equipment_items'>,
        'id' | 'code' | 'name' | 'category' | 'status' | 'requires_approval'
      >[] }
  const itemMap = new Map((items ?? []).map((i) => [i.id, i]))

  return kitList.map((kit) => ({
    id: kit.id,
    name: kit.name,
    notes: kit.notes,
    items: (members ?? [])
      .filter((m) => m.kit_id === kit.id)
      .flatMap((m) => {
        const item = itemMap.get(m.item_id)
        if (!item) return []
        return [
          {
            item_id: item.id,
            code: item.code,
            name: item.name,
            category: item.category,
            status: item.status,
            requires_approval: item.requires_approval,
          },
        ]
      }),
  }))
}

// ============================================================
// Reservation approvals
// ============================================================

/** Pending flagged-item requests for the Tech Console queue, oldest first. */
export async function listPendingApprovals(): Promise<PendingApprovalRow[]> {
  const adminClient = createAdminClient()
  const { data: reservations } = await adminClient
    .from('equipment_reservations')
    .select('*')
    .eq('status', 'pending')
    .order('created_at')
  const list = reservations ?? []
  if (list.length === 0) return []

  const itemIds = Array.from(new Set(list.map((r) => r.item_id)))
  const shootIds = Array.from(new Set(list.map((r) => r.shoot_id)))
  const [{ data: items }, { data: shoots }, names] = await Promise.all([
    adminClient
      .from('equipment_items')
      .select('id, code, name, category, photo_url')
      .in('id', itemIds),
    adminClient
      .from('equipment_shoots')
      .select('id, name, starts_at, ends_at, status')
      .in('id', shootIds),
    nameMap(adminClient, list.map((r) => r.reserved_by)),
  ])
  const itemMap = new Map((items ?? []).map((i) => [i.id, i]))
  const shootMap = new Map((shoots ?? []).map((s) => [s.id, s]))

  return list.flatMap((r) => {
    const item = itemMap.get(r.item_id)
    const shoot = shootMap.get(r.shoot_id)
    // A cancelled/done shoot's pending requests are moot; hide them (the
    // sweep or shoot cancellation resolves the rows themselves).
    if (!item || !shoot || shoot.status === 'cancelled' || shoot.status === 'done') return []
    return [
      {
        reservation_id: r.id,
        created_at: r.created_at,
        reserved_by: r.reserved_by,
        reserved_by_name: names.get(r.reserved_by) ?? 'Unknown',
        item: {
          id: item.id,
          code: item.code,
          name: item.name,
          category: item.category,
          photo_url: item.photo_url,
        },
        shoot: {
          id: shoot.id,
          name: shoot.name,
          starts_at: shoot.starts_at,
          ends_at: shoot.ends_at,
        },
      },
    ]
  })
}

// ============================================================
// Tech Console
// ============================================================

export async function getTechConsoleData(): Promise<TechConsoleData> {
  const adminClient = createAdminClient()
  const now = new Date()

  const [items, { all: openCheckouts }, { data: openRepairs }, { data: openIssues }] =
    await Promise.all([
      listEquipment(),
      openCheckoutsByItem(),
      adminClient
        .from('equipment_repairs')
        .select('*')
        .order('sent_at', { ascending: false })
        .limit(50),
      adminClient
        .from('equipment_issues')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50),
    ])

  const itemById = new Map(items.map((i) => [i.id, i]))
  const repairList = openRepairs ?? []
  const issueList = openIssues ?? []

  const names = await nameMap(adminClient, [
    ...repairList.map((r) => r.sent_by),
    ...issueList.map((i) => i.reported_by),
  ])

  // Recent activity feed (last 25 events across checkouts, repairs, issues)
  const { data: recentCheckouts } = await adminClient
    .from('equipment_checkouts')
    .select('*')
    .order('checked_out_at', { ascending: false })
    .limit(30)
  const activityNames = await nameMap(
    adminClient,
    (recentCheckouts ?? []).map((c) => c.holder_id)
  )
  const activity: ActivityEvent[] = []
  const pushActivity = (
    at: string,
    kind: ActivityEvent['kind'],
    itemId: string,
    actorName: string,
    detail: string
  ) => {
    const item = itemById.get(itemId)
    if (!item) return
    activity.push({
      at,
      kind,
      item_id: itemId,
      item_name: item.name,
      item_code: item.code,
      actor_name: actorName,
      detail,
    })
  }
  for (const c of recentCheckouts ?? []) {
    const actor = activityNames.get(c.holder_id) ?? 'Unknown'
    pushActivity(
      c.checked_out_at,
      c.transferred_from_checkout_id ? 'transfer' : 'checkout',
      c.item_id,
      actor,
      c.transferred_from_checkout_id
        ? 'took over the item'
        : c.due_at
          ? `checked out, due ${formatDayTime(c.due_at)}`
          : 'borrowed the device'
    )
    if (c.returned_at) pushActivity(c.returned_at, 'return', c.item_id, actor, 'checked in')
  }
  for (const r of repairList) {
    const actor = names.get(r.sent_by) ?? 'Unknown'
    pushActivity(r.sent_at, 'repair_sent', r.item_id, actor, 'sent for repair')
    if (r.returned_at) pushActivity(r.returned_at, 'repair_back', r.item_id, actor, 'back from repair')
  }
  for (const i of issueList) {
    const actor = names.get(i.reported_by) ?? 'Unknown'
    pushActivity(i.created_at, 'issue_open', i.item_id, actor, `reported: ${i.note}`)
    if (i.resolved_at) pushActivity(i.resolved_at, 'issue_resolved', i.item_id, actor, 'issue resolved')
  }
  activity.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  // Locations with item counts
  const { data: locations } = await adminClient
    .from('equipment_locations')
    .select('*')
    .order('label')
  const locationRows = (locations ?? []).map((l) => ({
    ...l,
    item_count: items.filter((i) => i.home_location_id === l.id).length,
  }))

  // Studios with upcoming booking counts
  const [{ data: studioRows }, { data: upcomingBlocks }] = await Promise.all([
    adminClient.from('equipment_studios').select('*').order('name'),
    adminClient
      .from('equipment_studio_blocks')
      .select('studio_id')
      .gte('ends_at', new Date().toISOString()),
  ])
  const studios = (studioRows ?? []).map((s) => ({
    ...s,
    upcoming_blocks: (upcomingBlocks ?? []).filter((b) => b.studio_id === s.id).length,
  }))

  // Purchase data for the console (page is capability-gated)
  const { data: privateRows } = await adminClient.from('equipment_private').select('*')
  const privateByItem: Record<string, Tables<'equipment_private'>> = {}
  for (const p of privateRows ?? []) privateByItem[p.item_id] = p

  return {
    stats: {
      items: items.filter(
        (i) => i.kind === 'pooled' && i.status !== 'retired' && i.status !== 'lost'
      ).length,
      out_now: openCheckouts.length,
      overdue: openCheckouts.filter((c) => c.due_at && new Date(c.due_at) < now).length,
      in_repair: items.filter((i) => i.status === 'in_repair').length,
      open_issues: issueList.filter((i) => i.status === 'open').length,
    },
    repairs: repairList.map((r) => ({
      ...r,
      item_name: itemById.get(r.item_id)?.name ?? 'Unknown item',
      item_code: itemById.get(r.item_id)?.code ?? '',
      sent_by_name: names.get(r.sent_by) ?? 'Unknown',
    })),
    issues: issueList.map((i) => ({
      ...i,
      item_name: itemById.get(i.item_id)?.name ?? 'Unknown item',
      item_code: itemById.get(i.item_id)?.code ?? '',
      reported_by_name: names.get(i.reported_by) ?? 'Unknown',
    })),
    activity: activity.slice(0, 25),
    locations: locationRows,
    studios,
    privateByItem,
  }
}

export async function listLockupLocations(): Promise<Tables<'equipment_locations'>[]> {
  const adminClient = createAdminClient()
  const { data } = await adminClient.from('equipment_locations').select('*').order('label')
  return data ?? []
}

export async function listStudios(): Promise<Tables<'equipment_studios'>[]> {
  const adminClient = createAdminClient()
  const { data } = await adminClient.from('equipment_studios').select('*').order('name')
  return data ?? []
}

/** Upcoming studio bookings (running or future), for the schedule view on the
 *  shoots tab. Cancelled shoots free their studio (blocks are deleted), so no
 *  filtering is needed here beyond time. */
export async function getStudioSchedule(): Promise<StudioScheduleEntry[]> {
  const adminClient = createAdminClient()
  const [{ data: blocks }, studios] = await Promise.all([
    adminClient
      .from('equipment_studio_blocks')
      .select('*')
      .gte('ends_at', new Date().toISOString())
      .order('starts_at')
      .limit(60),
    studioMap(),
  ])
  const list = blocks ?? []
  if (list.length === 0) return []

  const shootIds = Array.from(
    new Set(list.flatMap((b) => (b.shoot_id ? [b.shoot_id] : [])))
  )
  const [{ data: shoots }, bookerNames] = await Promise.all([
    shootIds.length
      ? adminClient.from('equipment_shoots').select('id, name').in('id', shootIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    nameMap(adminClient, list.map((b) => b.created_by)),
  ])
  const shootNames = new Map((shoots ?? []).map((s) => [s.id, s.name]))

  return list.map((b) => ({
    id: b.id,
    studio_id: b.studio_id,
    studio_name: studios.get(b.studio_id) ?? 'Studio',
    starts_at: b.starts_at,
    ends_at: b.ends_at,
    shoot_id: b.shoot_id,
    // A standalone hold shows its own title; a shoot block shows the shoot.
    shoot_name: b.shoot_id
      ? shootNames.get(b.shoot_id) ?? 'A shoot'
      : b.title?.trim() || 'Studio hold',
    created_by: b.created_by,
    created_by_name: bookerNames.get(b.created_by) ?? 'Someone',
  }))
}

/** Studio bookings inside a window (default: last 7 days to +60 days), for
 *  the wizard's week grid. Wide on purpose so the client can flip weeks
 *  without refetching. */
export async function getStudioBlocksRange(
  fromIso?: string,
  toIso?: string
): Promise<StudioScheduleEntry[]> {
  const adminClient = createAdminClient()
  const from = fromIso ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const to = toIso ?? new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
  const [{ data: blocks }, studios] = await Promise.all([
    adminClient
      .from('equipment_studio_blocks')
      .select('*')
      .lt('starts_at', to)
      .gt('ends_at', from)
      .order('starts_at'),
    studioMap(),
  ])
  const list = blocks ?? []
  if (list.length === 0) return []

  const shootIds = Array.from(
    new Set(list.flatMap((b) => (b.shoot_id ? [b.shoot_id] : [])))
  )
  const [{ data: shoots }, bookerNames] = await Promise.all([
    shootIds.length
      ? adminClient.from('equipment_shoots').select('id, name').in('id', shootIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    nameMap(adminClient, list.map((b) => b.created_by)),
  ])
  const shootNames = new Map((shoots ?? []).map((s) => [s.id, s.name]))

  return list.map((b) => ({
    id: b.id,
    studio_id: b.studio_id,
    studio_name: studios.get(b.studio_id) ?? 'Studio',
    starts_at: b.starts_at,
    ends_at: b.ends_at,
    shoot_id: b.shoot_id,
    // A standalone hold shows its own title; a shoot block shows the shoot.
    shoot_name: b.shoot_id
      ? shootNames.get(b.shoot_id) ?? 'A shoot'
      : b.title?.trim() || 'Studio hold',
    created_by: b.created_by,
    created_by_name: bookerNames.get(b.created_by) ?? 'Someone',
  }))
}

/** Small helper for nav/dashboard badges. */
export async function countMyOpenCheckouts(userId: string): Promise<number> {
  const adminClient = createAdminClient()
  const { count } = await adminClient
    .from('equipment_checkouts')
    .select('id', { count: 'exact', head: true })
    .eq('holder_id', userId)
    .is('returned_at', null)
  return count ?? 0
}

/** Lockup Slack feature toggles for the Tech Console Slack tab. */
export async function getLockupSettings(): Promise<LockupSlackSettings> {
  const admin = createAdminClient()
  return getLockupSlackSettings(admin)
}

// ============================================================
// Item profile page (/lockup/items/[code])
// ============================================================

export type ItemUpcomingEvent = {
  at: string
  ends_at: string | null
  kind: 'reservation' | 'repair_due' | 'due_back'
  text: string
  sub: string | null
}

/** One day the item is spoken for, for the month grid. */
export type ItemDayState = { day: string; state: 'busy' | 'repair' }

export type ItemProfile = {
  item: EquipmentItemRow
  /** Whoever physically has it right now, with enough to contact them. */
  holder: {
    id: string
    full_name: string
    email: string | null
    slack_user_id: string | null
  } | null
  /** The shoot the current checkout belongs to, when it has one. */
  holder_shoot: { id: string; name: string; location: string | null } | null
  kits: { id: string; name: string }[]
  history: ItemHistoryEvent[]
  upcoming: ItemUpcomingEvent[]
  /** Days in the next ~8 weeks that are already spoken for. */
  days: ItemDayState[]
}

function istDayKey(iso: string | Date): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

/** Every IST day touched by [start, end], inclusive. */
function daySpan(startIso: string, endIso: string): string[] {
  const out: string[] = []
  const end = istDayKey(endIso)
  const cursor = new Date(`${istDayKey(startIso)}T00:00:00Z`)
  for (let i = 0; i < 120; i++) {
    const key = cursor.toISOString().slice(0, 10)
    out.push(key)
    if (key >= end) break
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return out
}

/**
 * Everything the item page shows: the live answer (free / who has it / when it
 * frees up), how to reach that person, what is coming, and the trail behind it.
 */
export async function getItemProfile(code: string): Promise<ItemProfile | null> {
  const item = await getItemByCode(code)
  if (!item) return null

  const adminClient = createAdminClient()
  const [
    { data: openCheckout },
    { data: reservations },
    { data: openRepair },
    { data: kitRows },
    history,
  ] = await Promise.all([
    adminClient
      .from('equipment_checkouts')
      .select('*')
      .eq('item_id', item.id)
      .is('returned_at', null)
      .maybeSingle(),
    adminClient
      .from('equipment_reservations')
      .select('*')
      .eq('item_id', item.id)
      .in('status', ['active', 'pending'] as unknown as ('active' | 'pending')[]),
    adminClient
      .from('equipment_repairs')
      .select('*')
      .eq('item_id', item.id)
      .is('returned_at', null)
      .maybeSingle(),
    adminClient.from('equipment_kit_items').select('kit_id').eq('item_id', item.id),
    getItemHistory(item.id, 40),
  ])

  // Holder + the shoot their checkout belongs to
  let holder: ItemProfile['holder'] = null
  let holderShoot: ItemProfile['holder_shoot'] = null
  if (openCheckout) {
    const { data: person } = await adminClient
      .from('users')
      .select('id, full_name, email, slack_user_id')
      .eq('id', openCheckout.holder_id)
      .maybeSingle()
    if (person) holder = person
    if (openCheckout.shoot_id) {
      const { data: shoot } = await adminClient
        .from('equipment_shoots')
        .select('id, name, location')
        .eq('id', openCheckout.shoot_id)
        .maybeSingle()
      if (shoot) holderShoot = shoot
    }
  }

  // Kits this item belongs to
  const kitIds = Array.from(new Set((kitRows ?? []).map((k) => k.kit_id)))
  const { data: kits } = kitIds.length
    ? await adminClient.from('equipment_kits').select('id, name').in('id', kitIds)
    : { data: [] as { id: string; name: string }[] }

  // Upcoming: reservations (with their shoot window), the open repair, the due date
  const shootIds = Array.from(new Set((reservations ?? []).map((r) => r.shoot_id)))
  const { data: shoots } = shootIds.length
    ? await adminClient
        .from('equipment_shoots')
        .select('id, name, starts_at, ends_at, status, owner_id')
        .in('id', shootIds)
    : { data: [] as Pick<Tables<'equipment_shoots'>, 'id' | 'name' | 'starts_at' | 'ends_at' | 'status' | 'owner_id'>[] }
  const shootById = new Map((shoots ?? []).map((s) => [s.id, s]))
  const ownerNames = await nameMap(adminClient, (shoots ?? []).map((s) => s.owner_id))

  const upcoming: ItemUpcomingEvent[] = []
  const days: ItemDayState[] = []

  if (openCheckout?.due_at) {
    upcoming.push({
      at: openCheckout.due_at,
      ends_at: null,
      kind: 'due_back',
      text: 'Due back',
      sub: holder ? `from ${holder.full_name}` : null,
    })
    for (const day of daySpan(openCheckout.checked_out_at, openCheckout.due_at)) {
      days.push({ day, state: 'busy' })
    }
  }

  for (const r of reservations ?? []) {
    const shoot = shootById.get(r.shoot_id)
    if (!shoot || shoot.status === 'cancelled' || shoot.status === 'done') continue
    upcoming.push({
      at: shoot.starts_at,
      ends_at: shoot.ends_at,
      kind: 'reservation',
      text: shoot.name,
      sub: `${r.status === 'pending' ? 'awaiting approval · ' : ''}${ownerNames.get(shoot.owner_id) ?? 'someone'}`,
    })
    for (const day of daySpan(shoot.starts_at, shoot.ends_at)) days.push({ day, state: 'busy' })
  }

  if (openRepair) {
    upcoming.push({
      at: openRepair.expected_back_on ?? openRepair.sent_at,
      ends_at: null,
      kind: 'repair_due',
      text: openRepair.expected_back_on ? 'Expected back from repair' : 'In repair, no date yet',
      sub: openRepair.vendor,
    })
    const until = openRepair.expected_back_on
      ? `${openRepair.expected_back_on}T23:59:00+05:30`
      : new Date(Date.now() + 14 * 86400000).toISOString()
    for (const day of daySpan(openRepair.sent_at, until)) days.push({ day, state: 'repair' })
  }

  upcoming.sort((a, b) => a.at.localeCompare(b.at))

  return {
    item,
    holder,
    holder_shoot: holderShoot,
    kits: kits ?? [],
    history,
    upcoming,
    days,
  }
}
