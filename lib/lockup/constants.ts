import type { Tables } from '@/lib/supabase/database.types'

export type EquipmentCategory = Tables<'equipment_items'>['category']
export type EquipmentStatus = Tables<'equipment_items'>['status']
export type ShootStatus = Tables<'equipment_shoots'>['status']

export const EQUIPMENT_CATEGORIES: { key: EquipmentCategory; label: string }[] = [
  { key: 'camera', label: 'Camera' },
  { key: 'lens', label: 'Lens' },
  { key: 'light', label: 'Light' },
  { key: 'audio', label: 'Audio' },
  { key: 'grip', label: 'Grip' },
  { key: 'drone', label: 'Drone' },
  { key: 'battery', label: 'Battery' },
  { key: 'storage', label: 'Storage' },
  { key: 'computer', label: 'Computer' },
  { key: 'cable_adapter', label: 'Cable / Adapter' },
  { key: 'accessory', label: 'Accessory' },
  { key: 'other', label: 'Other' },
]

export const CATEGORY_LABELS: Record<EquipmentCategory, string> = Object.fromEntries(
  EQUIPMENT_CATEGORIES.map((c) => [c.key, c.label])
) as Record<EquipmentCategory, string>

export const STATUS_LABELS: Record<EquipmentStatus, string> = {
  available: 'Available',
  checked_out: 'Checked out',
  in_repair: 'In repair',
  retired: 'Retired',
  lost: 'Lost',
}

export const SHOOT_STATUS_LABELS: Record<ShootStatus, string> = {
  planned: 'Planned',
  active: 'Active',
  done: 'Done',
  cancelled: 'Cancelled',
}

/** The product name. Shown in nav, Slack messages and the standalone site. */
export const LOCKUP_NAME = 'Lockup'
