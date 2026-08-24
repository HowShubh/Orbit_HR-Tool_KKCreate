'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Check, Clapperboard, Loader2, MapPin, Users } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { AvailabilityRow } from '@/lib/queries/lockup'
import type { GearWindow } from '@/lib/actions/lockup'
import { cn } from '@/lib/utils'
import { CodeChip } from '../item-bits'

export type ReviewLine = { label: string; sub?: string }

/** How long the gear is held for, relative to the shoot. */
export type GearTiming = 'whole_shoot' | 'studio_only' | 'custom'

/** The studio blocks, as absolute times, for the "only while in the studio" option. */
export type StudioSpan = { label: string; startsAt: string; endsAt: string }

/**
 * The last look before a shoot is created: the three steps laid out as three
 * sections, with every conflict stated plainly rather than left for the user
 * to discover on the shoot page afterwards.
 */
export function ReviewDialog({
  open,
  onOpenChange,
  name,
  windowLabel,
  editors,
  outsideAddress,
  studioLines,
  studioSpans,
  shootStartsAt,
  shootEndsAt,
  gear,
  busy,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  name: string
  windowLabel: string
  editors: string[]
  outsideAddress: string | null
  studioLines: string[]
  /** Studio blocks as absolute times, for "only while the studio is booked". */
  studioSpans: StudioSpan[]
  shootStartsAt: string
  shootEndsAt: string
  /** Chosen gear, each with the conflict (if any) computed for the window. */
  gear: AvailabilityRow[]
  busy: boolean
  onConfirm: (windows: GearWindow[]) => void
}) {
  const clashing = gear.filter((g) => g.conflict)
  const approvals = gear.filter((g) => g.requires_approval)

  const [timing, setTiming] = useState<GearTiming>('whole_shoot')
  // Per-item overrides, only consulted when timing is 'custom'.
  const [custom, setCustom] = useState<Record<string, { from: string; to: string }>>({})

  const studioSpan = useMemo(() => {
    if (studioSpans.length === 0) return null
    const from = studioSpans.reduce((a, b) => (a.startsAt < b.startsAt ? a : b)).startsAt
    const to = studioSpans.reduce((a, b) => (a.endsAt > b.endsAt ? a : b)).endsAt
    return { from, to }
  }, [studioSpans])

  const dayOptions = useMemo(() => buildDayOptions(shootStartsAt, shootEndsAt), [shootStartsAt, shootEndsAt])

  function windowsFor(): GearWindow[] {
    if (timing === 'whole_shoot') return []
    if (timing === 'studio_only') {
      if (!studioSpan) return []
      return gear.map((g) => ({ itemId: g.item_id, startsAt: studioSpan.from, endsAt: studioSpan.to }))
    }
    return gear.flatMap((g) => {
      const c = custom[g.item_id]
      if (!c) return []
      return [{ itemId: g.item_id, startsAt: c.from, endsAt: c.to }]
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review your plan</DialogTitle>
          <DialogDescription>
            Everything below is created in one go. You can change any of it afterwards.
          </DialogDescription>
        </DialogHeader>

        <Section n={1} label="Details">
          <div className="text-[14px] font-semibold text-foreground">{name.trim() || 'Unnamed shoot'}</div>
          <div>{windowLabel}</div>
          {editors.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> {editors.join(', ')}
            </div>
          )}
          {outsideAddress && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" /> {outsideAddress}
            </div>
          )}
        </Section>

        <Section n={2} label="Studio">
          {studioLines.length === 0 ? (
            <div className="text-muted-foreground/70">No studio booked for this shoot.</div>
          ) : (
            studioLines.map((line, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Clapperboard className="h-3.5 w-3.5" /> {line}
              </div>
            ))
          )}
        </Section>

        <Section n={3} label={`Gear (${gear.length})`}>
          {gear.length === 0 ? (
            <div className="text-muted-foreground/70">No gear reserved.</div>
          ) : (
            <ul className="space-y-1.5">
              {gear.map((g) => (
                <li
                  key={g.item_id}
                  className={cn(
                    'flex items-start gap-2 rounded-lg border px-2.5 py-1.5',
                    g.conflict ? 'border-rose-200 bg-rose-50' : 'border-border'
                  )}
                >
                  {g.conflict ? (
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
                  ) : (
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-semibold text-foreground">
                        {g.name}
                      </span>
                      <CodeChip code={g.code} />
                      {g.requires_approval && (
                        <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-px text-[10px] font-semibold text-amber-700">
                          approval
                        </span>
                      )}
                    </div>
                    {g.conflict && (
                      <div className="text-[11.5px] text-rose-700">{g.conflict.message}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {gear.length > 0 && (
          <section className="space-y-2 rounded-xl border border-border p-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              How long do you need the gear?
            </div>
            <TimingOption
              active={timing === 'whole_shoot'}
              onClick={() => setTiming('whole_shoot')}
              title="For the whole shoot"
              sub="Held from the shoot's start to its end. Simplest, and blocks the most."
            />
            <TimingOption
              active={timing === 'studio_only'}
              onClick={() => setTiming('studio_only')}
              title="Only while the studio is booked"
              sub={
                studioSpan
                  ? `Held ${fmtDateTime(studioSpan.from)} to ${fmtDateTime(studioSpan.to)}, freeing it for everyone else outside that.`
                  : 'No studio booked on this shoot, so there is no window to use.'
              }
              disabled={!studioSpan}
            />
            <TimingOption
              active={timing === 'custom'}
              onClick={() => setTiming('custom')}
              title="Set it per item"
              sub="Give each item its own start and end inside the shoot."
            />

            {timing === 'custom' && (
              <ul className="space-y-1.5 pt-1">
                {gear.map((g) => {
                  const c = custom[g.item_id]
                  return (
                    <li key={g.item_id} className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">
                        {g.name}
                      </span>
                      <select
                        value={c?.from ?? ''}
                        onChange={(e) =>
                          setCustom((prev) => ({
                            ...prev,
                            [g.item_id]: {
                              from: e.target.value,
                              to: prev[g.item_id]?.to ?? shootEndsAt,
                            },
                          }))
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
                          setCustom((prev) => ({
                            ...prev,
                            [g.item_id]: {
                              from: prev[g.item_id]?.from ?? shootStartsAt,
                              to: e.target.value,
                            },
                          }))
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
        )}

        {(clashing.length > 0 || approvals.length > 0) && (
          <div className="space-y-1.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-[12.5px] text-amber-800">
            {clashing.length > 0 && (
              <div>
                <span className="font-semibold">{clashing.length} clash</span>
                {clashing.length === 1 ? 'es' : ''} with something already booked. You can still
                reserve; whoever booked it first gets notified.
              </div>
            )}
            {approvals.length > 0 && (
              <div>
                <span className="font-semibold">{approvals.length} item</span>
                {approvals.length === 1 ? '' : 's'} need the Tech Lead to approve before pickup.
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Keep editing
          </Button>
          <Button type="button" className="flex-1" disabled={busy} onClick={() => onConfirm(windowsFor())}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Create shoot
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Section({
  n,
  label,
  children,
}: {
  n: number
  label: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-1.5 rounded-xl border border-border p-3">
      <div className="flex items-center gap-1.5">
        <span className="grid h-4 w-4 place-items-center rounded-full bg-primary/10 text-[9.5px] font-bold text-primary">
          {n}
        </span>
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="space-y-1 pl-[22px] text-[12.5px] text-muted-foreground">{children}</div>
    </section>
  )
}

function TimingOption({
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

function fmtDateTime(iso: string): string {
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
  // Guard against a silly window producing thousands of options.
  for (let i = 0; i < 200 && cursor <= end; i++) {
    out.push({ value: cursor.toISOString(), label: fmtDateTime(cursor.toISOString()) })
    cursor.setMinutes(cursor.getMinutes() + 30)
  }
  return out
}
