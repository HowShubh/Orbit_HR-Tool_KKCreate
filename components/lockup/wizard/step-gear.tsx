'use client'

import { useMemo, useState } from 'react'
import { Check, Loader2, Minus, Package, Plus, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { AvailabilityRow, KitRow } from '@/lib/queries/lockup'
import { EQUIPMENT_CATEGORIES, type EquipmentCategory } from '@/lib/lockup/constants'
import { CATEGORY_ICONS } from '../item-bits'
import { cn } from '@/lib/utils'

// ---------- grouping: identical units ("Rode ×2") collapse into one row ----------

export type GearGroup = {
  key: string
  name: string
  category: EquipmentCategory
  requires_approval: boolean
  /** Sorted best-first: free, then reserved-elsewhere (amber), then blocked. */
  units: AvailabilityRow[]
}

function unitRank(r: AvailabilityRow): number {
  if (!r.conflict) return 0
  return r.conflict.kind === 'double_reserved' ? 1 : 2
}

/** A unit is takeable when free or merely reserved elsewhere (warn-but-allow). */
export function isAddable(r: AvailabilityRow): boolean {
  return !r.conflict || r.conflict.kind === 'double_reserved'
}

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
      units: [...units].sort((a, b) => unitRank(a) - unitRank(b)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function StepGear({
  availability,
  loading,
  kits,
  selectedIds,
  onToggle,
  onAddKit,
}: {
  availability: AvailabilityRow[] | null
  loading: boolean
  kits: KitRow[]
  selectedIds: string[]
  onToggle: (itemId: string) => void
  onAddKit: (kit: KitRow) => void
}) {
  const [category, setCategory] = useState<EquipmentCategory | 'all'>('all')
  const [view, setView] = useState<'all' | 'kits'>('all')
  const [search, setSearch] = useState('')

  const rows = useMemo(() => availability ?? [], [availability])
  const availabilityById = useMemo(() => new Map(rows.map((r) => [r.item_id, r])), [rows])
  const groups = useMemo(() => groupGear(rows), [rows])

  const countByCategory = useMemo(() => {
    const counts = new Map<EquipmentCategory, number>()
    for (const g of groups) counts.set(g.category, (counts.get(g.category) ?? 0) + 1)
    return counts
  }, [groups])

  const q = search.trim().toLowerCase()
  const visibleGroups = groups.filter((g) => {
    if (category !== 'all' && g.category !== category) return false
    if (q && !g.name.toLowerCase().includes(q) && !g.units.some((u) => u.code.toLowerCase().includes(q)))
      return false
    return true
  })

  // Kits surface inside the browse list too (a kit "belongs" to a category
  // when any member is of that category), plus the dedicated Kits view.
  const visibleKits = kits.filter((kit) => {
    if (category !== 'all' && !kit.items.some((m) => m.category === category)) return false
    if (q && !kit.name.toLowerCase().includes(q) && !kit.items.some((m) => m.name.toLowerCase().includes(q)))
      return false
    return true
  })

  function selectedCount(g: GearGroup): number {
    return g.units.filter((u) => selectedIds.includes(u.item_id)).length
  }

  function addOne(g: GearGroup) {
    const next = g.units.find((u) => isAddable(u) && !selectedIds.includes(u.item_id))
    if (next) onToggle(next.item_id)
  }

  function removeOne(g: GearGroup) {
    const mine = g.units.filter((u) => selectedIds.includes(u.item_id))
    if (mine.length > 0) onToggle(mine[mine.length - 1].item_id)
  }

  if (loading || availability === null) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-[13px] text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking availability for your dates...
      </div>
    )
  }

  const categoriesWithItems = EQUIPMENT_CATEGORIES.filter(
    (c) => (countByCategory.get(c.key) ?? 0) > 0
  )
  const categoryLabel =
    category === 'all'
      ? 'gear'
      : EQUIPMENT_CATEGORIES.find((c) => c.key === category)?.label ?? 'gear'

  return (
    <div className="flex gap-4">
      {/* Type rail (desktop) */}
      <div className="hidden w-[150px] shrink-0 space-y-1 sm:block">
        <div className="pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Type
        </div>
        {categoriesWithItems.map((c) => {
          const Icon = CATEGORY_ICONS[c.key]
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setCategory(category === c.key ? 'all' : c.key)}
              className={cn(
                'flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-[12.5px] transition-colors',
                category === c.key
                  ? 'border-primary bg-primary/5 font-medium'
                  : 'border-transparent hover:bg-muted'
              )}
            >
              <span className="flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                {c.label}
              </span>
              <span className="text-muted-foreground">{countByCategory.get(c.key)}</span>
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => setCategory('all')}
          className={cn(
            'w-full rounded-lg border px-2.5 py-1.5 text-left text-[12.5px]',
            category === 'all'
              ? 'border-primary bg-primary/5 font-medium'
              : 'border-transparent hover:bg-muted'
          )}
        >
          All types
        </button>
      </div>

      <div className="min-w-0 flex-1 space-y-3">
        {/* View toggle + search */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setView('all')}
            className={cn(
              'rounded-full border px-3 py-1.5 text-[12.5px] font-medium',
              view === 'all'
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border hover:bg-muted'
            )}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setView('kits')}
            className={cn(
              'flex items-center gap-1 rounded-full border px-3 py-1.5 text-[12.5px] font-medium',
              view === 'kits'
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border hover:bg-muted'
            )}
          >
            <Package className="h-3.5 w-3.5" /> Kits
            {kits.length > 0 && <span className="text-[11px]">({kits.length})</span>}
          </button>
          {view === 'all' && (
            <div className="relative min-w-[160px] flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`search within ${categoryLabel}...`}
                className="h-9 pl-8"
              />
            </div>
          )}
        </div>

        {/* Mobile category chips */}
        {view === 'all' && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 sm:hidden">
            <button
              type="button"
              onClick={() => setCategory('all')}
              className={cn(
                'shrink-0 rounded-full border px-2.5 py-1 text-[12px]',
                category === 'all' ? 'border-primary bg-primary/10 font-medium' : 'border-border'
              )}
            >
              All
            </button>
            {categoriesWithItems.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategory(c.key)}
                className={cn(
                  'shrink-0 rounded-full border px-2.5 py-1 text-[12px]',
                  category === c.key
                    ? 'border-primary bg-primary/10 font-medium'
                    : 'border-border'
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        {view === 'all' ? (
          visibleGroups.length === 0 && visibleKits.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-muted-foreground">
              Nothing matches. Try another category or search.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {/* Kits first, browsable inline */}
              {visibleKits.map((kit) => {
                const memberRows = kit.items
                  .map((m) => availabilityById.get(m.item_id))
                  .filter(Boolean) as AvailabilityRow[]
                const freeCount = memberRows.filter((r) => !r.conflict).length
                const allSelected =
                  memberRows.length > 0 &&
                  memberRows
                    .filter((r) => isAddable(r))
                    .every((r) => selectedIds.includes(r.item_id))
                return (
                  <li key={`kit-${kit.id}`}>
                    <button
                      type="button"
                      onClick={() => !allSelected && onAddKit(kit)}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-colors',
                        allSelected
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-muted'
                      )}
                      title={kit.items.map((m) => m.name).join(', ')}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {allSelected ? (
                          <Check className="h-4 w-4 shrink-0 text-primary" />
                        ) : (
                          <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate text-[13.5px] font-medium">{kit.name}</span>
                      </span>
                      <Badge variant={freeCount === kit.items.length ? 'success' : 'muted'}>
                        {freeCount === kit.items.length
                          ? 'avail'
                          : `${freeCount} of ${kit.items.length} avail`}
                      </Badge>
                    </button>
                  </li>
                )
              })}

              {visibleGroups.map((g) => {
                const count = selectedCount(g)
                const addable = g.units.filter((u) => isAddable(u))
                const freeCount = g.units.filter((u) => !u.conflict).length
                const blocked = addable.length === 0
                const best = g.units[0]
                return (
                  <li key={g.key}>
                    <div
                      role="button"
                      tabIndex={blocked ? -1 : 0}
                      onClick={() => {
                        if (blocked) return
                        if (count === 0) addOne(g)
                        else if (g.units.length === 1) removeOne(g)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !blocked && count === 0) addOne(g)
                      }}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-colors',
                        count > 0
                          ? 'border-primary bg-primary/5'
                          : blocked
                            ? 'border-border opacity-60'
                            : 'cursor-pointer border-border hover:bg-muted'
                      )}
                      title={g.units.map((u) => u.code).join(', ')}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {count > 0 ? (
                          <Check className="h-4 w-4 shrink-0 text-primary" />
                        ) : (
                          <Plus
                            className={cn(
                              'h-4 w-4 shrink-0',
                              blocked ? 'text-muted-foreground/40' : 'text-muted-foreground'
                            )}
                          />
                        )}
                        <span className={cn('truncate text-[13.5px]', blocked && 'text-muted-foreground')}>
                          {g.name}
                          {g.units.length > 1 && (
                            <span className="ml-1.5 text-[11.5px] text-muted-foreground">
                              ×{g.units.length}
                            </span>
                          )}
                        </span>
                      </span>

                      <span className="flex shrink-0 items-center gap-1.5">
                        {/* quantity stepper for multi-unit groups */}
                        {count > 0 && g.units.length > 1 && (
                          <span
                            className="flex items-center gap-1 rounded-full border border-primary/40 bg-background px-1 py-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              aria-label={`One less ${g.name}`}
                              onClick={() => removeOne(g)}
                              className="rounded-full p-0.5 hover:bg-muted"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="min-w-[16px] text-center text-[12px] font-semibold">
                              {count}
                            </span>
                            <button
                              type="button"
                              aria-label={`One more ${g.name}`}
                              disabled={count >= addable.length}
                              onClick={() => addOne(g)}
                              className="rounded-full p-0.5 hover:bg-muted disabled:opacity-30"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </span>
                        )}
                        {g.requires_approval && <Badge variant="warning">approval</Badge>}
                        {freeCount > 0 ? (
                          <Badge variant="success">
                            {g.units.length > 1 ? `${freeCount} avail` : 'avail'}
                          </Badge>
                        ) : (
                          <span
                            className={cn(
                              'max-w-[160px] truncate text-[11.5px] font-medium',
                              best.conflict?.kind === 'double_reserved'
                                ? 'text-amber-600'
                                : 'text-rose-600'
                            )}
                            title={best.conflict?.message}
                          >
                            {best.conflict?.short}
                          </span>
                        )}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )
        ) : kits.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-muted-foreground">
            No kits yet. The tech lead can define them in the Tech Console.
          </p>
        ) : (
          <ul className="space-y-2">
            {kits.map((kit) => {
              const memberRows = kit.items
                .map((m) => availabilityById.get(m.item_id))
                .filter(Boolean) as AvailabilityRow[]
              const freeCount = memberRows.filter((r) => !r.conflict).length
              const allSelected =
                memberRows.length > 0 &&
                memberRows
                  .filter((r) => isAddable(r))
                  .every((r) => selectedIds.includes(r.item_id))
              return (
                <li key={kit.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-semibold">{kit.name}</div>
                      <div className="text-[12px] text-muted-foreground">
                        {freeCount} of {kit.items.length} available
                        {kit.notes ? ` · ${kit.notes}` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={allSelected}
                      onClick={() => onAddKit(kit)}
                      className={cn(
                        'flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors',
                        allSelected
                          ? 'border-border text-muted-foreground'
                          : 'border-primary bg-primary text-primary-foreground hover:bg-primary/90'
                      )}
                    >
                      {allSelected ? (
                        <>
                          <Check className="h-3.5 w-3.5" /> Added
                        </>
                      ) : (
                        <>
                          <Plus className="h-3.5 w-3.5" /> Add kit
                        </>
                      )}
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {kit.items.map((m) => {
                      const r = availabilityById.get(m.item_id)
                      const hardBlocked = r ? !isAddable(r) : false
                      return (
                        <span
                          key={m.item_id}
                          className={cn(
                            'rounded-full border border-border px-2 py-0.5 text-[11.5px]',
                            hardBlocked && 'text-muted-foreground line-through',
                            selectedIds.includes(m.item_id) && 'border-primary bg-primary/10'
                          )}
                          title={r?.conflict?.message}
                        >
                          {m.name}
                        </span>
                      )
                    })}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
