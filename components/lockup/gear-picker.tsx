'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Boxes, Check, Plus, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { EQUIPMENT_CATEGORIES, type EquipmentCategory } from '@/lib/lockup/constants'
import { cn } from '@/lib/utils'
import { CATEGORY_ICONS, CodeChip, PhotoHover } from './item-bits'

/**
 * The gear picker used in BOTH places gear is chosen: browsing Lockup, and
 * step 3 of the shoot wizard. Three columns at once — type, gear, what you
 * picked — so the two flows look and behave identically. Callers normalise
 * their own rows into PickerRow and supply the right-hand panel.
 */

export type PickerRow = {
  id: string
  code: string
  name: string
  category: EquipmentCategory
  photo_url: string | null
  subtitle?: string | null
  requires_approval: boolean
  statusText: string
  statusTone: 'free' | 'warn' | 'blocked'
  /** False greys the add button out (in repair, taken for your window, …). */
  selectable: boolean
  /** Browse links rows to the item page; the wizard keeps them inert. */
  href?: string
}

export type PickerKit = {
  id: string
  name: string
  total: number
  /** Ids that can actually be added right now. */
  addableIds: string[]
}

export function GearPicker({
  rows,
  kits,
  selectedIds,
  onToggle,
  onAddMany,
  aside,
  asideTitle,
  asideCount,
  asideOnMobile = false,
  footer,
}: {
  rows: PickerRow[]
  kits: PickerKit[]
  selectedIds: string[]
  onToggle: (id: string) => void
  onAddMany: (ids: string[]) => void
  /** The right-hand panel: the cart in browse, the plan summary in the wizard. */
  aside: React.ReactNode
  asideTitle: string
  asideCount: number
  /** Show the aside stacked below the list on phones too (dialogs), instead of
   *  the default desktop-only column (browse, which has its own mobile bar). */
  asideOnMobile?: boolean
  /** Wizard step navigation; browse passes nothing. */
  footer?: React.ReactNode
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<'all' | EquipmentCategory>('all')
  const [view, setView] = useState<'all' | 'kits'>('all')

  const categories = useMemo(() => {
    const counts = new Map<EquipmentCategory, number>()
    for (const r of rows) counts.set(r.category, (counts.get(r.category) ?? 0) + 1)
    return EQUIPMENT_CATEGORIES.filter((c) => counts.has(c.key)).map((c) => ({
      ...c,
      count: counts.get(c.key) ?? 0,
    }))
  }, [rows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter(
      (r) =>
        (category === 'all' || r.category === category) &&
        (!q ||
          r.name.toLowerCase().includes(q) ||
          r.code.toLowerCase().includes(q) ||
          (r.subtitle ?? '').toLowerCase().includes(q) ||
          r.statusText.toLowerCase().includes(q))
    )
  }, [rows, query, category])

  const shownKits = query.trim()
    ? kits.filter((k) => k.name.toLowerCase().includes(query.trim().toLowerCase()))
    : kits

  const selected = new Set(selectedIds)

  return (
    <div className="lg:grid lg:grid-cols-[190px_minmax(0,1fr)_290px] lg:gap-4">
      {/* ---- Column 1: type ---- */}
      <aside className="lg:sticky lg:top-4 lg:h-fit">
        <div className="mb-1.5 hidden px-1 text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground lg:block">
          Type
        </div>
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0 lg:pb-0">
          <TypeButton
            active={category === 'all'}
            onClick={() => setCategory('all')}
            label="All types"
            count={rows.length}
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
                category === 'all'
                  ? 'Search all gear...'
                  : `Search within ${categoryLabel(category)}...`
              }
              className="pl-9"
            />
          </div>
        </div>

        {view === 'kits' ? (
          <ul className="space-y-2">
            {shownKits.map((kit) => {
              const allIn = kit.addableIds.length > 0 && kit.addableIds.every((id) => selected.has(id))
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
                      {kit.total} item{kit.total === 1 ? '' : 's'}
                    </div>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 text-[12.5px] font-medium',
                      kit.addableIds.length === kit.total
                        ? 'text-emerald-700'
                        : kit.addableIds.length > 0
                          ? 'text-amber-700'
                          : 'text-muted-foreground'
                    )}
                  >
                    {kit.addableIds.length === kit.total
                      ? 'all free'
                      : `${kit.addableIds.length} of ${kit.total} free`}
                  </span>
                  <AddButton
                    disabled={kit.addableIds.length === 0}
                    added={allIn}
                    label={`Add ${kit.name}`}
                    onClick={() => onAddMany(kit.addableIds)}
                  />
                </li>
              )
            })}
            {shownKits.length === 0 && <Empty>No kits match that.</Empty>}
          </ul>
        ) : (
          <ul className="space-y-2">
            {filtered.map((row) => (
              <Row
                key={row.id}
                row={row}
                selected={selected.has(row.id)}
                onToggle={() => onToggle(row.id)}
              />
            ))}
            {filtered.length === 0 && <Empty>No gear matches these filters.</Empty>}
          </ul>
        )}

        {footer && <div className="pt-1">{footer}</div>}
      </section>

      {/* ---- Column 3: what you picked ---- */}
      <aside className={cn('lg:block', asideOnMobile ? 'mt-3 lg:mt-0' : 'hidden')}>
        <div className="sticky top-4 space-y-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">
              {asideTitle}
            </span>
            <span className="text-[12px] font-semibold text-muted-foreground">({asideCount})</span>
          </div>
          {aside}
        </div>
      </aside>
    </div>
  )
}

function categoryLabel(key: EquipmentCategory): string {
  return EQUIPMENT_CATEGORIES.find((c) => c.key === key)?.label ?? 'gear'
}

/** Identity on the left; status and the add button together on the right, so a
 *  wide row never leaves a dead strip through its middle. */
function Row({
  row,
  selected,
  onToggle,
}: {
  row: PickerRow
  selected: boolean
  onToggle: () => void
}) {
  const Icon = CATEGORY_ICONS[row.category]
  const body = (
    <>
      <PhotoHover photoUrl={row.photo_url}>
        <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">
          {row.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.photo_url} alt="" className="h-full w-full rounded-xl object-cover" />
          ) : (
            <Icon className="h-5 w-5 text-muted-foreground" />
          )}
        </span>
      </PhotoHover>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[14.5px] font-semibold">{row.name}</span>
          <CodeChip code={row.code} />
          {row.requires_approval && (
            <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-px text-[10px] font-semibold text-amber-700">
              approval
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 text-[12px]">
          <span
            className={cn(
              'font-medium',
              row.statusTone === 'free'
                ? 'text-emerald-700'
                : row.statusTone === 'warn'
                  ? 'text-amber-700'
                  : 'text-rose-700'
            )}
          >
            {row.statusText}
          </span>
          {row.subtitle && <span className="truncate text-muted-foreground">{row.subtitle}</span>}
        </div>
      </div>
    </>
  )

  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-card py-2.5 pl-3.5 pr-3 transition-colors hover:bg-accent/40">
      {row.href ? (
        <Link href={row.href} className="flex min-w-0 flex-1 items-center gap-3">
          {body}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
      )}

      <div className="flex shrink-0 items-center">
        {row.selectable ? (
          <AddButton
            added={selected}
            label={`${selected ? 'Remove' : 'Add'} ${row.name}`}
            onClick={onToggle}
          />
        ) : row.href ? (
          <Link
            href={row.href}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border-[1.5px] border-border text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-accent"
          >
            When?
          </Link>
        ) : (
          <AddButton added={false} disabled label={row.name} onClick={() => {}} />
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
