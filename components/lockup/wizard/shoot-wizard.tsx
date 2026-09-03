'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useStore } from '@/lib/store'
import { createShootPlan, fetchWindowAvailability, type GearWindow } from '@/lib/actions/lockup'
import type { AvailabilityRow, KitRow, StudioScheduleEntry } from '@/lib/queries/lockup'
import type { Tables } from '@/lib/supabase/database.types'
import { cn } from '@/lib/utils'
import { dayLabel, isoDay, parseDay, slotLabel, type StudioSlot } from '../schedule-picker'
import { StepDetails } from './step-details'
import { StepStudio } from './step-studio'
import { StepGear, groupGear } from './step-gear'
import { ReviewDialog } from './review-dialog'

export type Person = { id: string; full_name: string }

export type { StudioSlot } from '../schedule-picker'
export { dayLabel } from '../schedule-picker'

function todayInput(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return isoDay(d)
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
  // A shoot may hold several slots: different rooms, different days, or more
  // than one window on the same day.
  const [slots, setSlots] = useState<StudioSlot[]>([])

  // ---- step 3: gear ----
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [reviewOpen, setReviewOpen] = useState(false)
  const [availability, setAvailability] = useState<AvailabilityRow[] | null>(initialAvailability)
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const loadedWindowKey = useRef<string | null>(initialAvailability ? 'seeded' : null)

  const startsAtIso = new Date(`${startDate}T${startTime}`).toISOString()
  const endsAtIso = new Date(`${endDate}T${endTime}`).toISOString()
  const windowValid = new Date(endsAtIso) > new Date(startsAtIso)

  function handleSlotsChange(next: StudioSlot[]) {
    setSlots(next)
    if (next.length === 0) return

    // The shoot window spans every slot, unless the user set it themselves.
    if (!windowTouched.current) {
      const sorted = [...next].sort((a, b) =>
        `${a.date}T${a.startHM}`.localeCompare(`${b.date}T${b.startHM}`)
      )
      const first = sorted[0]
      const last = sorted.reduce((acc, s) =>
        `${s.date}T${s.endHM}` > `${acc.date}T${acc.endHM}` ? s : acc
      )
      setStartDate(first.date)
      setStartTime(first.startHM)
      setEndDate(last.date)
      setEndTime(last.endHM)
    }
    // The Book-studio doorway names the shoot after the first slot until edited.
    if (autoNamed.current && (name.trim() === '' || name.startsWith('Studio hold'))) {
      setName(`Studio hold - ${dayLabel(next[0].date)}`)
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

  async function submit(gearWindows: GearWindow[] = []) {
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
        studios: slots.map((sl) => ({
          studioId: sl.studioId,
          startsAt: new Date(`${sl.date}T${sl.startHM}`).toISOString(),
          endsAt: new Date(`${sl.date}T${sl.endHM}`).toISOString(),
        })),
        itemIds: selectedIds,
        gearWindows,
      })
      const bits: string[] = []
      if (slots.length > 0)
        bits.push(slots.length === 1 ? 'studio booked' : `${slots.length} studio slots booked`)
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
  const studioNameOf = (studioId: string) =>
    studios.find((s) => s.id === studioId)?.name ?? 'Studio'

  const stepNav = (
    <div className="space-y-2">
      {step === 3 && !canSubmit && (
        <button
          type="button"
          onClick={() => setStep(1)}
          className="block w-full text-right text-[11.5px] font-medium text-amber-600 hover:underline"
        >
          {!windowValid
            ? 'Check the shoot dates: the end must be after the start.'
            : 'Name your shoot in step 1 to continue.'}
        </button>
      )}
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
          <Button type="button" disabled={!canSubmit} onClick={() => setReviewOpen(true)}>
            Review your plan <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )

  const planSummary = (
    <div className="mt-3 space-y-3">
      {/* One block per step, so the rail reads as the same three stages the
          wizard walks through rather than one mixed list. */}
      <RailSection n={1} label="Details" done={name.trim().length > 0}>
        <div className="font-medium text-foreground">{name.trim() || 'Unnamed shoot'}</div>
        <div>{windowLabel}</div>
        {editorIds.length > 0 && (
          <div>
            {editorIds.length} editor{editorIds.length === 1 ? '' : 's'}:{' '}
            {editorIds
              .map((id) => people.find((p) => p.id === id)?.full_name ?? 'someone')
              .join(', ')}
          </div>
        )}
        {locationType === 'outside' && outsideAddress.trim() && (
          <div>Outside: {outsideAddress.trim()}</div>
        )}
      </RailSection>

      <RailSection n={2} label="Studio" done={slots.length > 0}>
        {slots.length === 0 ? (
          <div className="text-muted-foreground/70">no studio booked</div>
        ) : (
          [...slots]
            .sort((a, b) => `${a.date}T${a.startHM}`.localeCompare(`${b.date}T${b.startHM}`))
            .map((sl, i) => (
              <div key={`${sl.studioId}-${sl.date}-${sl.startHM}-${i}`}>
                {studioNameOf(sl.studioId)} · {dayLabel(sl.date)}, {slotLabel(sl.startHM)} to{' '}
                {slotLabel(sl.endHM)}
              </div>
            ))
        )}
      </RailSection>

      <RailSection n={3} label="Gear" done={selectedGroups.length > 0}>
        {selectedGroups.length === 0 ? (
          <div className="text-muted-foreground/70">no gear yet</div>
        ) : (
          <ul className="space-y-1.5">
            {selectedGroups.map((g) => (
              <li
                key={g.key}
                className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5 text-[13px]"
              >
                <span className="truncate text-foreground">
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
        )}
        {approvalCount > 0 && (
          <div className="mt-2 rounded-lg bg-amber-500/15 px-2.5 py-1.5 text-[12.5px] font-medium text-amber-600">
            {approvalCount} approval{approvalCount > 1 ? 's' : ''} needed
          </div>
        )}
      </RailSection>

      {/* Steps 1 and 2 keep the escape hatch; step 3's action lives in the
          footer as "Review your plan", so it is not offered twice. */}
      {step < 3 && (
        <>
          <Button type="button" className="w-full" disabled={!canSubmit} onClick={() => submit()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Create shoot now
          </Button>
          <p className="text-center text-[11.5px] text-muted-foreground">
            {name.trim() ? 'Submit any time; add the rest later.' : 'Name the shoot to submit.'}
          </p>
        </>
      )}
    </div>
  )

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
              (s.n === 2 && slots.length > 0 && step > 2)
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

      {/* Steps 1 and 2 keep a rail beside the form. Step 3 hands the same
          summary to the gear picker, so gear selection looks identical to
          browsing Lockup: type, gear, and what you picked, all at once. */}
      {step === 3 ? (
        <StepGear
          availability={availability}
          loading={availabilityLoading}
          kits={kits}
          selectedIds={selectedIds}
          onToggle={toggleItem}
          onAddMany={(ids) =>
            setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])))
          }
          asideCount={selectedGroups.length}
          aside={planSummary}
          footer={stepNav}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_270px]">
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4">
              {step === 1 && (
                <StepDetails
                  name={name}
                  onNameChange={setName}
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
                  windowAdoptedFromStudio={!windowTouched.current && slots.length > 0}
                />
              )}
              {step === 2 && (
                <StepStudio
                  studios={studios}
                  blocks={blocks}
                  slots={slots}
                  onSlotsChange={handleSlotsChange}
                />
              )}
            </div>
            {stepNav}
          </div>

          <aside className="h-fit rounded-xl border border-border bg-card p-4 lg:sticky lg:top-4">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              Your plan so far
            </div>
            {planSummary}
          </aside>
        </div>
      )}

      <ReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        name={name}
        windowLabel={windowLabel}
        editors={editorIds.map(
          (id) => people.find((p) => p.id === id)?.full_name ?? 'someone'
        )}
        outsideAddress={
          locationType === 'outside' && outsideAddress.trim() ? outsideAddress.trim() : null
        }
        studioLines={[...slots]
          .sort((a, b) => `${a.date}T${a.startHM}`.localeCompare(`${b.date}T${b.startHM}`))
          .map(
            (sl) =>
              `${studioNameOf(sl.studioId)} · ${dayLabel(sl.date)}, ${slotLabel(sl.startHM)} to ${slotLabel(sl.endHM)}`
          )}
        studioSpans={slots.map((sl) => ({
          label: `${studioNameOf(sl.studioId)} · ${dayLabel(sl.date)}`,
          startsAt: new Date(`${sl.date}T${sl.startHM}`).toISOString(),
          endsAt: new Date(`${sl.date}T${sl.endHM}`).toISOString(),
        }))}
        shootStartsAt={startsAtIso}
        shootEndsAt={endsAtIso}
        gear={(availability ?? []).filter((r) => selectedIds.includes(r.item_id))}
        busy={busy}
        onConfirm={(windows) => submit(windows)}
      />
    </div>
  )
}

/** One step's worth of the plan, numbered to match the wizard's own steps. */
function RailSection({
  n,
  label,
  done,
  children,
}: {
  n: number
  label: string
  done: boolean
  children: React.ReactNode
}) {
  return (
    <section className="space-y-1 border-t border-border pt-2.5 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            'grid h-4 w-4 place-items-center rounded-full text-[9.5px] font-bold',
            done ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'
          )}
        >
          {done ? <Check className="h-2.5 w-2.5" /> : n}
        </span>
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="space-y-1 pl-[22px] text-[12.5px] text-muted-foreground">{children}</div>
    </section>
  )
}
