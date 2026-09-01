'use client'

import { useMemo, useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Flag,
  Loader2,
  PackageCheck,
  ScanLine,
  Search,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useStore } from '@/lib/store'
import {
  checkinItems,
  checkoutItems,
  resolveScan,
  type CheckoutWarning,
} from '@/lib/actions/lockup'
import type {
  ScanCheckoutRow,
  ScanContext,
  ScanReturnRow,
} from '@/lib/queries/lockup'
import type { Tables } from '@/lib/supabase/database.types'
import { cn } from '@/lib/utils'
import { CategoryIcon, CodeChip, defaultDueLocal, duePresets, fmtDayTime } from './item-bits'
import { QrScanner } from './qr-scanner'
import { scanFeedback, type ScanOutcome } from '@/lib/lockup/scan-feedback'

/**
 * The scan station: one entry point for taking gear out and bringing it back.
 * You scan (or type) ONE code and the station works out which of the three
 * situations you are in, rather than asking you to pick a mode first:
 *
 *   holding it            -> return run: tick off everything else you carry
 *   reserved for a shoot  -> pickup: tick off the rest of that shoot's gear
 *   free on the shelf     -> plain checkout: keep scanning to add more
 */
export function ScanStation({
  open,
  onOpenChange,
  locations,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  locations: Tables<'equipment_locations'>[]
}) {
  const router = useRouter()
  const { pushToast } = useStore()
  const [ctx, setCtx] = useState<ScanContext | null>(null)
  const [looking, setLooking] = useState(false)

  // Reset each time it opens.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setCtx(null)
      setLooking(false)
    }
  }

  async function lookUp(code: string) {
    setLooking(true)
    try {
      setCtx(await resolveScan(code))
    } catch (err) {
      pushToast({
        title: err instanceof Error ? err.message : 'Could not read that code',
        variant: 'error',
      })
    } finally {
      setLooking(false)
    }
  }

  const close = () => onOpenChange(false)
  const done = () => {
    close()
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        {ctx === null ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ScanLine className="h-4 w-4" /> Scan an item
              </DialogTitle>
              <DialogDescription>
                Point the camera at the sticker, or type the 6-character code printed under the
                QR. Scanning one item is enough: you pick the rest off a list.
              </DialogDescription>
            </DialogHeader>
            {looking ? (
              <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Looking it up…
              </div>
            ) : (
              <QrScanner onCode={lookUp} />
            )}
          </>
        ) : ctx.kind === 'not_found' ? (
          <Blocked
            title={`No item with code ${ctx.code}`}
            detail="The sticker may belong to a deleted item, or the code was mistyped."
            onBack={() => setCtx(null)}
          />
        ) : ctx.kind === 'unavailable' ? (
          <Blocked
            title={`${ctx.scanned.name} is not free`}
            detail={ctx.detail}
            onBack={() => setCtx(null)}
          />
        ) : ctx.kind === 'return' ? (
          <ReturnRun ctx={ctx} locations={locations} onBack={() => setCtx(null)} onDone={done} />
        ) : (
          <TakeRun ctx={ctx} onBack={() => setCtx(null)} onDone={done} onRescan={lookUp} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function Blocked({
  title,
  detail,
  onBack,
}: {
  title: string
  detail: string
  onBack: () => void
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{detail}</DialogDescription>
      </DialogHeader>
      <Button variant="outline" className="w-full" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" /> Scan something else
      </Button>
    </>
  )
}

/* ============================ TAKING ============================ */

function TakeRun({
  ctx,
  onBack,
  onDone,
  onRescan,
}: {
  ctx: Extract<ScanContext, { kind: 'pickup' | 'checkout' }>
  onBack: () => void
  onDone: () => void
  onRescan: (code: string) => void
}) {
  const { pushToast } = useStore()
  const presets = useMemo(() => duePresets(), [])
  const isPickup = ctx.kind === 'pickup'

  // The scanned item is always taken; the rest start unticked so the list
  // doubles as a "do I actually have this?" check.
  const offered: ScanCheckoutRow[] = isPickup ? ctx.alsoReserved : (ctx.kit?.items ?? [])
  const [picked, setPicked] = useState<string[]>([ctx.scanned.item_id])
  const [dueLocal, setDueLocal] = useState(
    isPickup ? toLocal(ctx.shoot.ends_at) : presets[0]?.value ?? defaultDueLocal()
  )
  const [warnings, setWarnings] = useState<CheckoutWarning[] | null>(null)
  const [scanMore, setScanMore] = useState(false)
  const [busy, setBusy] = useState(false)

  // Anything scanned in on top of the offered list.
  const [extra, setExtra] = useState<ScanCheckoutRow[]>([])
  const all = [ctx.scanned, ...offered, ...extra]
  const takeable = all.filter((r) => !r.blocked_reason)

  // Codes already added or still resolving. A ref, not state, because the
  // scanner can fire again while resolveScan is still awaiting: reading a
  // rendered list there is stale and lets the same sticker through twice.
  const claimed = useRef<Set<string>>(new Set(all.map((r) => r.code)))
  const [adding, setAdding] = useState(false)
  const [flash, setFlash] = useState<{ text: string; outcome: ScanOutcome } | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listEndRef = useRef<HTMLDivElement | null>(null)
  const [justAdded, setJustAdded] = useState<string | null>(null)

  function signal(outcome: ScanOutcome, text: string) {
    scanFeedback(outcome)
    setFlash({ text, outcome })
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(null), 2200)
  }

  // Keep the newest scan in view: past four items the list scrolls, and the
  // person is holding a camera, not scrolling a list.
  useEffect(() => {
    if (extra.length > 0) listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [extra.length])

  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current) }, [])

  async function addScanned(code: string) {
    if (claimed.current.has(code)) {
      signal('duplicate', 'Already in the list')
      return
    }
    claimed.current.add(code) // claim before awaiting, so a repeat scan loses
    setAdding(true)
    try {
      const res = await resolveScan(code)
      if (res.kind === 'checkout' || res.kind === 'pickup') {
        setExtra((e) => [...e, res.scanned])
        setPicked((p) => [...p, res.scanned.item_id])
        setJustAdded(res.scanned.item_id)
        signal('added', `Added ${res.scanned.name}`)
      } else {
        claimed.current.delete(code) // let them try again after fixing it
        const text =
          res.kind === 'not_found'
            ? `No item with code ${code}`
            : res.kind === 'unavailable'
              ? `${res.scanned.name}: ${res.detail}`
              : 'That one is already with you.'
        signal('error', text)
        pushToast({ title: text, variant: 'error' })
      }
    } catch (err) {
      claimed.current.delete(code)
      const text = err instanceof Error ? err.message : 'Could not read that code'
      signal('error', text)
      pushToast({ title: text, variant: 'error' })
    } finally {
      setAdding(false)
    }
  }

  async function submit(confirm: boolean) {
    const ids = picked.filter((id) => takeable.some((r) => r.item_id === id))
    if (ids.length === 0) return
    const due = new Date(dueLocal)
    if (isNaN(due.getTime())) {
      pushToast({ title: 'Pick a return time.', variant: 'error' })
      return
    }
    setBusy(true)
    try {
      const res = await checkoutItems({
        itemIds: ids,
        dueAt: due.toISOString(),
        shootId: isPickup ? ctx.shoot.id : undefined,
        confirm,
      })
      if (res.status === 'warnings') {
        setWarnings(res.warnings)
        return
      }
      pushToast({
        title: res.count === 1 ? `${ctx.scanned.name} is yours` : `${res.count} items are yours`,
        body: `Back by ${fmtDayTime(due.toISOString())}`,
        variant: 'success',
      })
      onDone()
    } catch (err) {
      pushToast({ title: err instanceof Error ? err.message : 'Checkout failed', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {isPickup ? `Picking up for ${ctx.shoot.name}` : `Taking ${ctx.scanned.name}`}
        </DialogTitle>
        <DialogDescription>
          {isPickup
            ? 'You scanned one item booked for this shoot. Tick off the rest as you find them, then set when it all comes back.'
            : ctx.kit
              ? `${ctx.scanned.name} belongs to ${ctx.kit.name}. Tick anything else you are taking.`
              : 'Scan more stickers to add items, then set when they come back.'}
        </DialogDescription>
      </DialogHeader>

      {flash && (
        <div
          className={cn(
            'flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-medium',
            flash.outcome === 'added'
              ? 'bg-emerald-50 text-emerald-800'
              : flash.outcome === 'duplicate'
                ? 'bg-amber-50 text-amber-800'
                : 'bg-rose-50 text-rose-800'
          )}
        >
          {flash.outcome === 'added' ? (
            <Check className="h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0" />
          )}
          <span className="min-w-0 truncate">{flash.text}</span>
          <span className="ml-auto shrink-0 text-[11.5px] opacity-70">
            {picked.length} picked
          </span>
        </div>
      )}

      <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
        {all.map((row) => {
          const isScanned = row.item_id === ctx.scanned.item_id
          const on = picked.includes(row.item_id)
          const blocked = Boolean(row.blocked_reason)
          return (
            <li key={row.item_id}>
              <button
                type="button"
                disabled={blocked}
                onClick={() =>
                  setPicked((p) =>
                    p.includes(row.item_id)
                      ? p.filter((x) => x !== row.item_id)
                      : [...p, row.item_id]
                  )
                }
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                  justAdded === row.item_id && 'ring-2 ring-emerald-400',
                  blocked
                    ? 'cursor-not-allowed border-border bg-muted/40 opacity-60'
                    : on
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-accent'
                )}
              >
                <span
                  className={cn(
                    'grid h-5 w-5 shrink-0 place-items-center rounded-md border-[1.5px]',
                    on ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                  )}
                >
                  {on && <Check className="h-3 w-3 text-primary-foreground" />}
                </span>
                <CategoryIcon category={row.category} photoUrl={row.photo_url} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[13.5px] font-semibold">{row.name}</span>
                    <CodeChip code={row.code} />
                    {isScanned && (
                      <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-px text-[10px] font-semibold text-primary">
                        scanned
                      </span>
                    )}
                  </span>
                  <span className="block text-[11.5px] text-muted-foreground">
                    {row.blocked_reason ?? row.home_location_label ?? 'shelf not set'}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
        <div ref={listEndRef} />
      </ul>

      {scanMore ? (
        <div className="space-y-2">
          <QrScanner onCode={addScanned} paused={adding} />
          {adding && (
            <div className="flex items-center justify-center gap-2 rounded-lg bg-muted py-2 text-[12.5px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking that one up...
            </div>
          )}
          <Button variant="ghost" size="sm" className="w-full" onClick={() => setScanMore(false)}>
            Done scanning
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setScanMore(true)}>
          <ScanLine className="h-4 w-4" /> Scan another item
        </Button>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="scan-due">Back by</Label>
        <div className="flex gap-2">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setDueLocal(p.value)
                setWarnings(null)
              }}
              className={cn(
                'flex flex-1 flex-col items-center rounded-lg border px-2 py-1.5 text-[12.5px] font-semibold transition-colors',
                dueLocal === p.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:bg-accent'
              )}
            >
              {p.label}
              <span className="text-[10px] font-normal text-muted-foreground">{p.sub}</span>
            </button>
          ))}
        </div>
        <Input
          id="scan-due"
          type="datetime-local"
          value={dueLocal}
          onChange={(e) => {
            setDueLocal(e.target.value)
            setWarnings(null)
          }}
        />
        {isPickup && (
          <p className="text-[11.5px] text-muted-foreground">
            Defaults to when {ctx.shoot.name} ends.
          </p>
        )}
      </div>

      {warnings && warnings.length > 0 && (
        <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-2.5">
          <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5" /> Reserved by someone else
          </div>
          <ul className="space-y-0.5 text-[12px] text-amber-800">
            {warnings.map((w, i) => (
              <li key={i}>
                <span className="font-medium">{w.item_name}</span>: {w.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" disabled={busy} onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button
          className="flex-1"
          disabled={busy || picked.length === 0}
          onClick={() => submit(Boolean(warnings && warnings.length > 0))}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {warnings && warnings.length > 0
            ? 'Take anyway'
            : `Take ${picked.length} item${picked.length === 1 ? '' : 's'}`}
        </Button>
      </div>
    </>
  )
}

/* ============================ RETURNING ============================ */

function ReturnRun({
  ctx,
  locations,
  onBack,
  onDone,
}: {
  ctx: Extract<ScanContext, { kind: 'return' }>
  locations: Tables<'equipment_locations'>[]
  onBack: () => void
  onDone: () => void
}) {
  const { pushToast } = useStore()
  const all = [ctx.scanned, ...ctx.alsoWithYou]
  const pooled = all.filter((r) => !r.is_device)
  const devices = all.filter((r) => r.is_device)

  const [picked, setPicked] = useState<string[]>([ctx.scanned.item_id])
  // One shelf for the batch, with a per-item override underneath.
  const [batchShelf, setBatchShelf] = useState<string>(
    ctx.scanned.picked_up_location_id ?? ctx.scanned.home_location_id ?? locations[0]?.id ?? ''
  )
  const [shelfOverride, setShelfOverride] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [noteOpen, setNoteOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const shelfFor = (r: ScanReturnRow) => shelfOverride[r.item_id] ?? batchShelf
  const labelOf = (id: string) => locations.find((l) => l.id === id)?.label ?? 'that shelf'

  // Items going back somewhere other than where they were taken from.
  const moved = pooled.filter(
    (r) =>
      picked.includes(r.item_id) &&
      r.picked_up_location_id &&
      shelfFor(r) &&
      shelfFor(r) !== r.picked_up_location_id
  )

  async function submit() {
    const rows = pooled
      .filter((r) => picked.includes(r.item_id))
      .map((r) => ({
        itemId: r.item_id,
        locationId: shelfFor(r),
        issueNote: notes[r.item_id],
      }))
    if (rows.length === 0) {
      pushToast({ title: 'Nothing selected.', variant: 'error' })
      return
    }
    if (rows.some((r) => !r.locationId)) {
      pushToast({ title: 'Pick where each item goes back.', variant: 'error' })
      return
    }
    setBusy(true)
    try {
      const res = await checkinItems({ items: rows })
      pushToast({
        title: `${res.returned} item${res.returned === 1 ? '' : 's'} checked in`,
        body: res.issues > 0 ? `${res.issues} problem(s) reported to the tech lead.` : undefined,
        variant: 'success',
      })
      onDone()
    } catch (err) {
      pushToast({
        title: err instanceof Error ? err.message : 'Check-in failed',
        variant: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Putting gear back</DialogTitle>
        <DialogDescription>
          You scanned {ctx.scanned.name}. Tick everything else you are carrying, then say which
          shelf it goes on.
        </DialogDescription>
      </DialogHeader>

      {/* Shelf for the batch */}
      <div className="space-y-1.5">
        <Label>Putting it on</Label>
        <div className="grid grid-cols-2 gap-2">
          {locations.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => {
                setBatchShelf(l.id)
                setShelfOverride({})
              }}
              className={cn(
                'rounded-xl border px-3 py-2.5 text-[13.5px] font-semibold transition-colors',
                batchShelf === l.id
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:bg-accent'
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
        {pooled.map((r) => {
          const on = picked.includes(r.item_id)
          const shelf = shelfFor(r)
          const movedHere = on && r.picked_up_location_id && shelf && shelf !== r.picked_up_location_id
          return (
            <li
              key={r.item_id}
              className={cn(
                'rounded-xl border px-3 py-2.5',
                on ? 'border-primary/40 bg-primary/5' : 'border-border'
              )}
            >
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setPicked((p) =>
                      p.includes(r.item_id) ? p.filter((x) => x !== r.item_id) : [...p, r.item_id]
                    )
                  }
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span
                    className={cn(
                      'grid h-5 w-5 shrink-0 place-items-center rounded-md border-[1.5px]',
                      on ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                    )}
                  >
                    {on && <Check className="h-3 w-3 text-primary-foreground" />}
                  </span>
                  <CategoryIcon category={r.category} photoUrl={r.photo_url} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[13.5px] font-semibold">{r.name}</span>
                      <CodeChip code={r.code} />
                      {r.overdue && (
                        <span className="shrink-0 rounded-full bg-rose-100 px-1.5 py-px text-[10px] font-semibold text-rose-700">
                          overdue
                        </span>
                      )}
                    </span>
                    <span className="block text-[11.5px] text-muted-foreground">
                      {r.picked_up_location_label
                        ? `taken from ${r.picked_up_location_label}`
                        : 'origin not recorded'}
                      {r.shoot_name ? ` · ${r.shoot_name}` : ''}
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setNoteOpen(noteOpen === r.item_id ? null : r.item_id)}
                  className={cn(
                    'shrink-0 rounded-lg border p-1.5 transition-colors',
                    notes[r.item_id]
                      ? 'border-rose-300 bg-rose-50 text-rose-600'
                      : 'border-border text-muted-foreground hover:bg-accent'
                  )}
                  title="Report a problem with this item"
                >
                  <Flag className="h-3.5 w-3.5" />
                </button>
              </div>

              {movedHere && (
                <p className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-[11.5px] text-amber-800">
                  <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                  You took this from {r.picked_up_location_label}, putting it on {labelOf(shelf)}.
                  <button
                    type="button"
                    className="font-semibold underline"
                    onClick={() =>
                      setShelfOverride((o) => ({ ...o, [r.item_id]: r.picked_up_location_id! }))
                    }
                  >
                    Put it back on {r.picked_up_location_label}
                  </button>
                </p>
              )}

              {noteOpen === r.item_id && (
                <div className="mt-2 space-y-1.5">
                  <Textarea
                    value={notes[r.item_id] ?? ''}
                    onChange={(e) => setNotes((n) => ({ ...n, [r.item_id]: e.target.value }))}
                    placeholder="e.g. lens cap missing, battery not holding charge"
                    rows={2}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    This opens an issue and tells the tech lead who reported it.
                  </p>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {devices.length > 0 && (
        <p className="rounded-lg bg-muted px-3 py-2 text-[11.5px] text-muted-foreground">
          {devices.map((d) => d.name).join(', ')}{' '}
          {devices.length === 1 ? 'is a device' : 'are devices'} and{' '}
          {devices.length === 1 ? 'goes' : 'go'} back to{' '}
          {devices.map((d) => d.device_owner_name ?? 'their owner').join(', ')}, not a shelf. Hand{' '}
          {devices.length === 1 ? 'it' : 'them'} over from the item page.
        </p>
      )}

      {moved.length > 0 && (
        <p className="text-[11.5px] text-muted-foreground">
          {moved.length} item{moved.length === 1 ? '' : 's'} going back to a different shelf than{' '}
          {moved.length === 1 ? 'it' : 'they'} came from. That is fine, it just gets recorded.
        </p>
      )}

      <div className="flex gap-2">
        <Button variant="outline" disabled={busy} onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button className="flex-1" disabled={busy || picked.length === 0} onClick={submit}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
          Check in {picked.length} item{picked.length === 1 ? '' : 's'}
        </Button>
      </div>
    </>
  )
}

function toLocal(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
