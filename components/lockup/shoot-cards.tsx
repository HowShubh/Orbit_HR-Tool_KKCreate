'use client'

import Link from 'next/link'
import {
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  Clapperboard,
  MapPin,
  Plus,
  User,
} from 'lucide-react'
import { fmtShootWindow, fmtTime } from './item-bits'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { ShootSummary } from '@/lib/queries/lockup'
import { SHOOT_STATUS_LABELS } from '@/lib/lockup/constants'
import { fmtDay } from './item-bits'

const SHOOT_BADGE: Record<ShootSummary['effective_status'], 'success' | 'info' | 'muted' | 'danger'> = {
  active: 'success',
  planned: 'info',
  done: 'muted',
  cancelled: 'danger',
}

export function ShootCards({
  shoots,
  currentUserId,
}: {
  shoots: ShootSummary[]
  currentUserId: string
}) {
  const visible = shoots.filter(
    (s) => s.effective_status !== 'done' || s.owner_id === currentUserId
  )
  const upcoming = visible.filter((s) => s.effective_status !== 'done')
  const past = visible.filter((s) => s.effective_status === 'done').slice(0, 6)

  return (
    <div className="space-y-3">
      <div className="text-[12.5px] text-muted-foreground">
        {upcoming.length} shoot{upcoming.length === 1 ? '' : 's'}
      </div>

      {upcoming.length === 0 && (
        <div className="rounded-xl border border-dashed border-border px-5 py-12 text-center space-y-2">
          <Clapperboard className="mx-auto h-8 w-8 text-muted-foreground" />
          <div className="text-[14px] font-medium">No upcoming shoots</div>
          <p className="text-[12.5px] text-muted-foreground">
            Create a shoot and reserve gear against it; anything double-booked or in repair gets
            flagged here before the shoot day.
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {upcoming.map((shoot) => (
          <ShootCard key={shoot.id} shoot={shoot} />
        ))}
      </div>

      {past.length > 0 && (
        <>
          <div className="pt-2 flex items-baseline gap-2">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
              Recently finished
            </span>
            <span className="text-[11px] text-muted-foreground">
              auto-archived a week after the last day
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {past.map((shoot) => (
              <ShootCard key={shoot.id} shoot={shoot} />
            ))}
          </div>
        </>
      )}

    </div>
  )
}

function ShootCard({ shoot }: { shoot: ShootSummary }) {
  return (
    <Link
      href={`/lockup/shoots/${shoot.id}`}
      className="group rounded-xl border border-border bg-card p-4 space-y-2.5 transition-colors hover:bg-accent/50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[15px] font-semibold leading-tight">{shoot.name}</div>
        <Badge variant={SHOOT_BADGE[shoot.effective_status]}>
          {SHOOT_STATUS_LABELS[shoot.effective_status]}
        </Badge>
      </div>

      <div className="space-y-1 text-[12.5px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" />
          {fmtShootWindow(shoot.starts_at, shoot.ends_at)}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {shoot.location && (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" /> {shoot.location}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" /> {shoot.owner_name}
          </span>
          <span>
            {shoot.reserved_count} reserved
            {shoot.picked_up_count > 0 && `, ${shoot.picked_up_count} picked up`}
          </span>
        </div>
        {shoot.studio_blocks.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Clapperboard className="h-3.5 w-3.5" />
            {shoot.studio_blocks
              .map((b) => `${b.studio_name} ${fmtDay(b.starts_at)}, ${fmtTime(b.starts_at)} to ${fmtTime(b.ends_at)}`)
              .join(' · ')}
          </div>
        )}
      </div>

      {shoot.conflict_count > 0 && (
        <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-rose-600">
          <AlertTriangle className="h-3.5 w-3.5" />
          {shoot.conflict_count} conflict{shoot.conflict_count === 1 ? '' : 's'}
        </div>
      )}

      <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}
