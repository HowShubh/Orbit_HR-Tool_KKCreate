'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Boxes, Check, Plus, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { EquipmentItemRow, KitRow, ShootSummary } from '@/lib/queries/lockup'
import { EQUIPMENT_CATEGORIES, type EquipmentCategory } from '@/lib/lockup/constants'
import { useCart } from '@/lib/lockup/cart'
import { cn } from '@/lib/utils'
import { CATEGORY_ICONS, CodeChip, fmtDay } from './item-bits'
import { CartPanel } from './cart-panel'

type View = 'all' | 'kits'

/**
 * Gear selection, three columns at once: what kind of thing (left), the things
 * themselves (middle), and what you have picked (right). On phones the columns
 * stack — categories become a chip row and the cart moves into its bottom sheet.
 */
export function InventoryBrowser({
  items,
  kits,
  shoots,
  currentUserId,
}: {
  items: EquipmentItemRow[]
  kits: KitRow[]
  shoots: ShootSummary[]
  currentUserId: string
}) {
  const cart = useCart()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<'all' | EquipmentCategory>('all')
  const [view, setView] = useState<View>('all')

  const pooled = useMemo(
    () => items.filter((i) => i.kind !== 'assigned' && i.status !== 'retired' && i.status !== 'lost'),
    [items]
  )

  // Category rail: only kinds we actually own, each with its count.
  const categories = useMemo(() => {
    const counts = new Map<EquipmentCategory, number>()
    for (const i of pooled) counts.set(i.category, (counts.get(i.category) ?? 0) + 1)
    return EQUIPMENT_CATEGORIES.filter((c) => counts.has(c.key)).map((c) => ({
      ...c,
      count: counts.get(c.key) ?? 0,
    }))
  }, [pooled])

  const matches = (item: EquipmentItemRow, q: string) =>
    item.name.toLowerCase().includes(q) ||
    item.code.toLowerCase().includes(q) ||
    (item.serial_number ?? '').toLowerCase().includes(q) ||
    (item.brand_model ?? '').toLowerCase().includes(q) ||
    (item.holder_name ?? '').toLowerCase().includes(q)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return pooled.filter(
      (item) =>
        (category === 'all' || item.category === category) && (!q || matches(item, q))
    )
  }, [pooled, query, category])

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const kitCards = useMemo(
    () =>
      kits.map((kit) => ({
        kit,
        freeIds: kit.items
          .filter((m) => (itemById.get(m.item_id)?.status ?? m.status) === 'available')
          .map((m) => m.item_id),
      })),
    [kits, itemById]
  )
  const shownKits = query.trim()
    ? kitCards.filter(({ kit }) => kit.name.toLowerCase().includes(query.trim().toLowerCase()))
    : kitCards

  return (
    <div className="lg:grid lg:grid-cols-[190px_minmax(0,1fr)_290px] lg:gap-4">
      {/* ---- Column 1: type ---- */}
      <aside className="lg:sticky lg:top-4 lg:h-fit">
        <div className="mb-1.5 hidden px-1 text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground lg:block">
          Type
        </div>
        {/* Phones: a scrolling chip row. Desktop: a real list with counts. */}
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0 lg:pb-0">
          <TypeButton
            active={category === 'all'}
            onClick={() => setCategory('all')}
            label="All types"
            count={pooled.length}
          />
          {categories.map((c) => (
            <TypeButton
              key={c.key}
              active={category === c.key}
              onClick={() => setCategory(c.key)}
              label={c.label}
              count={c.count}
              icon={CATEGORY_ICONS[c.key]}
            />
          ))}
        </div>
      </aside>

      {/* ---- Column 2: the gear ---- */}
      <section className="mt-3 min-w-0 space-y-3 lg:mt-0">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex gap-1 rounded-xl bg-muted p-1">
            <ViewTab active={view === 'all'} onClick={() => setView('all')}>
              All
            </ViewTab>
            <ViewTab active={view === 'kits'} onClick={() => setView('kits')}>
              <Boxes className="h-3.5 w-3.5" /> Kits
              {kits.length > 0 && <span className="opacity-60">{kits.length}</span>}
            </ViewTab>
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                category === 'all' ? 'Search all gear...' : `Search within ${categoryLabel(category)}...`
              }
              className="pl-9"
            />
          </div>
        </div>

        {view === 'kits' ? (
          <ul className="space-y-2">
            {shownKits.map(({ kit, freeIds }) => {
              const allIn = freeIds.length > 0 && freeIds.every((id) => cart.has(id))
              return (
                <li
                  key={kit.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card py-2.5 pl-3.5 pr-3"
                >
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10">
                    <Boxes className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14.5px] font-semibold">{kit.name}</div>
                    <div className="text-[12.5px] text-muted-foreground">
                      {kit.items.length} item{kit.items.length === 1 ? '' : 's'}
                    </div>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 text-[12.5px] font-medium',
                      freeIds.length === kit.items.length
                        ? 'text-emerald-700'
                        : freeIds.length > 0
                          ? 'text-amber-700'
                          : 'text-muted-foreground'
                    )}
                  >
                    {freeIds.length === kit.items.length
                      ? 'all free'
                      : `${freeIds.length} of ${kit.items.length} free`}
                  </span>
                  <AddButton
                    disabled={freeIds.length === 0}
                    added={allIn}
                    label={`Add ${kit.name} to cart`}
                    onClick={() => cart.add(freeIds)}
                  />
                </li>
              )
            })}
            {shownKits.length === 0 && <Empty>No kits match that.</Empty>}
          </ul>
        ) : (
          <ul className="space-y-2">
            {filtered.map((item) => (
              <GearRow key={item.id} item={item} inCart={cart.has(item.id)} onToggle={() => cart.toggle(item.id)} />
            ))}
            {filtered.length === 0 && <Empty>No gear matches these filters.</Empty>}
          </ul>
        )}
      </section>

      {/* ---- Column 3: the cart (desktop; phones use the bottom sheet) ---- */}
      <aside className="hidden lg:block">
        <div className="sticky top-4 space-y-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">
              Selected
            </span>
            <span className="text-[12px] font-semibold text-muted-foreground">({cart.count})</span>
          </div>
          <CartPanel items={items} shoots={shoots} currentUserId={currentUserId} />
        </div>
      </aside>
    </div>
  )
}

