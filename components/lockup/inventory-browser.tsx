'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Boxes, ChevronRight, ExternalLink, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import type { Tables } from '@/lib/supabase/database.types'
import type { EquipmentItemRow, KitRow } from '@/lib/queries/lockup'
import { EQUIPMENT_CATEGORIES, type EquipmentCategory } from '@/lib/lockup/constants'
import { cn } from '@/lib/utils'
import { CategoryIcon, CodeChip, StatusBadge, itemStatusLine } from './item-bits'
import { KitTakeDialog } from './kit-take-dialog'
import { QrActionCard } from './qr-action-card'

/**
 * The "Get equipment" browser: one search box, category chips, kits with
 * one-tap checkout, then the flat gear list. Tapping a row opens the item
 * INSTANTLY in an in-page sheet (the data is already in the browser).
 */
export function InventoryBrowser({
  items,
  kits,
  locations,
  currentUserId,
  canManageEquipment,
}: {
  items: EquipmentItemRow[]
  kits: KitRow[]
  locations: Tables<'equipment_locations'>[]
  currentUserId: string
  canManageEquipment: boolean
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<'all' | EquipmentCategory>('all')
  const [availableOnly, setAvailableOnly] = useState(false)
  const [openItemId, setOpenItemId] = useState<string | null>(null)
  const [openKitId, setOpenKitId] = useState<string | null>(null)

  // Derive from props so sheets live-update after an action refreshes data.
  const openItem = openItemId ? items.find((i) => i.id === openItemId) ?? null : null
  const openKit = openKitId ? kits.find((k) => k.id === openKitId) ?? null : null

  // Only surface categories that actually have gear, so the chip row stays short.
  const usedCategories = useMemo(() => {
    const used = new Set(items.filter((i) => i.kind !== 'assigned').map((i) => i.category))
    return EQUIPMENT_CATEGORIES.filter((c) => used.has(c.key))
  }, [items])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((item) => {
      // Assigned devices live in their own Devices tab; dead stock stays in Tech.
      if (item.kind === 'assigned') return false
      if (item.status === 'retired' || item.status === 'lost') return false
      if (category !== 'all' && item.category !== category) return false
      if (availableOnly && item.status !== 'available') return false
      if (!q) return true
      return (
        item.name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        (item.serial_number ?? '').toLowerCase().includes(q) ||
        (item.brand_model ?? '').toLowerCase().includes(q) ||
        (item.holder_name ?? '').toLowerCase().includes(q)
      )
    })
  }, [items, query, category, availableOnly])

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const kitCards = kits.map((kit) => {
    const availableCount = kit.items.filter(
      (m) => (itemById.get(m.item_id)?.status ?? m.status) === 'available'
    ).length
    return { kit, availableCount }
  })
  const matchedKits = query.trim()
    ? kitCards.filter(({ kit }) => kit.name.toLowerCase().includes(query.trim().toLowerCase()))
    : kitCards

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search gear, kits, codes, people..."
          className="pl-9"
        />
      </div>

      {/* Category chips */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-0.5">
        <FilterChip active={category === 'all'} onClick={() => setCategory('all')}>
          All
        </FilterChip>
        {usedCategories.map((c) => (
          <FilterChip
            key={c.key}
            active={category === c.key}
            onClick={() => setCategory(category === c.key ? 'all' : c.key)}
          >
            {c.label}
          </FilterChip>
        ))}
        <FilterChip
          active={availableOnly}
          dashed
          onClick={() => setAvailableOnly((v) => !v)}
          className="ml-auto"
        >
          Available only
        </FilterChip>
      </div>

      {/* Kits */}
      {matchedKits.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-baseline gap-2 px-0.5">
            <span className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
              Kits
            </span>
            <span className="text-[12px] text-muted-foreground/70">
              grab a whole setup in one tap
            </span>
          </div>
          <div className="no-scrollbar flex gap-2.5 overflow-x-auto pb-0.5">
            {matchedKits.map(({ kit, availableCount }) => (
              <div
                key={kit.id}
                className="flex w-[220px] shrink-0 flex-col gap-2.5 rounded-2xl border border-border bg-card p-3.5"
              >
                <div className="flex items-center gap-2.5">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10">
                    <Boxes className="h-4 w-4 text-primary" />
                  </div>
                  <span className="truncate text-[14px] font-bold">{kit.name}</span>
                </div>
                <span
                  className={cn(
                    'text-[12px]',
                    availableCount === kit.items.length
                      ? 'text-emerald-700'
                      : availableCount > 0
                        ? 'text-amber-700'
                        : 'text-muted-foreground'
                  )}
                >
                  {kit.items.length} item{kit.items.length === 1 ? '' : 's'} ·{' '}
                  {availableCount === kit.items.length
                    ? 'all available'
                    : `${availableCount} available`}
                </span>
                <button
                  type="button"
                  disabled={availableCount === 0}
                  onClick={() => setOpenKitId(kit.id)}
                  className={cn(
                    'rounded-lg py-2 text-[13px] font-semibold transition-colors',
                    availableCount === kit.items.length
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : availableCount > 0
                        ? 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                        : 'cursor-not-allowed bg-muted text-muted-foreground'
                  )}
                >
                  {availableCount === 0
                    ? 'Nothing available'
                    : availableCount === kit.items.length
                      ? 'Take kit'
                      : `Take ${availableCount} available`}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All gear */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between px-0.5">
          <span className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
            All gear
          </span>
          <span className="text-[12px] text-muted-foreground/70">
            {filtered.length} item{filtered.length === 1 ? '' : 's'}
          </span>
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
                    {item.requires_approval && (
                      <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-px text-[10px] font-semibold text-amber-700">
                        approval
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[12.5px] text-muted-foreground">
                    {itemStatusLine(item)}
                    {item.active_reservations.length > 0 &&
                      ` · reserved for ${item.active_reservations[0].shoot_name}`}
                  </div>
                </div>
                <StatusBadge status={item.status} />
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="rounded-xl border border-dashed border-border px-5 py-10 text-center text-[13px] text-muted-foreground">
              No gear matches these filters.
            </li>
          )}
        </ul>
      </div>

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

      {/* Kit sheet */}
      {openKit && (
        <KitTakeDialog
          kit={openKit}
          knownItems={items}
          open={true}
          onOpenChange={(o) => !o && setOpenKitId(null)}
        />
      )}
    </div>
  )
}

function FilterChip({
  active,
  dashed,
  onClick,
  className,
  children,
}: {
  active: boolean
  dashed?: boolean
  onClick: () => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-input bg-card text-foreground hover:bg-accent',
        dashed && !active && 'border-dashed text-muted-foreground',
        className
      )}
    >
      {children}
    </button>
  )
}
