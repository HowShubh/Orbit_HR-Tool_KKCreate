'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Clapperboard, Loader2, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useStore } from '@/lib/store'
import { reserveItems } from '@/lib/actions/lockup'
import type { AvailabilityRow, KitRow } from '@/lib/queries/lockup'
import { GearPicker, type PickerKit, type PickerRow } from './gear-picker'
import { isAddable } from './wizard/step-gear'
import { CodeChip } from './item-bits'
import { GearTimingChooser, type StudioSpan, type TimingResult } from './gear-timing'

/**
 * Add gear to an existing shoot, using the exact 3-column picker from the
 * wizard's step 3 rather than the old flat list — type rail, kits, search, and
 * a "Selected" panel that reserves. Availability is judged against this shoot's
 * window, so clashes show before anything is reserved.
 */
export function AddGearDialog({
  open,
  onOpenChange,
  shootId,
  shootName,
  shootStartsAt,
  shootEndsAt,
  studioSpans,
  availability,
  kits,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  shootId: string
  shootName: string
  shootStartsAt: string
  shootEndsAt: string
  studioSpans: StudioSpan[]
  availability: AvailabilityRow[]
  kits: KitRow[]
}) {
  const router = useRouter()
  const { pushToast } = useStore()
  const [selected, setSelected] = useState<string[]>([])
  const [timing, setTiming] = useState<TimingResult>({ timing: null, windows: [] })
  const [busy, setBusy] = useState(false)

  // Reset each open.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setSelected([])
      setTiming({ timing: null, windows: [] })
    }
  }

  // Items already on the shoot are hidden; the rest become picker rows.
  const addable = useMemo(
    () => availability.filter((r) => !r.already_reserved_for_shoot),
    [availability]
  )
  const byId = useMemo(() => new Map(addable.map((r) => [r.item_id, r])), [addable])

  const rows = useMemo<PickerRow[]>(
    () =>
      addable.map((r) => {
        const ok = isAddable(r)
        return {
          id: r.item_id,
          code: r.code,
          name: r.name,
          category: r.category,
          photo_url: r.photo_url,
          subtitle: r.home_location_label ? `shelf ${r.home_location_label}` : null,
          requires_approval: r.requires_approval,
          selectable: ok,
          statusText: r.conflict ? r.conflict.short : 'Free for this shoot',
          statusTone: !r.conflict ? 'free' : ok ? 'warn' : 'blocked',
        }
      }),
    [addable]
  )

  const pickerKits = useMemo<PickerKit[]>(() => {
    return kits.map((kit) => ({
      id: kit.id,
      name: kit.name,
      total: kit.items.length,
      addableIds: kit.items.flatMap((m) => {
        const r = byId.get(m.item_id)
        return r && isAddable(r) ? [m.item_id] : []
      }),
    }))
  }, [kits, byId])

  const selectedRows = selected.flatMap((id) => {
    const r = byId.get(id)
    return r ? [r] : []
  })
  const approvals = selectedRows.filter((r) => r.requires_approval).length
  const needsTiming = selected.length > 0 && timing.timing === null

  async function reserve() {
    if (selected.length === 0) return
    setBusy(true)
    try {
      await reserveItems({ shootId, itemIds: selected, gearWindows: timing.windows })
      pushToast({
        title: `${selected.length} item${selected.length === 1 ? '' : 's'} reserved for ${shootName}`,
        body: approvals > 0 ? `${approvals} awaiting Tech Lead approval.` : undefined,
        variant: 'success',
      })
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      pushToast({ title: err instanceof Error ? err.message : 'Could not reserve', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add gear to {shootName}</DialogTitle>
          <DialogDescription>
            Availability is checked against this shoot&apos;s window. Anything that clashes is
            flagged before you reserve it.
          </DialogDescription>
        </DialogHeader>

        <GearPicker
          rows={rows}
          kits={pickerKits}
          selectedIds={selected}
          onToggle={(id) =>
            setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
          }
          onAddMany={(ids) => setSelected((p) => Array.from(new Set([...p, ...ids])))}
          asideTitle="Selected"
          asideCount={selected.length}
          asideOnMobile
          aside={
            <div className="space-y-3">
              {selectedRows.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[12.5px] text-muted-foreground">
                  Nothing picked yet. Tap the + on any item.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {selectedRows.map((r) => (
                    <li
                      key={r.item_id}
                      className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5"
                    >
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">
                        {r.name}
                      </span>
                      <CodeChip code={r.code} />
                      <button
                        type="button"
                        aria-label={`Remove ${r.name}`}
                        onClick={() => setSelected((p) => p.filter((x) => x !== r.item_id))}
                        className="text-muted-foreground hover:text-rose-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {selected.length > 0 && (
                <GearTimingChooser
                  gear={selectedRows.map((r) => ({ item_id: r.item_id, name: r.name }))}
                  studioSpans={studioSpans}
                  shootStartsAt={shootStartsAt}
                  shootEndsAt={shootEndsAt}
                  onChange={setTiming}
                />
              )}

              {approvals > 0 && (
                <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-center text-[11.5px] font-medium text-amber-700">
                  {approvals} approval{approvals === 1 ? '' : 's'} needed
                </p>
              )}

              <Button
                className="w-full"
                disabled={busy || selected.length === 0 || needsTiming}
                onClick={reserve}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {needsTiming
                  ? 'Choose how long'
                  : `Reserve ${selected.length || ''} item${selected.length === 1 ? '' : 's'}`}
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                <Clapperboard className="mr-1 inline h-3 w-3" />
                Reserved for {shootName}. Scan at the shelf on the day to take it.
              </p>
            </div>
          }
        />
      </DialogContent>
    </Dialog>
  )
}
