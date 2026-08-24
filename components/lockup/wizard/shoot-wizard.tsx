'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useStore } from '@/lib/store'
import { createShootPlan, fetchWindowAvailability } from '@/lib/actions/lockup'
import type { AvailabilityRow, KitRow, StudioScheduleEntry } from '@/lib/queries/lockup'
import type { Tables } from '@/lib/supabase/database.types'
import { cn } from '@/lib/utils'
import { isoDay, parseDay, slotLabel } from '../schedule-picker'
import { StepDetails } from './step-details'
import { StepStudio } from './step-studio'
import { StepGear, groupGear } from './step-gear'

export type Person = { id: string; full_name: string }

export type StudioSlot = {
  studioId: string
  /** YYYY-MM-DD (local). Studio slots are single-day in the wizard. */
  date: string
  startHM: string
  endHM: string
}

function todayInput(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return isoDay(d)
}

export function dayLabel(iso: string): string {
  return parseDay(iso).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

const STEPS = [
  { n: 1, label: 'Details' },
  { n: 2, label: 'Studio' },
  { n: 3, label: 'Gear' },
] as const

export function ShootWizard({
  studios,
  blocks,
  kits,
  people,
  startAtStudio,
  initialAvailability = null,
}: {
  studios: Tables<'equipment_studios'>[]
  blocks: StudioScheduleEntry[]
  kits: KitRow[]
  people: Person[]
  startAtStudio: boolean
  /** Pre-seeded gear rows (testing/harness); skips the first availability fetch. */
  initialAvailability?: AvailabilityRow[] | null
}) {
  const router = useRouter()
  const { pushToast } = useStore()

  const [step, setStep] = useState<1 | 2 | 3>(startAtStudio && studios.length > 0 ? 2 : 1)
  const [busy, setBusy] = useState(false)

  // ---- step 1: details ----
  const [name, setName] = useState('')
  const autoNamed = useRef(startAtStudio) // Book-studio doorway auto-names until the user types
  const [locationType, setLocationType] = useState<'studio' | 'outside'>('studio')
  const [outsideAddress, setOutsideAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [editorIds, setEditorIds] = useState<string[]>([])

  // ---- shoot window (never absent; defaults to tomorrow 10 to 6) ----
  const [startDate, setStartDate] = useState(todayInput(1))
  const [startTime, setStartTime] = useState('10:00')
  const [endDate, setEndDate] = useState(todayInput(1))
  const [endTime, setEndTime] = useState('18:00')
  const windowTouched = useRef(false)

  // ---- step 2: studio ----
  const [slot, setSlot] = useState<StudioSlot | null>(null)

  // ---- step 3: gear ----
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [availability, setAvailability] = useState<AvailabilityRow[] | null>(initialAvailability)
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const loadedWindowKey = useRef<string | null>(initialAvailability ? 'seeded' : null)

  const startsAtIso = new Date(`${startDate}T${startTime}`).toISOString()
  const endsAtIso = new Date(`${endDate}T${endTime}`).toISOString()
  const windowValid = new Date(endsAtIso) > new Date(startsAtIso)

  function handleSlotChange(next: StudioSlot | null) {
    setSlot(next)
    if (next) {
      // The shoot window adopts the studio slot unless the user set it themselves.
      if (!windowTouched.current) {
        setStartDate(next.date)
        setEndDate(next.date)
        setStartTime(next.startHM)
        setEndTime(next.endHM === '23:59' ? '23:59' : next.endHM)
      }
      // The Book-studio doorway names the shoot after the slot until edited.
      if (autoNamed.current && (name.trim() === '' || name.startsWith('Studio hold'))) {
        setName(`Studio hold - ${dayLabel(next.date)}`)
      }
    }
  }

  function handleWindowChange(next: {
    startDate: string
    startTime: string
    endDate: string
    endTime: string
  }) {
    windowTouched.current = true
    setStartDate(next.startDate)
    setStartTime(next.startTime)
    setEndDate(next.endDate)
    setEndTime(next.endTime)
  }

  // Availability loads when the gear step is opened (and reloads if the
  // window changed since the last fetch).
  useEffect(() => {
    if (step !== 3 || !windowValid) return
    const key = `${startsAtIso}|${endsAtIso}`
    if (loadedWindowKey.current === key || loadedWindowKey.current === 'seeded') return
    let cancelled = false
    setAvailabilityLoading(true)
    fetchWindowAvailability(startsAtIso, endsAtIso)
      .then((rows) => {
        if (cancelled) return
        loadedWindowKey.current = key
        setAvailability(rows)
      })
      .catch(() => {
        if (!cancelled) pushToast({ title: 'Could not load gear availability', variant: 'error' })
      })
      .finally(() => {
        if (!cancelled) setAvailabilityLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [step, startsAtIso, endsAtIso, windowValid, pushToast])

  const availabilityById = useMemo(
    () => new Map((availability ?? []).map((r) => [r.item_id, r])),
    [availability]
  )
  const selectedRows = selectedIds
    .map((id) => availabilityById.get(id))
    .filter(Boolean) as AvailabilityRow[]
  const selectedGroups = groupGear(selectedRows)
  const approvalCount = selectedRows.filter((r) => r.requires_approval).length

  const toggleItem = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }, [])

  /** Add a kit's members: hard-unavailable ones are skipped with a notice. */
  function addKit(kit: KitRow) {
    const skipped: string[] = []
    const added: string[] = []
    for (const member of kit.items) {
      const row = availabilityById.get(member.item_id)
      if (!row) continue
      const hardBlocked =
        row.conflict &&
        (row.conflict.kind === 'in_repair' ||
          row.conflict.kind === 'still_out' ||
          row.conflict.kind === 'unavailable')
      if (hardBlocked) {
        skipped.push(`${member.name}: ${row.conflict!.message}`)
        continue
      }
      added.push(member.item_id)
    }
    setSelectedIds((prev) => Array.from(new Set([...prev, ...added])))
    if (skipped.length > 0) {
      pushToast({
        title: `Skipped ${skipped.length} item(s) from ${kit.name}`,
        body: skipped.join(' · '),
        variant: 'info',
      })
    } else if (added.length > 0) {
      pushToast({ title: `${kit.name} added`, variant: 'success' })
    }
  }

  const canSubmit = name.trim().length > 0 && windowValid && !busy

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    try {
      const result = await createShootPlan({
        name,
        location: locationType === 'outside' ? outsideAddress || undefined : undefined,
        notes: notes || undefined,
        startsAt: startsAtIso,
        endsAt: endsAtIso,
        editorIds,
        studio: slot
          ? {
              studioId: slot.studioId,
              startsAt: new Date(`${slot.date}T${slot.startHM}`).toISOString(),
              endsAt: new Date(`${slot.date}T${slot.endHM}`).toISOString(),
            }
          : undefined,
        itemIds: selectedIds,
      })
      const bits: string[] = []
      if (slot) bits.push('studio booked')
      if (result.reserved > 0) bits.push(`${result.reserved} item(s) reserved`)
      if (result.pendingApproval > 0)
        bits.push(`${result.pendingApproval} awaiting tech lead approval`)
      pushToast({
        title: `${name.trim()} planned`,
        body: bits.length > 0 ? bits.join(' · ') : 'Add gear or a studio any time.',
        variant: 'success',
      })
      router.push(`/lockup/shoots/${result.shootId}`)
      router.refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not create the shoot'
      pushToast({ title: message, variant: 'error' })
      // A studio clash sends the user back to pick a different slot.
      if (message.includes('booked')) setStep(2)
      setBusy(false)
    }
  }

  const windowLabel =
    startDate === endDate
      ? `${dayLabel(startDate)}, ${slotLabel(startTime)} to ${slotLabel(endTime)}`
      : `${dayLabel(startDate)}, ${slotLabel(startTime)} to ${dayLabel(endDate)}, ${slotLabel(endTime)}`
  const studioName = slot ? studios.find((s) => s.id === slot.studioId)?.name ?? 'Studio' : null

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link
        href="/lockup?tab=shoots"
        className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All shoots
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">New shoot</h1>
          <p className="text-[13px] text-muted-foreground">
            Everything after the name is optional. Submit at any step; add the rest later.
          </p>
        </div>
        {/* Step chips */}
        <div className="flex items-center gap-1.5">
          {STEPS.map((s) => {
            const done =
              (s.n === 1 && name.trim().length > 0 && step > 1) ||
              (s.n === 2 && !!slot && step > 2)
            return (
              <button
                key={s.n}
                type="button"
                onClick={() => setStep(s.n as 1 | 2 | 3)}
                className={cn(
                  'flex items-center gap-1 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors',
                  step === s.n
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border hover:bg-muted'
                )}
              >
                {s.n}. {s.label}
                {done && <Check className="h-3 w-3" />}
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_270px]">
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            {step === 1 && (
              <StepDetails
                name={name}
                onNameChange={(v) => {
                  autoNamed.current = false
                  setName(v)
                }}
                locationType={locationType}
                onLocationTypeChange={setLocationType}
                outsideAddress={outsideAddress}
                onOutsideAddressChange={setOutsideAddress}
                notes={notes}
                onNotesChange={setNotes}
                editorIds={editorIds}
                onEditorIdsChange={setEditorIds}
                people={people}
                window={{ startDate, startTime, endDate, endTime }}
                onWindowChange={handleWindowChange}
                windowAdoptedFromStudio={!windowTouched.current && !!slot}
              />
            )}
            {step === 2 && (
              <StepStudio studios={studios} blocks={blocks} slot={slot} onSlotChange={handleSlotChange} />
            )}
            {step === 3 && (
              <StepGear
                availability={availability}
                loading={availabilityLoading}
                kits={kits}
                selectedIds={selectedIds}
                onToggle={toggleItem}
                onAddKit={addKit}
              />
            )}
          </div>

          {/* Step navigation */}
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={step === 1 || busy}
              onClick={() => setStep((s) => (s === 3 ? 2 : 1))}
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            {step < 3 ? (
              <Button type="button" disabled={busy} onClick={() => setStep((s) => (s === 1 ? 2 : 3))}>
                Next: {step === 1 ? 'Studio' : 'Gear'} <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button type="button" disabled={!canSubmit} onClick={submit}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Create shoot
              </Button>
            )}
          </div>
        </div>

        {/* Selected rail */}
        <aside className="h-fit rounded-xl border border-border bg-card p-4 lg:sticky lg:top-4">
          <div className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            Selected ({selectedGroups.length})
          </div>

          <div className="mt-2 space-y-1.5 text-[13px]">
            <div className="font-medium">{name.trim() || 'Unnamed shoot'}</div>
            <div className="text-muted-foreground">{windowLabel}</div>
            {studioName && slot && (
              <div className="text-muted-foreground">
                {studioName} · {dayLabel(slot.date)}, {slotLabel(slot.startHM)} to{' '}
                {slotLabel(slot.endHM)}
              </div>
            )}
            {locationType === 'outside' && outsideAddress.trim() && (
              <div className="text-muted-foreground">Outside: {outsideAddress.trim()}</div>
            )}
          </div>

          {selectedGroups.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {selectedGroups.map((g) => (
                <li
                  key={g.key}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5 text-[13px]"
                >
                  <span className="truncate">
                    {g.name}
                    {g.units.length > 1 && (
                      <span className="ml-1 font-semibold text-muted-foreground">
                        ×{g.units.length}
                      </span>
                    )}
                    {g.requires_approval && (
                      <span className="ml-1.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10.5px] font-medium text-amber-600">
                        approval
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${g.name}`}
                    onClick={() =>
                      setSelectedIds((prev) =>
                        prev.filter((id) => !g.units.some((u) => u.item_id === id))
                      )
                    }
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-3 rounded-lg border border-dashed border-border px-3 py-2 text-[12.5px] text-muted-foreground">
              no gear yet
            </div>
          )}

          {approvalCount > 0 && (
            <div className="mt-3 rounded-lg bg-amber-500/15 px-3 py-1.5 text-[12.5px] font-medium text-amber-600">
              {approvalCount} approval{approvalCount > 1 ? 's' : ''} needed
            </div>
          )}

          <Button type="button" className="mt-4 w-full" disabled={!canSubmit} onClick={submit}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Create shoot
          </Button>
          <p className="mt-2 text-center text-[11.5px] text-muted-foreground">
            {name.trim() ? 'Submit any time; skip what you like.' : 'Name the shoot to submit.'}
          </p>
        </aside>
      </div>
    </div>
  )
}
