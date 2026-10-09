'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, ExternalLink, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import type { Tables } from '@/lib/supabase/database.types'
import type { EquipmentItemRow } from '@/lib/queries/lockup'
import { AssignedChip, CategoryIcon, CodeChip, itemStatusLine } from './item-bits'
import { QrActionCard } from './qr-action-card'

/**
 * Org-wide catalog of assigned devices (laptops, phones, SSDs). Anyone can see
 * who holds what. Tapping a row opens the same instant item sheet as the gear
 * list. Assignment/borrow actions live on that card.
 */
export function DevicesBrowser({
  devices,
  locations,
  currentUserId,
  canManageEquipment,
  people,
}: {
  devices: EquipmentItemRow[]
  locations: Tables<'equipment_locations'>[]
  currentUserId: string
  canManageEquipment: boolean
  people: { id: string; full_name: string }[]
}) {
  const [query, setQuery] = useState('')
  const [openItemId, setOpenItemId] = useState<string | null>(null)
  const openItem = openItemId ? devices.find((i) => i.id === openItemId) ?? null : null

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return devices
    return devices.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.code.toLowerCase().includes(q) ||
        (i.brand_model ?? '').toLowerCase().includes(q) ||
        (i.serial_number ?? '').toLowerCase().includes(q) ||
        (i.assignee_name ?? '').toLowerCase().includes(q) ||
        (i.holder_name ?? '').toLowerCase().includes(q)
    )
  }, [devices, query])

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search devices, owner, holder..."
          className="pl-9"
        />
      </div>

      <div className="text-[12.5px] text-muted-foreground">
        {filtered.length} device{filtered.length === 1 ? '' : 's'}
      </div>

      <ul className="space-y-2">
        {filtered.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => setOpenItemId(item.id)}
              className="flex w-full items-center gap-3.5 rounded-xl border border-border bg-card px-3.5 py-3 text-left transition-colors hover:bg-accent/50"
            >
              <CategoryIcon category={item.category} photoUrl={item.photo_url} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[14.5px] font-semibold">{item.name}</span>
                  <CodeChip code={item.code} />
                </div>
                <div className="truncate text-[12.5px] text-muted-foreground">
                  {itemStatusLine(item)}
                </div>
              </div>
              <AssignedChip />
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="rounded-xl border border-dashed border-border px-5 py-10 text-center text-[13px] text-muted-foreground">
            {devices.length === 0
              ? 'No assigned devices yet. The tech lead adds them in the Tech Console.'
              : 'No devices match this search.'}
          </li>
        )}
      </ul>

      <Dialog open={openItem !== null} onOpenChange={(o) => !o && setOpenItemId(null)}>
        <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
          {openItem && (
            <>
              <DialogTitle className="sr-only">{openItem.name}</DialogTitle>
              <QrActionCard
                item={openItem}
                locations={locations}
                currentUserId={currentUserId}
                requireScan={!canManageEquipment}
                canManageEquipment={canManageEquipment}
                assignPeople={people}
                knownItems={devices}
              />
              <Link
                href={`/e/${openItem.code}?src=app`}
                className="flex items-center justify-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" /> Open full page
              </Link>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
