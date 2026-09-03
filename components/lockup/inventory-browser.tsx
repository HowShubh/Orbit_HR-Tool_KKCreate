'use client'

import { useMemo } from 'react'
import type { EquipmentItemRow, KitRow, ShootSummary } from '@/lib/queries/lockup'
import { useCart } from '@/lib/lockup/cart'
import { GearPicker, type PickerKit, type PickerRow } from './gear-picker'
import { CartPanel } from './cart-panel'
import { fmtDay } from './item-bits'

/** Browsing Lockup's gear. Same picker the shoot wizard uses; the difference
 *  is only what sits in the right panel and what "selected" means. */
export function InventoryBrowser({
  items,
  kits,
  shoots,
  currentUserId,
  myOverdue,
}: {
  items: EquipmentItemRow[]
  kits: KitRow[]
  shoots: ShootSummary[]
  currentUserId: string
  myOverdue?: { item_name: string; days_late: number }[]
}) {
  const cart = useCart()

  const rows = useMemo<PickerRow[]>(
    () =>
      items
        .filter((i) => i.kind !== 'assigned' && i.status !== 'retired' && i.status !== 'lost')
        .map((item) => {
          const free = item.status === 'available'
          const status = free
            ? {
                statusText: `Free · ${item.current_location_label ?? item.home_location_label ?? 'shelf'}`,
                statusTone: 'free' as const,
              }
            : item.status === 'in_repair'
              ? {
                  statusText: item.repair_expected_back_on
                    ? `Repair til ${fmtDay(item.repair_expected_back_on)}`
                    : 'In repair',
                  statusTone: 'warn' as const,
                }
              : {
                  statusText: item.due_at ? `Out til ${fmtDay(item.due_at)}` : 'Out now',
                  statusTone: 'blocked' as const,
                }
          return {
            id: item.id,
            code: item.code,
            name: item.name,
            category: item.category,
            photo_url: item.photo_url,
            subtitle: item.brand_model,
            requires_approval: item.requires_approval,
            selectable: free,
            href: `/lockup/items/${item.code}`,
            ...status,
          }
        }),
    [items]
  )

  const pickerKits = useMemo<PickerKit[]>(() => {
    const byId = new Map(items.map((i) => [i.id, i]))
    return kits.map((kit) => ({
      id: kit.id,
      name: kit.name,
      total: kit.items.length,
      addableIds: kit.items
        .filter((m) => (byId.get(m.item_id)?.status ?? m.status) === 'available')
        .map((m) => m.item_id),
      // Live status wins over the snapshot stored on the kit row, so an
      // expanded kit shows what is actually free right now.
      members: kit.items.map((m) => {
        const live = byId.get(m.item_id)
        return {
          id: m.item_id,
          name: m.name,
          code: m.code,
          category: m.category,
          free: (live?.status ?? m.status) === 'available',
          holderName: live?.holder_name ?? null,
        }
      }),
    }))
  }, [kits, items])

  return (
    <GearPicker
      rows={rows}
      kits={pickerKits}
      selectedIds={cart.ids}
      onToggle={(id) => cart.toggle(id)}
      onAddMany={(ids) => cart.add(ids)}
      asideTitle="Selected"
      asideCount={cart.count}
      aside={
        <CartPanel
          items={items}
          shoots={shoots}
          currentUserId={currentUserId}
          myOverdue={myOverdue}
        />
      }
    />
  )
}