function categoryLabel(key: EquipmentCategory): string {
  return EQUIPMENT_CATEGORIES.find((c) => c.key === key)?.label ?? 'gear'
}

/** One gear row: identity on the left, then status and the add button together
 *  on the right, so a wide row never leaves a dead strip in the middle. */
function GearRow({
  item,
  inCart,
  onToggle,
}: {
  item: EquipmentItemRow
  inCart: boolean
  onToggle: () => void
}) {
  const Icon = CATEGORY_ICONS[item.category]
  const free = item.status === 'available'

  const status = free
    ? { text: `Free · ${item.current_location_label ?? item.home_location_label ?? 'shelf'}`, tone: 'free' as const }
    : item.status === 'in_repair'
      ? {
          text: item.repair_expected_back_on
            ? `Repair til ${fmtDay(item.repair_expected_back_on)}`
            : 'In repair',
          tone: 'repair' as const,
        }
      : {
          text: item.due_at ? `Out til ${fmtDay(item.due_at)}` : 'Out now',
          tone: 'out' as const,
        }

  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-card py-2.5 pl-3.5 pr-3 transition-colors hover:bg-accent/40">
      <Link href={`/lockup/items/${item.code}`} className="flex min-w-0 flex-1 items-center gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-muted">
          {item.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.photo_url} alt="" className="h-full w-full rounded-xl object-cover" />
          ) : (
            <Icon className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14.5px] font-semibold">{item.name}</span>
            <CodeChip code={item.code} />
          </div>
          {item.brand_model && (
            <div className="truncate text-[12px] text-muted-foreground">{item.brand_model}</div>
          )}
        </div>
      </Link>

      {/* Status sits next to the button, not floating in the empty middle. */}
      <div className="flex shrink-0 items-center gap-2.5">
        {item.requires_approval && (
          <span className="hidden rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 sm:inline">
            approval
          </span>
        )}
        <span
          className={cn(
            'rounded-full px-2.5 py-1 text-[12px] font-semibold',
            status.tone === 'free'
              ? 'bg-emerald-50 text-emerald-700'
              : status.tone === 'repair'
                ? 'bg-amber-50 text-amber-700'
                : 'bg-rose-50 text-rose-700'
          )}
        >
          {status.text}
        </span>
        {free ? (
          <AddButton added={inCart} label={`${inCart ? 'Remove' : 'Add'} ${item.name}`} onClick={onToggle} />
        ) : (
          <Link
            href={`/lockup/items/${item.code}`}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border-[1.5px] border-border text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-accent"
          >
            When?
          </Link>
        )}
      </div>
    </li>
  )
}

function AddButton({
  added,
  disabled,
  label,
  onClick,
}: {
  added: boolean
  disabled?: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={`${label} to cart`}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'grid h-11 w-11 shrink-0 place-items-center rounded-xl border-[1.5px] transition-colors',
        disabled
          ? 'cursor-not-allowed border-border bg-muted text-muted-foreground/50'
          : added
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-primary text-primary hover:bg-primary/10'
      )}
    >
      {added ? <Check className="h-[18px] w-[18px]" /> : <Plus className="h-[18px] w-[18px]" />}
    </button>
  )
}

function TypeButton({
  active,
  onClick,
  label,
  count,
  icon: Icon,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
  icon?: typeof Boxes
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors lg:w-full lg:justify-start lg:rounded-xl lg:border-transparent lg:px-3 lg:py-2',
        active
          ? 'border-primary bg-primary text-primary-foreground lg:border-primary/20 lg:bg-primary/10 lg:text-primary'
          : 'border-input bg-card hover:bg-accent lg:bg-transparent'
      )}
    >
      {Icon && <Icon className="hidden h-4 w-4 shrink-0 lg:block" />}
      <span className="lg:flex-1 lg:text-left">{label}</span>
      <span className={cn('text-[12px]', active ? 'opacity-80' : 'text-muted-foreground')}>
        {count}
      </span>
    </button>
  )
}

function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[13px] font-semibold transition-colors',
        active ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <li className="rounded-xl border border-dashed border-border px-5 py-10 text-center text-[13px] text-muted-foreground">
      {children}
    </li>
  )
}
