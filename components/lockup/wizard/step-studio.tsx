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
  slots,
  onSlotsChange,
}: {
  studios: Tables<'equipment_studios'>[]
  blocks: StudioScheduleEntry[]
  /** A shoot can hold several rooms, several days, or several windows a day. */
  slots: StudioSlot[]
  onSlotsChange: (slots: StudioSlot[]) => void
}) {
  const { pushToast } = useStore()
  const [studioId, setStudioId] = useState<string>(slots[0]?.studioId ?? studios[0]?.id ?? '')

  const slotKey = (sl: StudioSlot) => `${sl.studioId}|${sl.date}|${sl.startHM}`
  const replaceSlot = (target: StudioSlot, next: StudioSlot) =>
    onSlotsChange(slots.map((sl) => (slotKey(sl) === slotKey(target) ? next : sl)))
  const dropSlot = (target: StudioSlot) =>
    onSlotsChange(slots.filter((sl) => slotKey(sl) !== slotKey(target)))

  /** Your own slots for one studio+day — several are allowed. */
  const mySlotsFor = (sId: string, dayIso: string) =>
    slots.filter((sl) => sl.studioId === sId && sl.date === dayIso)

  /** Would [from,to) collide with another of YOUR slots in the same room? */
  function overlapsOwnSlot(
    sId: string,
    dayIso: string,
    fromMin: number,
    toMin: number,
    ignore?: StudioSlot
  ): boolean {
    return mySlotsFor(sId, dayIso).some(
      (sl) =>
        (!ignore || slotKey(sl) !== slotKey(ignore)) &&
        hmToMin(sl.startHM) < toMin &&
        hmToMin(sl.endHM) > fromMin
    )
  }
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

  // Switching rooms no longer discards what you booked: slots for every studio
  // are kept, and the grid just shows the room you are looking at.
  function selectStudio(sId: string) {
    setStudioId(sId)
  }

  function cellClick(dayIso: string, min: number) {
    if (!studioId) return
    if (isPast(dayIso, min + STEP)) return
    if (overlapsBlock(studioId, dayIso, min, min + STEP)) return

    const mine = mySlotsFor(studioId, dayIso)

    // Tapping inside one of your own slots edits that one.
    const hit = mine.find((sl) => hmToMin(sl.startHM) <= min && hmToMin(sl.endHM) > min)
    if (hit) {
      if (min === hmToMin(hit.startHM)) {
        dropSlot(hit) // tap the start again = remove this slot
        return
      }
      // Tapping later inside the slot trims it to end there.
      const candidate = min + STEP
      if (overlapsBlock(studioId, dayIso, hmToMin(hit.startHM), candidate)) {
        pushToast({ title: 'That would run into an existing booking.', variant: 'info' })
        return
      }
      replaceSlot(hit, { ...hit, endHM: minToHM(candidate) })
      return
    }

    // Fresh slot: default 2h, clamped by the next booking, your next own slot,
    // and closing time.
    const nextBlock = dayBlocksFor(studioId, dayIso)
      .filter((b) => b.startMin > min)
      .sort((a, b) => a.startMin - b.startMin)[0]
    const nextOwn = mine
      .filter((sl) => hmToMin(sl.startHM) > min)
      .sort((a, b) => hmToMin(a.startHM) - hmToMin(b.startHM))[0]
    const end = Math.min(
      min + 120,
      END_MIN,
      nextBlock ? nextBlock.startMin : Infinity,
      nextOwn ? hmToMin(nextOwn.startHM) : Infinity
    )
    if (end <= min) return
    onSlotsChange([
      ...slots,
      {
        studioId,
        date: dayIso,
        startHM: minToHM(min),
        endHM: minToHM(Math.max(end, min + STEP)),
      },
    ])
  }

  function setSlotTime(target: StudioSlot, kind: 'start' | 'end', hm: string) {
    const startMin = kind === 'start' ? hmToMin(hm) : hmToMin(target.startHM)
    const endMin = kind === 'end' ? hmToMin(hm) : hmToMin(target.endHM)
    if (endMin <= startMin) {
      pushToast({ title: 'The booking must end after it starts.', variant: 'info' })
      return
    }
    if (overlapsBlock(target.studioId, target.date, startMin, endMin)) {
      pushToast({ title: 'That time runs into an existing booking.', variant: 'info' })
      return
    }
    if (overlapsOwnSlot(target.studioId, target.date, startMin, endMin, target)) {
      pushToast({ title: 'That overlaps another of your slots in this room.', variant: 'info' })
      return
    }
    if (isPast(target.date, startMin)) {
      pushToast({ title: 'That time is already in the past.', variant: 'info' })
      return
    }
    replaceSlot(target, { ...target, startHM: minToHM(startMin), endHM: minToHM(endMin) })
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
              const daySlots = studioId ? mySlotsFor(studioId, d) : []
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

                  {daySlots.map((sl) => (
                    <div
                      key={slotKey(sl)}
                      className="pointer-events-none absolute inset-x-0.5 overflow-hidden rounded-md bg-primary px-1.5 py-0.5 text-[10.5px] font-semibold leading-tight text-primary-foreground"
                      style={{
                        top: ((hmToMin(sl.startHM) - START_MIN) / (END_MIN - START_MIN)) * GRID_PX,
                        height:
                          ((hmToMin(sl.endHM) - hmToMin(sl.startHM)) / (END_MIN - START_MIN)) *
                          GRID_PX,
                      }}
                    >
                      {slotLabel(sl.startHM)} to {slotLabel(sl.endHM)}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <p className="text-[12px] text-muted-foreground">
        Tap any free time to add a 2-hour slot; tap inside a slot to trim its end, or tap its
        start again to remove it. Book as many as you need: different rooms, different days, or
        several windows in one day. Fine-tune the exact times below.
      </p>

      {/* Every slot on this shoot, across all rooms */}
      {slots.length > 0 ? (
        <div className="space-y-2">
          <div className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">
            Studio slots on this shoot ({slots.length})
          </div>
          <ul className="space-y-2">
            {[...slots]
              .sort((a, b) =>
                `${a.date}T${a.startHM}`.localeCompare(`${b.date}T${b.startHM}`)
              )
              .map((sl) => {
                const room = studios.find((st) => st.id === sl.studioId)
                return (
                  <li
                    key={slotKey(sl)}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2"
                  >
                    <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                      <Clapperboard className="h-4 w-4 shrink-0 text-primary" />
                      {room?.name ?? 'Studio'}
                    </span>
                    <span className="text-[13px] text-muted-foreground">{dayLabel(sl.date)}</span>
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                      <Select
                        value={sl.startHM}
                        onValueChange={(v) => setSlotTime(sl, 'start', v)}
                      >
                        <SelectTrigger className="h-9 w-[116px]">
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
                      <Select value={sl.endHM} onValueChange={(v) => setSlotTime(sl, 'end', v)}>
                        <SelectTrigger className="h-9 w-[116px]">
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
                        aria-label="Remove this slot"
                        onClick={() => dropSlot(sl)}
                        className="rounded-full border border-border p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-rose-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                )
              })}
          </ul>
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          No studio slot yet. That is fine: outdoor shoots skip this step entirely.
        </p>
      )}
    </div>
  )
}
