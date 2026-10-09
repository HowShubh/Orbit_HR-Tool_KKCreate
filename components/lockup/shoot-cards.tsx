'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

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
  const [view, setView] = useState<'upcoming' | 'past' | 'mine'>('upcoming')

  // Finished shoots are NOT owner-only any more: knowing what was shot last
  // week, and who had the gear, is exactly what people were missing.
  const upcoming = shoots.filter((s) => s.effective_status !== 'done')
  const past = shoots.filter((s) => s.effective_status === 'done')
  const mine = shoots.filter(
    (s) => s.owner_id === currentUserId || s.effective_status !== 'done'
  ).filter((s) => s.owner_id === currentUserId)

  const shown = view === 'upcoming' ? upcoming : view === 'past' ? past : mine

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Tab active={view === 'upcoming'} onClick={() => setView('upcoming')} count={upcoming.length}>
          Upcoming
        </Tab>
        <Tab active={view === 'mine'} onClick={() => setView('mine')} count={mine.length}>
          Mine
        </Tab>
        <Tab active={view === 'past'} onClick={() => setView('past')} count={past.length}>
          Finished
        </Tab>
      </div>

      {shown.length === 0 && (
        <div className="space-y-2 rounded-xl border border-dashed border-border px-5 py-12 text-center">
          <Clapperboard className="mx-auto h-8 w-8 text-muted-foreground" />
          <div className="text-[14px] font-medium">
            {view === 'past'
              ? 'Nothing finished in the last three months'
              : view === 'mine'
                ? 'You have not planned a shoot yet'
                : 'No upcoming shoots'}
          </div>
          <p className="text-[12.5px] text-muted-foreground">
            {view === 'past'
              ? 'Finished shoots stay here for three months. Older ones keep their gear history on each item page.'
              : 'Create a shoot and reserve gear against it; anything double-booked or in repair gets flagged here before the shoot day.'}
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {shown.map((shoot) => (
          <ShootCard key={shoot.id} shoot={shoot} />
        ))}
      </div>

      {view === 'past' && past.length > 0 && (
        <p className="pt-1 text-center text-[11.5px] text-muted-foreground">
          Showing the last three months. Anything older is still reachable from an item&apos;s
          timeline.
        </p>
      )}
    </div>
  )
}

function Tab({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean
  onClick: () => void
  count: number
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-input bg-card hover:bg-accent'
      )}
    >
      {children}
      <span className={cn('text-[12px]', active ? 'opacity-80' : 'text-muted-foreground')}>
        {count}
      </span>
    </button>
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
