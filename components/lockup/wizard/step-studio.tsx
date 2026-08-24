'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Clapperboard, X } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useStore } from '@/lib/store'
import type { StudioScheduleEntry } from '@/lib/queries/lockup'
import type { Tables } from '@/lib/supabase/database.types'
import { cn } from '@/lib/utils'
import { isoDay, parseDay, slotLabel } from '../schedule-picker'
import { dayLabel, type StudioSlot } from './shoot-wizard'

// The grid shows 7:00 to 23:00 in 30-minute cells.
const START_MIN = 7 * 60
const END_MIN = 23 * 60
const STEP = 30
const ROWS = (END_MIN - START_MIN) / STEP
const CELL_PX = 14
const GRID_PX = ROWS * CELL_PX

function hmToMin(hm: string): number {
  const [h, m] = hm.split(':').map(Number)
  return h * 60 + m
}

function minToHM(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

/** Monday-start week containing (today + offset weeks). */
function weekDays(offset: number): string[] {
  const now = new Date()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7) + offset * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return isoDay(d)
  })
}

type DayBlock = { startMin: number; endMin: number; label: string }

export function StepStudio({
  studios,
  blocks,
  slot,
  onSlotChange,
}: {
  studios: Tables<'equipment_studios'>[]
  blocks: StudioScheduleEntry[]
  slot: StudioSlot | null
  onSlotChange: (slot: StudioSlot | null) => void
}) {
  const { pushToast } = useStore()
  const [studioId, setStudioId] = useState<string>(slot?.studioId ?? studios[0]?.id ?? '')
  const [weekOffset, setWeekOffset] = useState(0)

  const days = weekDays(weekOffset)
  const now = new Date()

  /** Blocks of one studio on one local day, clipped to the visible hours. */
  const dayBlocksFor = useMemo(() => {
    return (sId: string, dayIso: string): DayBlock[] => {
      const dayStart = parseDay(dayIso)
      const dayEnd = new Date(dayStart)
      dayEnd.setDate(dayEnd.getDate() + 1)
      return blocks
        .filter((b) => b.studio_id === sId)
        .flatMap((b) => {
          const s = new Date(b.starts_at)
          const e = new Date(b.ends_at)
          if (e <= dayStart || s >= dayEnd) return []
          const startMin = Math.max(
            START_MIN,
            s <= dayStart ? 0 : s.getHours() * 60 + s.getMinutes()
          )
          const endMin = Math.min(
            END_MIN,
            e >= dayEnd ? 24 * 60 : e.getHours() * 60 + e.getMinutes()
          )
          if (endMin <= startMin) return []
          return [{ startMin, endMin, label: b.shoot_name }]
        })
    }
  }, [blocks])

  function overlapsBlock(sId: string, dayIso: string, fromMin: number, toMin: number): boolean {
    return dayBlocksFor(sId, dayIso).some((b) => b.startMin < toMin && b.endMin > fromMin)
  }

  function isPast(dayIso: string, min: number): boolean {
    const d = parseDay(dayIso)
    d.setMinutes(min)
    return d <= now
  }

  /** One-line live hint for a studio card, from today's bookings. */
  function studioHint(sId: string): string {
    const today = isoDay(now)
    const nowMin = now.getHours() * 60 + now.getMinutes()
    const todays = dayBlocksFor(sId, today).sort((a, b) => a.startMin - b.startMin)
    const current = todays.find((b) => b.startMin <= nowMin && b.endMin > nowMin)
    if (current) {
      return current.endMin >= END_MIN
        ? 'busy for the rest of today'
        : `free today after ${slotLabel(minToHM(current.endMin))}`
    }
    const next = todays.find((b) => b.startMin > nowMin)
    if (next) return `free til ${slotLabel(minToHM(next.startMin))}`
    return 'free today'
  }

  function selectStudio(sId: string) {
    setStudioId(sId)
    if (slot && slot.studioId !== sId) onSlotChange(null)
  }

  function cellClick(dayIso: string, min: number) {
    if (!studioId) return
    if (isPast(dayIso, min + STEP)) return
    if (overlapsBlock(studioId, dayIso, min, min + STEP)) return

    const active = slot && slot.studioId === studioId && slot.date === dayIso ? slot : null
    if (active) {
      const startMin = hmToMin(active.startHM)
      if (min === startMin) {
        onSlotChange(null) // tap the start again = clear
        return
      }
      if (min > startMin) {
        // extend or trim the end
        const candidate = min + STEP
        if (overlapsBlock(studioId, dayIso, startMin, candidate)) {
          pushToast({ title: 'That would run into an existing booking.', variant: 'info' })
          return
        }
        onSlotChange({ ...active, endHM: minToHM(candidate) })
        return
      }
    }
    // fresh start: default 2h, clamped to the next booking and closing time
    const nextBlock = dayBlocksFor(studioId, dayIso)
      .filter((b) => b.startMin > min)
      .sort((a, b) => a.startMin - b.startMin)[0]
    const end = Math.min(min + 120, END_MIN, nextBlock ? nextBlock.startMin : Infinity)
    onSlotChange({
      studioId,
      date: dayIso,
      startHM: minToHM(min),
      endHM: minToHM(Math.max(end, min + STEP)),
    })
  }

  function setSlotTime(kind: 'start' | 'end', hm: string) {
    if (!slot) return
    const startMin = kind === 'start' ? hmToMin(hm) : hmToMin(slot.startHM)
    const endMin = kind === 'end' ? hmToMin(hm) : hmToMin(slot.endHM)
    if (endMin <= startMin) {
      pushToast({ title: 'The booking must end after it starts.', variant: 'info' })
      return
    }
    if (overlapsBlock(slot.studioId, slot.date, startMin, endMin)) {
      pushToast({ title: 'That time runs into an existing booking.', variant: 'info' })
      return
    }
    if (isPast(slot.date, startMin)) {
      pushToast({ title: 'That time is already in the past.', variant: 'info' })
      return
    }
    onSlotChange({ ...slot, startHM: minToHM(startMin), endHM: minToHM(endMin) })
  }

  if (studios.length === 0) {
    return (
      <p className="text-[13px] text-muted-foreground">
        No studios are set up yet. The tech lead can add them in the Tech Console. You can still
        submit the shoot without a studio.
      </p>
    )
  }

  const fifteenSteps: string[] = []
  for (let m = START_MIN; m <= END_MIN; m += 15) fifteenSteps.push(minToHM(m))

  const weekLabel = `${dayLabel(days[0])} to ${dayLabel(days[6])}`

  return (
    <div className="space-y-4">
      {/* Studio cards */}
      <div className="grid gap-2 sm:grid-cols-2">
        {studios.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => selectStudio(s.id)}
            className={cn(
              'rounded-xl border p-3 text-left transition-colors',
              studioId === s.id
                ? 'border-primary bg-primary/5'
                : 'border-border hover:bg-muted'
            )}
          >
            <div className="flex items-center gap-2 text-[14px] font-semibold">
              <span
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded-full border',
                  studioId === s.id ? 'border-primary' : 'border-muted-foreground/40'
                )}
              >
                {studioId === s.id && <span className="h-2 w-2 rounded-full bg-primary" />}
              </span>
              {s.name}
            </div>
            <div className="mt-0.5 pl-6 text-[12.5px] text-muted-foreground">
              {studioHint(s.id)}
            </div>
          </button>
        ))}
      </div>

      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous week"
          disabled={weekOffset === 0}
          onClick={() => setWeekOffset((w) => w - 1)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-[13px] font-semibold">{weekLabel}</div>
        <button
          type="button"
          aria-label="Next week"
          onClick={() => setWeekOffset((w) => w + 1)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Week grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="grid" style={{ gridTemplateColumns: '44px repeat(7, 1fr)' }}>
            <div />
            {days.map((d) => {
              const date = parseDay(d)
              const isToday = d === isoDay(now)
              return (
                <div key={d} className="pb-1 text-center">
                  <div
                    className={cn(
                      'text-[11.5px] font-medium',
                      isToday ? 'text-primary' : 'text-muted-foreground'
                    )}
                  >
                    {date.toLocaleDateString('en-IN', { weekday: 'short' })}
                  </div>
                  <div className={cn('text-[12.5px]', isToday && 'font-bold text-primary')}>
                    {date.getDate()}
                  </div>
                </div>
              )
            })}

            {/* hour gutter */}
            <div className="relative" style={{ height: GRID_PX }}>
              {Array.from({ length: (END_MIN - START_MIN) / 120 + 1 }, (_, i) => {
                const min = START_MIN + i * 120
                if (min > END_MIN) return null
                return (
                  <div
                    key={min}
                    className="absolute right-1.5 -translate-y-1/2 text-[10.5px] text-muted-foreground"
                    style={{ top: ((min - START_MIN) / (END_MIN - START_MIN)) * GRID_PX }}
                  >
                    {slotLabel(minToHM(min)).replace(':00', '')}
                  </div>
                )
              })}
            </div>

            {days.map((d) => {
              const dayBlocks = studioId ? dayBlocksFor(studioId, d) : []
              const daySlot =
                slot && slot.studioId === studioId && slot.date === d ? slot : null
              return (
                <div
                  key={d}
                  className="relative border-l border-border"
                  style={{ height: GRID_PX }}
                >
                  {Array.from({ length: ROWS }, (_, i) => {
                    const min = START_MIN + i * STEP
                    const past = isPast(d, min + STEP)
                    const busy = dayBlocks.some((b) => b.startMin < min + STEP && b.endMin > min)
                    return (
                      <div
                        key={min}
                        onClick={() => cellClick(d, min)}
                        className={cn(
                          'border-b border-border/40',
                          min % 60 === 0 && 'border-b-border/70',
                          past
                            ? 'bg-muted/40'
                            : busy
                              ? ''
                              : 'cursor-pointer hover:bg-primary/10'
                        )}
                        style={{ height: CELL_PX }}
                      />
                    )
                  })}

                  {dayBlocks.map((b, i) => (
                    <div
                      key={i}
                      className="pointer-events-none absolute inset-x-0.5 overflow-hidden rounded-md bg-rose-500/15 px-1.5 py-0.5 text-[10.5px] font-medium leading-tight text-rose-600"
                      style={{
                        top: ((b.startMin - START_MIN) / (END_MIN - START_MIN)) * GRID_PX,
                        height: ((b.endMin - b.startMin) / (END_MIN - START_MIN)) * GRID_PX,
                      }}
                      title={b.label}
                    >
                      {b.label}
                    </div>
                  ))}

                  {daySlot && (
                    <div
                      className="pointer-events-none absolute inset-x-0.5 overflow-hidden rounded-md bg-primary px-1.5 py-0.5 text-[10.5px] font-semibold leading-tight text-primary-foreground"
                      style={{
                        top:
                          ((hmToMin(daySlot.startHM) - START_MIN) / (END_MIN - START_MIN)) *
                          GRID_PX,
                        height:
                          ((hmToMin(daySlot.endHM) - hmToMin(daySlot.startHM)) /
                            (END_MIN - START_MIN)) *
                          GRID_PX,
                      }}
                    >
                      {slotLabel(daySlot.startHM)} to {slotLabel(daySlot.endHM)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <p className="text-[12px] text-muted-foreground">
        Tap a free slot to book about 2 hours; tap a later slot to stretch or shrink the end; tap
        the start again to clear. Fine-tune below.
      </p>

      {/* Fine-tune row */}
      {slot && slot.studioId === studioId ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-[13px] font-medium">
            <Clapperboard className="h-4 w-4 text-primary" />
            {dayLabel(slot.date)}
          </span>
          <Select value={slot.startHM} onValueChange={(v) => setSlotTime('start', v)}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fifteenSteps.slice(0, -1).map((hm) => (
                <SelectItem key={hm} value={hm}>
                  {slotLabel(hm)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-[13px] text-muted-foreground">to</span>
          <Select value={slot.endHM} onValueChange={(v) => setSlotTime('end', v)}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fifteenSteps.slice(1).map((hm) => (
                <SelectItem key={hm} value={hm}>
                  {slotLabel(hm)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={() => onSlotChange(null)}
            className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[12.5px] text-muted-foreground hover:bg-muted"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          No studio slot selected. That is fine: outdoor shoots skip this step entirely.
        </p>
      )}
    </div>
  )
}
