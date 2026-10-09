'use client'

import { useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import type { AvailabilityRow, KitRow } from '@/lib/queries/lockup'
import type { EquipmentCategory } from '@/lib/lockup/constants'
import { GearPicker, type PickerKit, type PickerRow } from '../gear-picker'

export type GearGroup = {
  key: string
  name: string
  category: EquipmentCategory
  requires_approval: boolean
  units: AvailabilityRow[]
}

/** A row can be reserved unless it is hard-blocked. A double reservation is a
 *  warning, not a wall: the shoot may still want it. */
export function isAddable(r: AvailabilityRow): boolean {
  return !r.conflict || r.conflict.kind === 'double_reserved'
}

/** Units of the same model, grouped for the "Rode ×2" summary in the rail. */
export function groupGear(rows: AvailabilityRow[]): GearGroup[] {
  const byKey = new Map<string, AvailabilityRow[]>()
  for (const r of rows) {
    const key = `${r.name}::${r.category}`
    byKey.set(key, [...(byKey.get(key) ?? []), r])
  }
  return Array.from(byKey.entries())
    .map(([key, units]) => ({
      key,
      name: units[0].name,
      category: units[0].category,
      requires_approval: units.some((u) => u.requires_approval),
      units,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Step 3 of the wizard. Deliberately the SAME picker as browsing Lockup — only
 * the status wording differs, because here availability is judged against the
 * shoot's window rather than right now.
 */
export function StepGear({
  availability,
  loading,
  kits,
  selectedIds,
  onToggle,
  onAddMany,
  aside,
  asideCount,
  footer,
}: {
  availability: AvailabilityRow[] | null
  loading: boolean
  kits: KitRow[]
  selectedIds: string[]
  onToggle: (itemId: string) => void
  onAddMany: (itemIds: string[]) => void
  aside: React.ReactNode
  asideCount: number
  footer?: React.ReactNode
}) {
  const availabilityRows = useMemo(() => availability ?? [], [availability])

  const rows = useMemo<PickerRow[]>(
    () =>
      availabilityRows.map((r) => {
        const addable = isAddable(r)
        return {
          id: r.item_id,
          code: r.code,
          name: r.name,
          category: r.category,
          photo_url: r.photo_url,
          subtitle: r.home_location_label ? `shelf ${r.home_location_label}` : null,
          requires_approval: r.requires_approval,
          selectable: addable,
          statusText: r.conflict ? r.conflict.short : 'Free for your window',
          statusTone: !r.conflict ? 'free' : addable ? 'warn' : 'blocked',
        }
      }),
    [availabilityRows]
  )

  const pickerKits = useMemo<PickerKit[]>(() => {
    const byId = new Map(availabilityRows.map((r) => [r.item_id, r]))
    return kits.map((kit) => ({
      id: kit.id,
      name: kit.name,
      total: kit.items.length,
      addableIds: kit.items.flatMap((m) => {
        const row = byId.get(m.item_id)
        return row && isAddable(row) ? [m.item_id] : []
      }),
      members: kit.items.map((m) => {
        const row = byId.get(m.item_id)
        return {
          id: m.item_id,
          name: m.name,
          code: m.code,
          category: m.category,
          free: Boolean(row && isAddable(row)),
          holderName: null,
        }
      }),
    }))
  }, [kits, availabilityRows])

  if (loading && availability === null) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border px-5 py-14 text-[13px] text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking what is free for your window…
      </div>
    )
  }

  return (
    <GearPicker
      rows={rows}
      kits={pickerKits}
      selectedIds={selectedIds}
      onToggle={onToggle}
      onAddMany={onAddMany}
      asideTitle="Selected"
      asideCount={asideCount}
      aside={aside}
      footer={footer}
    />
  )
}
