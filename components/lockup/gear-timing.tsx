'use client'

import { useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import type { GearWindow } from '@/lib/actions/lockup'
import { cn } from '@/lib/utils'

export type GearTiming = 'whole_shoot' | 'studio_only' | 'custom'
/** A studio block as absolute times, for "only while the studio is booked". */
export type StudioSpan = { startsAt: string; endsAt: string }

export type TimingResult = {
  /** null until the person picks one; callers keep their action disabled. */
  timing: GearTiming | null
  windows: GearWindow[]
}

/**
 * "How long do you need the gear?" — the three-way choice shared by the shoot
 * wizard's review step and the shoot page's Add-gear dialog. Nothing is
 * pre-selected: a hold this long has to be a deliberate answer, so the caller
 * keeps its confirm button off until `timing` is non-null.
 */
export function GearTimingChooser({
  gear,
  studioSpans,
  shootStartsAt,
  shootEndsAt,
  onChange,
}: {
  gear: { item_id: string; name: string }[]
  studioSpans: StudioSpan[]
  shootStartsAt: string
  shootEndsAt: string
  onChange: (result: TimingResult) => void
}) {
  const [timing, setTiming] = useState<GearTiming | null>(null)
  const [custom, setCustom] = useState<Record<string, { from: string; to: string }>>({})

  const studioSpan = useMemo(() => {
    if (studioSpans.length === 0) return null
    const from = studioSpans.reduce((a, b) => (a.startsAt < b.startsAt ? a : b)).startsAt
    const to = studioSpans.reduce((a, b) => (a.endsAt > b.endsAt ? a : b)).endsAt
    return { from, to }
  }, [studioSpans])

  const dayOptions = useMemo(
    () => buildDayOptions(shootStartsAt, shootEndsAt),
    [shootStartsAt, shootEndsAt]
  )

  function windowsFor(t: GearTiming, c: typeof custom): GearWindow[] {
    if (t === 'whole_shoot') return []
    if (t === 'studio_only') {
      if (!studioSpan) return []
      return gear.map((g) => ({ itemId: g.item_id, startsAt: studioSpan.from, endsAt: studioSpan.to }))
    }
    return gear.flatMap((g) => {
      const w = c[g.item_id]
      return w?.from && w?.to ? [{ itemId: g.item_id, startsAt: w.from, endsAt: w.to }] : []
    })
  }

  function pick(t: GearTiming) {
    setTiming(t)
    onChange({ timing: t, windows: windowsFor(t, custom) })
  }
  function setItemWindow(itemId: string, next: { from: string; to: string }) {
    setCustom((prev) => {
      const merged = { ...prev, [itemId]: next }
      if (timing === 'custom') onChange({ timing, windows: windowsFor('custom', merged) })
      return merged
    })
  }

  return (
    <section className="space-y-2 rounded-xl border border-border p-3">
      <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        How long do you need the gear?
      </div>

      <Option
        active={timing === 'whole_shoot'}
        onClick={() => pick('whole_shoot')}
        title="For the whole shoot"
        sub="Held from the shoot's start to its end. Simplest, and blocks the most."
      />
      <Option
        active={timing === 'studio_only'}
        onClick={() => pick('studio_only')}
        title="Only while the studio is booked"
        sub={
          studioSpan
            ? `Held ${fmtDateTime(studioSpan.from)} to ${fmtDateTime(studioSpan.to)}, freeing it for everyone else outside that.`
            : 'No studio booked on this shoot, so there is no window to use.'
        }
        disabled={!studioSpan}
      />
      <Option
        active={timing === 'custom'}
        onClick={() => pick('custom')}
        title="Set it per item"
        sub="Give each item its own start and end inside the shoot."
      />

      {timing === 'custom' && (
        <ul className="space-y-1.5 pt-1">
          {gear.map((g) => {
            const c = custom[g.item_id]
            return (
              <li key={g.item_id} className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{g.name}</span>
                <select
                  value={c?.from ?? ''}
                  onChange={(e) =>
                    setItemWindow(g.item_id, { from: e.target.value, to: c?.to ?? shootEndsAt })
                  }
                  className="h-8 rounded-lg border border-input bg-card px-2 text-[12px]"
                >
                  <option value="">whole shoot</option>
                  {dayOptions.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
                <span className="text-[12px] text-muted-foreground">to</span>
                <select
                  value={c?.to ?? ''}
                  onChange={(e) =>
                    setItemWindow(g.item_id, { from: c?.from ?? shootStartsAt, to: e.target.value })
                  }
                  className="h-8 rounded-lg border border-input bg-card px-2 text-[12px]"
                >
                  <option value="">whole shoot</option>
                  {dayOptions.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </li>
            )
          })}
          <li className="text-[11.5px] text-muted-foreground">
            Anything left on &ldquo;whole shoot&rdquo; is held for the full window.
          </li>
        </ul>
      )}
    </section>
  )
}

function Option({
  active,
  disabled,
  onClick,
  title,
  sub,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  title: string
  sub: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors',
        disabled
          ? 'cursor-not-allowed border-border opacity-50'
          : active
            ? 'border-primary bg-primary/10'
            : 'border-border hover:bg-accent'
      )}
    >
      <span
        className={cn(
          'mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-[1.5px]',
          active ? 'border-primary bg-primary' : 'border-muted-foreground/40'
        )}
      >
        {active && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-foreground">{title}</span>
        <span className="block text-[11.5px] text-muted-foreground">{sub}</span>
      </span>
    </button>
  )
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

/** Half-hour marks across the shoot, so a per-item window is picked from the
 *  shoot's own days rather than a free-floating date field. */
function buildDayOptions(startsAt: string, endsAt: string): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = []
  const cursor = new Date(startsAt)
  const end = new Date(endsAt)
  for (let i = 0; i < 200 && cursor <= end; i++) {
    out.push({ value: cursor.toISOString(), label: fmtDateTime(cursor.toISOString()) })
    cursor.setMinutes(cursor.getMinutes() + 30)
  }
  return out
}
