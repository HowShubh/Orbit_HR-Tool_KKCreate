'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Boxes, Check, ChevronRight, Plus, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { EquipmentItemRow, KitRow } from '@/lib/queries/lockup'
import { EQUIPMENT_CATEGORIES, type EquipmentCategory } from '@/lib/lockup/constants'
import { useCart } from '@/lib/lockup/cart'
import { cn } from '@/lib/utils'
import { CategoryIcon, CodeChip, itemStatusLine } from './item-bits'

/**
 * Gear browse: the landing surface. One search box, category chips, an
 * available-only toggle, kits, then everything. Plus adds to the cart; the row
 * itself opens the item's page, which is where the full story lives.
 */
export function InventoryBrowser({
  items,
  kits,
}: {
  items: EquipmentItemRow[]
  kits: KitRow[]
}) {
  const cart = useCart()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<'all' | EquipmentCategory>('all')
  const [freeOnly, setFreeOnly] = useState(false)

  const pooled = useMemo(
    () =>
      items.filter(
        (i) => i.kind !== 'assigned' && i.status !== 'retired' && i.status !== 'lost'
      ),
    [items]
  )

  // Only show categories that actually hold gear, so the chip row stays short.
  const usedCategories = useMemo(() => {
    const used = new Set(pooled.map((i) => i.category))
    return EQUIPMENT_CATEGORIES.filter((c) => used.has(c.key))
  }, [pooled])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return pooled.filter((item) => {
      if (category !== 'all' && item.category !== category) return false
      if (freeOnly && item.status !== 'available') return false
      if (!q) return true
      return (
        item.name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        (item.serial_number ?? '').toLowerCase().includes(q) ||
        (item.brand_model ?? '').toLowerCase().includes(q) ||
        (item.holder_name ?? '').toLowerCase().includes(q)
      )
    })
  }, [pooled, query, category, freeOnly])

  const freeCount = pooled.filter((i) => i.status === 'available').length

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const kitCards = useMemo(
    () =>
      kits.map((kit) => {
        const free = kit.items.filter(
          (m) => (itemById.get(m.item_id)?.status ?? m.status) === 'available'
        )
        return { kit, freeIds: free.map((f) => f.item_id) }
      }),
    [kits, itemById]
  )
  const shownKits = query.trim()
    ? kitCards.filter(({ kit }) => kit.name.toLowerCase().includes(query.trim().toLowerCase()))
    : kitCards

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search gear, kits, codes, people..."
          className="pl-9"
        />
      </div>

      <div className="no-scrollbar flex items-center gap-2 overflow-x-auto pb-0.5">
        <Chip active={category === 'all'} onClick={() => setCategory('all')}>
          All
        </Chip>
        {usedCategories.map((c) => (
          <Chip
            key={c.key}
            active={category === c.key}
            onClick={() => setCategory(category === c.key ? 'all' : c.key)}
          >
            {c.label}
          </Chip>
        ))}
        <Chip active={freeOnly} dashed onClick={() => setFreeOnly((v) => !v)} className="ml-auto">
          Free now · {freeCount}
        </Chip>
      </div>

      {/* Kits */}
      {shownKits.length > 0 && (
        <section className="space-y-2">
          <SectionHead title="Kits" hint="grab a whole setup in one tap" />
          <div className="no-scrollbar flex gap-2.5 overflow-x-auto pb-0.5">
            {shownKits.map(({ kit, freeIds }) => {
              const allIn = freeIds.length > 0 && freeIds.every((id) => cart.has(id))
              return (
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
                      freeIds.length === kit.items.length
                        ? 'text-emerald-700'
                        : freeIds.length > 0
                          ? 'text-amber-700'
                          : 'text-muted-foreground'
                    )}
                  >
                    {kit.items.length} item{kit.items.length === 1 ? '' : 's'} ·{' '}
                    {freeIds.length === kit.items.length ? 'all free' : `${freeIds.length} free`}
                  </span>
                  <button
                    type="button"
                    disabled={freeIds.length === 0}
                    onClick={() => cart.add(freeIds)}
                    className={cn(
                      'rounded-lg py-2 text-[13px] font-semibold transition-colors',
                      freeIds.length === 0
                        ? 'cursor-not-allowed bg-muted text-muted-foreground'
                        : allIn
                          ? 'bg-primary/10 text-primary'
                          : 'bg-primary text-primary-foreground hover:bg-primary/90'
                    )}
                  >
                    {freeIds.length === 0
                      ? 'Nothing free'
                      : allIn
                        ? 'In your cart'
                        : `Add ${freeIds.length} to cart`}
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* All gear */}
      <section className="space-y-2">
        <SectionHead
          title="All gear"
          hint={`${filtered.length} item${filtered.length === 1 ? '' : 's'}`}
          hintRight
        />
        <ul className="space-y-2">
          {filtered.map((item) => {
            const free = item.status === 'available'
            const inCart = cart.has(item.id)
            return (
              <li
                key={item.id}
                className="flex items-center gap-2 rounded-xl border border-border bg-card pr-2.5 transition-colors hover:bg-accent/40"
              >
                <Link
                  href={`/lockup/items/${item.code}`}
                  className="flex min-w-0 flex-1 items-center gap-3.5 py-3 pl-3.5"
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
                    <div
                      className={cn(
                        'truncate text-[12.5px]',
                        free
                          ? 'text-emerald-700'
                          : item.status === 'in_repair'
                            ? 'text-amber-700'
                            : 'text-blue-700'
                      )}
                    >
                      {itemStatusLine(item)}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>

                {free ? (
                  <button
                    type="button"
                    aria-label={inCart ? `Remove ${item.name} from cart` : `Add ${item.name} to cart`}
                    onClick={() => cart.toggle(item.id)}
                    className={cn(
                      'grid h-9 w-9 shrink-0 place-items-center rounded-xl border-[1.5px] transition-colors',
                      inCart
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-primary text-primary hover:bg-primary/10'
                    )}
                  >
                    {inCart ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  </button>
                ) : (
                  <Link
                    href={`/lockup/items/${item.code}`}
                    className="shrink-0 rounded-lg px-2 py-1 text-[12px] font-semibold text-primary hover:bg-primary/10"
                  >
                    When?
                  </Link>
                )}
              </li>
            )
          })}
          {filtered.length === 0 && (
            <li className="rounded-xl border border-dashed border-border px-5 py-10 text-center text-[13px] text-muted-foreground">
              No gear matches these filters.
            </li>
          )}
        </ul>
      </section>
    </div>
  )
}

function SectionHead({
  title,
  hint,
  hintRight,
}: {
  title: string
  hint: string
  hintRight?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-baseline gap-2 px-0.5',
        hintRight ? 'justify-between' : undefined
      )}
    >
      <span className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
        {title}
      </span>
      <span className="text-[12px] text-muted-foreground/70">{hint}</span>
    </div>
  )
}

function Chip({
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
