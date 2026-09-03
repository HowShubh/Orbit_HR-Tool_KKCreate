'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// All days are local 'YYYY-MM-DD' strings; comparisons are plain string compares.

export function isoDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Booking-style selection: tap once for a single day, tap a later day to
 *  stretch it into a range, tap anywhere once a range exists to start over. */
export function nextRange(
  start: string,
  end: string,
  picked: string
): { start: string; end: string } {
  if (start !== end) return { start: picked, end: picked }
  if (picked < start) return { start: picked, end: picked }
  return { start, end: picked }
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

export function RangeCalendar({
  start,
  end,
  minDay,
  onPick,
}: {
  start: string
  end: string
  /** Days before this are disabled (struck through, not clickable). */
  minDay: string
  onPick: (dayIso: string) => void
}) {
  const [month, setMonth] = useState(() => {
    const s = parseDay(start)
    return new Date(s.getFullYear(), s.getMonth(), 1)
  })

  const todayIso = isoDay(new Date())
  const monthLabel = month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  const atMinMonth =
    month.getFullYear() === parseDay(minDay).getFullYear() &&
    month.getMonth() <= parseDay(minDay).getMonth()

  // Sunday-start grid covering the whole month, padded with adjacent-month days.
  const firstCell = new Date(month)
  firstCell.setDate(1 - month.getDay())
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const rows = Math.ceil((month.getDay() + daysInMonth) / 7)
  const cells: Date[] = []
  for (let i = 0; i < rows * 7; i++) {
    const d = new Date(firstCell)
    d.setDate(firstCell.getDate() + i)
    cells.push(d)
  }

  return (
    <div>
      <div className="flex items-center justify-between px-1 pb-2">
        <button
          type="button"
          aria-label="Previous month"
          disabled={atMinMonth}
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-[13.5px] font-semibold">{monthLabel}</div>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 pb-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center text-[11px] font-medium text-muted-foreground">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((d) => {
          const iso = isoDay(d)
          const outside = d.getMonth() !== month.getMonth()
          const past = iso < minDay
          const isStart = iso === start
          const isEnd = iso === end
          const inBand = start !== end && iso >= start && iso <= end
          return (
            <div
              key={iso}
              className={cn(
                'flex justify-center',
                inBand && 'bg-primary/10',
                inBand && isStart && 'rounded-l-full',
                inBand && isEnd && 'rounded-r-full'
              )}
            >
              <button
                type="button"
                disabled={past}
                onClick={() => onPick(iso)}
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full text-[13.5px] font-medium tabular-nums transition-colors',
                  past && 'cursor-not-allowed text-muted-foreground/30',
                  !past && outside && 'text-muted-foreground/50',
                  !past && !isStart && !isEnd && 'hover:bg-muted',
                  !past && iso === todayIso && !isStart && !isEnd && 'font-bold text-primary',
                  (isStart || isEnd) && 'bg-primary font-semibold text-primary-foreground'
                )}
              >
                {d.getDate()}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------- time slots ----------

function buildSlots(): string[] {
  const out: string[] = []
  for (let h = 0; h < 24; h++) for (const m of [0, 30]) out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  return out
}

export const START_SLOTS = buildSlots()
/** End of a shoot can also be "end of day". */
export const END_SLOTS = [...buildSlots(), '23:59']

export function slotLabel(hm: string): string {
  const [h, m] = hm.split(':').map(Number)
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
}

export function TimeSelect({
  label,
  slots,
  value,
  onChange,
}: {
  label: string
  slots: string[]
  value: string
  onChange: (hm: string) => void
}) {
  return (
    <label className="min-w-0 flex-1">
      <span className="mb-1.5 block text-[12px] font-medium text-muted-foreground">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-full appearance-none rounded-xl border border-input bg-card px-3 pr-9 text-[14px] font-semibold tabular-nums outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
        >
          {slots.map((s) => (
            <option key={s} value={s}>
              {slotLabel(s)}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    </label>
  )
}

export function TimeSlotColumn({
  label,
  slots,
  value,
  onChange,
}: {
  label: string
  slots: string[]
  value: string
  onChange: (hm: string) => void
}) {
  const listRef = useRef<HTMLDivElement>(null)

  // Keep the chosen chip centred without scrolling the whole dialog.
  useEffect(() => {
    const list = listRef.current
    const chip = list?.querySelector<HTMLButtonElement>(`[data-slot="${value}"]`)
    if (list && chip) {
      list.scrollTop = chip.offsetTop - list.clientHeight / 2 + chip.clientHeight / 2
    }
  }, [value, slots.length])

  return (
    <div className="min-w-0 flex-1">
      <div className="pb-1.5 text-[12px] font-medium text-muted-foreground">{label}</div>
      <div
        ref={listRef}
        className="relative h-40 space-y-1.5 overflow-y-auto rounded-xl border border-border p-1.5"
      >
        {slots.map((s) => (
          <button
            key={s}
            type="button"
            data-slot={s}
            onClick={() => onChange(s)}
            className={cn(
              'w-full rounded-full border px-2 py-1.5 text-[13px] tabular-nums transition-colors',
              s === value
                ? 'border-primary bg-primary font-semibold text-primary-foreground'
                : 'border-border hover:bg-muted'
            )}
          >
            {slotLabel(s)}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------- studio slot vocabulary ----------
// Lives here, not in the wizard, so the shared studio picker does not have to
// import the wizard (which imports the picker back).

/** One held studio window: a room, a day, and a start/end in that day. */
export type StudioSlot = {
  studioId: string
  /** YYYY-MM-DD (local). Slots are single-day. */
  date: string
  startHM: string
  endHM: string
}

export function dayLabel(iso: string): string {
  return parseDay(iso).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}
