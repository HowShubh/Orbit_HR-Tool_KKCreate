'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, ExternalLink, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Tables } from '@/lib/supabase/database.types'
import type { EquipmentItemRow } from '@/lib/queries/lockup'
import { EQUIPMENT_CATEGORIES, STATUS_LABELS } from '@/lib/lockup/constants'
import { CategoryIcon, CodeChip, StatusBadge, itemStatusLine } from './item-bits'
import { QrActionCard } from './qr-action-card'

/**
 * Employee-facing gear browser, per the reference UX: search + three filters,
 * rows with icon, name, code chip, live status line, status badge, chevron.
 * Tapping a row opens the item INSTANTLY in an in-page sheet (the data is
 * already in the browser; no navigation, no server wait).
 */
export function InventoryBrowser({
  items,
  locations,
  currentUserId,
  canManageEquipment,
}: {
  items: EquipmentItemRow[]
  locations: Tables<'equipment_locations'>[]
  currentUserId: string
  canManageEquipment: boolean
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [location, setLocation] = useState('all')
  const [status, setStatus] = useState('all')
  const [openItemId, setOpenItemId] = useState<string | null>(null)

  // Derive from props so the sheet live-updates after an action refreshes the
  // server data (check out inside the sheet → status flips without closing).
  const openItem = openItemId ? items.find((i) => i.id === openItemId) ?? null : null

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((item) => {
      // Assigned devices live in their own Devices tab.
      if (item.kind === 'assigned') return false
      if (item.status === 'retired' || item.status === 'lost') {
        if (status !== item.status) return false
      }
      if (category !== 'all' && item.category !== category) return false
      if (location !== 'all' && item.home_location_id !== location) return false
      if (status !== 'all' && item.status !== status) return false
      if (!q) return true
      return (
        item.name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        (item.serial_number ?? '').toLowerCase().includes(q) ||
        (item.brand_model ?? '').toLowerCase().includes(q) ||
        (item.holder_name ?? '').toLowerCase().includes(q)
      )
    })
  }, [items, query, category, location, status])

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, code, serial, holder..."
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full sm:w-[150px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All category</SelectItem>
              {EQUIPMENT_CATEGORIES.map((c) => (
                <SelectItem key={c.key} value={c.key}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={location} onValueChange={setLocation}>
            <SelectTrigger className="w-full sm:w-[130px]">
              <SelectValue placeholder="Location" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All location</SelectItem>
              {locations.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              {(['available', 'checked_out', 'in_repair', 'retired', 'lost'] as const).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="text-[12.5px] text-muted-foreground">
        {filtered.length} item{filtered.length === 1 ? '' : 's'}
      </div>

      {/* Rows */}
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
                  {item.active_reservations.length > 0 &&
                    ` · reserved for ${item.active_reservations[0].shoot_name}`}
                </div>
              </div>
              <StatusBadge status={item.status} />
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="rounded-xl border border-dashed border-border px-5 py-10 text-center text-[13px] text-muted-foreground">
            No gear matches these filters.
          </li>
        )}
      </ul>

      {/* Instant item sheet: same card as the QR page, zero navigation */}
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
                knownItems={items}
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
