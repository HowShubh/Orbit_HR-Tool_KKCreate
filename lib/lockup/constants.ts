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

/**
 * Vision models offered for photo-to-inventory extraction, reached through
 * OpenRouter (one OPENROUTER_API_KEY, many providers). Slugs are OpenRouter's
 * and can be swapped for whatever it currently offers without touching the
 * flow. The list is shared by the picker UI and the server-side allow-list.
 */
/**
 * Kept to a single model on purpose: GLM 5.3 Flash reads gear photos reliably
 * and cheaply, and it was the one that held up in real use. The list stays an
 * array so another model is a one-line addition, and the picker in the dialog
 * reappears automatically as soon as there is more than one to choose from.
 */
export const AI_EXTRACT_MODELS = [
  { id: 'z-ai/glm-5.3-flash', label: 'GLM 5.3 Flash · Z.ai' },
] as const

export type AiExtractModelId = (typeof AI_EXTRACT_MODELS)[number]['id']
