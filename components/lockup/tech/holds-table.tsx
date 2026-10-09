'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  CalendarClock,
  Clapperboard,
  Clock,
  Loader2,
  PackageOpen,
  TriangleAlert,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useStore } from '@/lib/store'
import { cancelReservation } from '@/lib/actions/lockup'
import type { ConsoleHoldRow } from '@/lib/queries/lockup'
import { cn } from '@/lib/utils'
import { CategoryIcon, CodeChip, fmtDayTime } from '../item-bits'

type Filter = 'all' | 'pending' | 'personal' | 'shoot'

/**
 * Every hold in the system in one place. The console could see checkouts and
 * repairs but was blind to reservations, so a tech lead had no way to tell who
 * had set aside what, for when, or to clear a stuck hold. This closes that.
 */
export function HoldsTable({ rows }: { rows: ConsoleHoldRow[] }) {
  const router = useRouter()
  const { pushToast } = useStore()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  // Same item held twice with overlapping explicit windows is worth a look.
  // Whole-shoot holds (no window) are left to the shoot's own conflict count.
  const overlapItemIds = useMemo(() => {
    const byItem = new Map<string, ConsoleHoldRow[]>()
    for (const r of rows) byItem.set(r.item_id, [...(byItem.get(r.item_id) ?? []), r])
    const flagged = new Set<string>()
    for (const [itemId, list] of byItem) {
      const bounded = list.filter((r) => r.starts_at && r.ends_at)
      for (let i = 0; i < bounded.length; i++) {
        for (let j = i + 1; j < bounded.length; j++) {
          const aS = new Date(bounded[i].starts_at!).getTime()
          const aE = new Date(bounded[i].ends_at!).getTime()
          const bS = new Date(bounded[j].starts_at!).getTime()
          const bE = new Date(bounded[j].ends_at!).getTime()
          if (aS <= bE && bS <= aE) flagged.add(itemId)
        }
      }
    }
    return flagged
  }, [rows])

  async function cancel(r: ConsoleHoldRow) {
    setBusyId(r.id)
    try {
      await cancelReservation(r.id)
      pushToast({ title: `Hold on ${r.item_name} cleared`, variant: 'success' })
      router.refresh()
    } catch (err) {
      pushToast({
        title: err instanceof Error ? err.message : 'Could not clear the hold',
        variant: 'error',
      })
    } finally {
      setBusyId(null)
    }
  }

  const shown = rows.filter((r) => {
    if (filter === 'pending') return r.status === 'pending'
    if (filter === 'personal') return !r.shoot_id
    if (filter === 'shoot') return Boolean(r.shoot_id)
    return true
  })

  const counts = {
    all: rows.length,
    pending: rows.filter((r) => r.status === 'pending').length,
    personal: rows.filter((r) => !r.shoot_id).length,
    shoot: rows.filter((r) => r.shoot_id).length,
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-5 py-12 text-center">
        <PackageOpen className="h-7 w-7 text-muted-foreground" />
        <div className="text-[14px] font-medium">No gear on hold</div>
        <p className="text-[12.5px] text-muted-foreground">
          Reservations for a window or a shoot show up here until they are picked up or expire.
        </p>
      </div>
    )
  }

  const holders = new Set(rows.map((r) => r.held_by_id)).size

  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-muted-foreground">
        {rows.length} hold{rows.length === 1 ? '' : 's'} across {holders}{' '}
        {holders === 1 ? 'person' : 'people'}. Holds set gear aside; the item only leaves the
        shelf on a scan.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {(['all', 'pending', 'personal', 'shoot'] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              'rounded-full border px-3 py-1 text-[12px] font-medium transition-colors',
              filter === f
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-accent'
            )}
          >
            {f === 'all'
              ? 'All'
              : f === 'pending'
                ? 'Awaiting approval'
                : f === 'personal'
                  ? 'Personal holds'
                  : 'For a shoot'}{' '}
            <span className="opacity-60">{counts[f]}</span>
          </button>
        ))}
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        {shown.map((r) => {
          const windowLine =
            r.starts_at && r.ends_at
              ? `${fmtDayTime(r.starts_at)} → ${fmtDayTime(r.ends_at)}`
              : r.shoot_name
                ? 'Whole shoot'
                : 'Held'
          const overlaps = overlapItemIds.has(r.item_id)
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <CategoryIcon category={r.category} photoUrl={r.photo_url} size="sm" />
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/lockup/items/${r.item_code}`}
                    className="truncate text-[14px] font-semibold hover:underline"
                  >
                    {r.item_name}
                  </Link>
                  <CodeChip code={r.item_code} />
                  {r.status === 'pending' && (
                    <Badge variant="warning" className="px-1.5 py-0 text-[10px]">
                      Awaiting approval
                    </Badge>
                  )}
                  {overlaps && (
                    <Badge variant="danger" className="gap-1 px-1.5 py-0 text-[10px]">
                      <TriangleAlert className="h-3 w-3" /> Overlaps
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground">
                  <span className="font-medium text-foreground/80">{r.held_by_name}</span>
                  <span className="inline-flex items-center gap-1">
                    {r.shoot_id ? (
                      <Clock className="h-3 w-3" />
                    ) : (
                      <CalendarClock className="h-3 w-3" />
                    )}
                    {windowLine}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clapperboard className="h-3 w-3" />
                    {r.shoot_name ?? 'Personal hold'}
                  </span>
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0 text-muted-foreground hover:text-rose-600"
                disabled={busyId === r.id}
                onClick={() => cancel(r)}
                title="Clear this hold"
              >
                {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                Clear
              </Button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
