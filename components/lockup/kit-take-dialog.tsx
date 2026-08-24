'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Clock, Loader2 } from 'lucide-react'
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
import { useStore } from '@/lib/store'
import { checkoutItems, type CheckoutWarning } from '@/lib/actions/lockup'
import type { EquipmentItemRow, KitRow } from '@/lib/queries/lockup'
import { CodeChip, defaultDueLocal, duePresets, itemStatusLine } from './item-bits'

/**
 * One-tap kit checkout: every available item in the kit checks out to you in
 * one go; anything that is out, in repair or missing is skipped and named.
 * Custody stays per item underneath — this is just a faster hand.
 */
export function KitTakeDialog({
  kit,
  knownItems,
  open,
  onOpenChange,
}: {
  kit: KitRow
  /** Full rows from the browser, for live holder/status lines. */
  knownItems: EquipmentItemRow[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const { pushToast } = useStore()
  const presets = useMemo(() => duePresets(), [])
  const [dueLocal, setDueLocal] = useState(presets[0]?.value ?? defaultDueLocal())
  const [busy, setBusy] = useState(false)
  const [warnings, setWarnings] = useState<CheckoutWarning[] | null>(null)

  const itemById = useMemo(() => new Map(knownItems.map((i) => [i.id, i])), [knownItems])
  const rows = kit.items.map((member) => {
    const full = itemById.get(member.item_id)
    const available = (full?.status ?? member.status) === 'available'
    return {
      ...member,
      available,
      statusLine: full ? itemStatusLine(full) : available ? 'Available' : 'Not available',
    }
  })
  const availableRows = rows.filter((r) => r.available)
  const skippedRows = rows.filter((r) => !r.available)

  const dueIso = useMemo(() => {
    const d = new Date(dueLocal)
    return isNaN(d.getTime()) ? null : d.toISOString()
  }, [dueLocal])

  async function take(confirm: boolean) {
    if (!dueIso || availableRows.length === 0) return
    setBusy(true)
    try {
      const result = await checkoutItems({
        itemIds: availableRows.map((r) => r.item_id),
        dueAt: dueIso,
        confirm,
      })
      if (result.status === 'warnings') {
        setWarnings(result.warnings)
        return
      }
      pushToast({
        title: `${result.count} item${result.count === 1 ? '' : 's'} from ${kit.name} checked out`,
        body:
          skippedRows.length > 0
            ? `Skipped: ${skippedRows.map((r) => r.name).join(', ')}`
            : undefined,
        variant: 'success',
      })
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      pushToast({
        title: err instanceof Error ? err.message : 'Kit checkout failed',
        variant: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{kit.name}</DialogTitle>
          <DialogDescription>
            Kit · {kit.items.length} item{kit.items.length === 1 ? '' : 's'} · custody stays per
            item
          </DialogDescription>
        </DialogHeader>

        {/* Contents */}
        <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
          {rows.map((row) => (
            <li
              key={row.item_id}
              className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 ${
                row.available ? 'border-border' : 'border-blue-200 bg-blue-50/60'
              }`}
            >
              {row.available ? (
                <Check className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <Clock className="h-4 w-4 shrink-0 text-blue-600" />
              )}
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate text-[13.5px] font-medium">{row.name}</span>
                <CodeChip code={row.code} />
              </div>
              <span
                className={`shrink-0 text-[11.5px] ${
                  row.available ? 'text-emerald-700' : 'text-blue-700'
                }`}
              >
                {row.statusLine}
              </span>
            </li>
          ))}
        </ul>

        {/* Due picker */}
        <div className="space-y-1.5">
          <Label htmlFor="kit-due">Back by</Label>
          <div className="flex gap-2">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setDueLocal(p.value)
                  setWarnings(null)
                }}
                className={`flex flex-1 flex-col items-center rounded-lg border px-2 py-2 text-[12.5px] font-semibold transition-colors ${
                  dueLocal === p.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-foreground hover:bg-accent'
                }`}
              >
                {p.label}
                <span className="text-[10.5px] font-normal text-muted-foreground">{p.sub}</span>
              </button>
            ))}
          </div>
          <Input
            id="kit-due"
            type="datetime-local"
            value={dueLocal}
            onChange={(e) => {
              setDueLocal(e.target.value)
              setWarnings(null)
            }}
          />
        </div>

        {warnings && warnings.length > 0 && (
          <div className="space-y-1.5 rounded-lg border border-amber-300 bg-amber-50 p-3">
            <div className="text-[13px] font-semibold text-amber-800">Reserved by someone else</div>
            <ul className="space-y-1 text-[12.5px] text-amber-800">
              {warnings.map((w, i) => (
                <li key={i}>
                  <span className="font-medium">{w.item_name}</span>: {w.message}
                </li>
              ))}
            </ul>
            <p className="text-[12px] text-amber-700">
              You can still take the kit. Whoever reserved these gets notified right away.
            </p>
          </div>
        )}

        <Button
          type="button"
          className="w-full"
          disabled={busy || availableRows.length === 0 || !dueIso}
          onClick={() => take(Boolean(warnings && warnings.length > 0))}
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {warnings && warnings.length > 0
            ? 'Take anyway'
            : availableRows.length === kit.items.length
              ? 'Take the whole kit'
              : `Take the ${availableRows.length} available item${availableRows.length === 1 ? '' : 's'}`}
        </Button>
        {skippedRows.length > 0 && (
          <p className="text-center text-[12px] text-muted-foreground">
            {skippedRows.map((r) => r.name).join(', ')}{' '}
            {skippedRows.length === 1 ? 'is' : 'are'} skipped. Each item still checks out in your
            name individually.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
