'use client'

import Link from 'next/link'
import { Clapperboard } from 'lucide-react'
import type { StudioScheduleEntry } from '@/lib/queries/lockup'
import { fmtTime } from './item-bits'

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  })
}

/**
 * Upcoming studio bookings grouped by day, shown above the shoot cards so
 * everyone can see when a studio is free before planning. (v2: a full
 * calendar grid with drag-to-select.)
 */
export function StudioSchedule({ entries }: { entries: StudioScheduleEntry[] }) {
  if (entries.length === 0) return null

  const byDay = new Map<string, StudioScheduleEntry[]>()
  for (const e of entries) {
    const key = dayLabel(e.starts_at)
    const list = byDay.get(key) ?? []
    list.push(e)
    byDay.set(key, list)
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-2.5">
      <div className="flex items-center gap-2 text-[13.5px] font-semibold">
        <Clapperboard className="h-4 w-4 text-muted-foreground" /> Studio schedule
      </div>
      <div className="space-y-2">
        {Array.from(byDay.entries()).map(([day, dayEntries]) => (
          <div key={day} className="flex flex-col sm:flex-row sm:gap-3 text-[12.5px]">
            <div className="w-24 shrink-0 font-medium text-muted-foreground">{day}</div>
            <ul className="flex-1 space-y-0.5">
              {dayEntries.map((e) => (
                <li key={e.id}>
                  <span className="font-medium">{e.studio_name}</span>{' '}
                  <span className="text-muted-foreground">
                    {fmtTime(e.starts_at)} to {fmtTime(e.ends_at)} ·{' '}
                  </span>
                  <Link
                    href={`/lockup/shoots/${e.shoot_id}`}
                    className="text-primary hover:underline"
                  >
                    {e.shoot_name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
