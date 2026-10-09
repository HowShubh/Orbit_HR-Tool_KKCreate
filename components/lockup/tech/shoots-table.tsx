'use client'

import Link from 'next/link'
import {
  ArrowRight,
  Boxes,
  Clapperboard,
  MapPin,
  PackageCheck,
  TriangleAlert,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { ShootSummary } from '@/lib/queries/lockup'
import { cn } from '@/lib/utils'
import { fmtShootWindow } from '../item-bits'

/**
 * Shoot oversight for the console. Shoots drive most reservations, yet the
 * console never showed them. This lists what is planned, running and recently
 * done (kept 90 days, then swept), linking each to its detail page where the
 * close / cancel / delete flows already live.
 */
export function ShootsTable({ shoots }: { shoots: ShootSummary[] }) {
  if (shoots.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-5 py-12 text-center">
        <Clapperboard className="h-7 w-7 text-muted-foreground" />
        <div className="text-[14px] font-medium">No shoots yet</div>
        <p className="text-[12.5px] text-muted-foreground">
          Planned and recent shoots appear here. Finished ones stay for three months, then clear
          on their own.
        </p>
      </div>
    )
  }

  const live = shoots
    .filter((s) => s.status !== 'done')
    .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))
  const done = shoots
    .filter((s) => s.status === 'done')
    .sort((a, b) => +new Date(b.ends_at) - +new Date(a.ends_at))

  return (
    <div className="space-y-5">
      {live.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
            In progress &amp; upcoming
          </h3>
          <div className="space-y-2">
            {live.map((s) => (
              <ShootCard key={s.id} shoot={s} />
            ))}
          </div>
        </section>
      )}

      {done.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
            Done (kept 3 months)
          </h3>
          <div className="space-y-2">
            {done.map((s) => (
              <ShootCard key={s.id} shoot={s} done />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function daysUntilSweep(endsAt: string): number {
  const deleteAt = new Date(endsAt).getTime() + 90 * 24 * 60 * 60 * 1000
  return Math.max(0, Math.ceil((deleteAt - Date.now()) / (24 * 60 * 60 * 1000)))
}

function ShootCard({ shoot: s, done }: { shoot: ShootSummary; done?: boolean }) {
  const statusLabel =
    s.effective_status === 'active' ? 'In progress' : s.status === 'planned' ? 'Upcoming' : 'Done'
  const studios = s.studio_blocks.map((b) => b.studio_name)
  const uniqueStudios = Array.from(new Set(studios))

  return (
    <Link
      href={`/lockup/shoots/${s.id}`}
      className="block rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-accent"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[14.5px] font-semibold">{s.name}</span>
            <Badge
              variant={s.effective_status === 'active' ? 'info' : done ? 'muted' : 'default'}
              className="px-1.5 py-0 text-[10px]"
            >
              {statusLabel}
            </Badge>
            {s.conflict_count > 0 && (
              <Badge variant="danger" className="gap-1 px-1.5 py-0 text-[10px]">
                <TriangleAlert className="h-3 w-3" /> {s.conflict_count} conflict
                {s.conflict_count === 1 ? '' : 's'}
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground">
            <span>{fmtShootWindow(s.starts_at, s.ends_at)}</span>
            <span>· {s.owner_name}</span>
            {s.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {s.location}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Boxes className="h-3 w-3" /> {s.reserved_count} reserved
            </span>
            {s.picked_up_count > 0 && (
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <PackageCheck className="h-3 w-3" /> {s.picked_up_count} picked up
              </span>
            )}
            {uniqueStudios.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <Clapperboard className="h-3 w-3" /> {uniqueStudios.join(', ')}
              </span>
            )}
            {done && (
              <span className={cn('text-muted-foreground/80')}>
                clears in {daysUntilSweep(s.ends_at)}d
              </span>
            )}
          </div>
        </div>
        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
    </Link>
  )
}
