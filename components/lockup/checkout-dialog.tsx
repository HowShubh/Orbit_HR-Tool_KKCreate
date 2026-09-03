'use client'

import { useMemo, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Loader2, ScanLine, Trash2 } from 'lucide-react'
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
import { checkoutItems, lookupItemByCode, type CheckoutWarning } from '@/lib/actions/lockup'
import type { EquipmentItemRow } from '@/lib/queries/lockup'
import { CategoryIcon, CodeChip, defaultDueLocal, duePresets, itemStatusLine } from './item-bits'
import { scanFeedback } from '@/lib/lockup/scan-feedback'
import { QrScanner } from './qr-scanner'

export type CartItem = Pick<
  EquipmentItemRow,
  'id' | 'code' | 'name' | 'category' | 'photo_url' | 'status'
> & { home_location_label?: string | null }

/** Cart rows: real items plus optimistic placeholders while a scanned code is
 *  being resolved on the server (so scanning never blocks the next scan). */
type CartEntry = CartItem & { pending?: boolean }

/**
 * Cart checkout: starts with the scanned/selected item(s), lets the user scan
 * more stickers, pick one return date and time, then confirms. Reservation
 * conflicts come back as warnings first (warn-but-allow).
 */
export function CheckoutDialog({
  open,
  onOpenChange,
  initialItems,
  knownItems,
  shootId,
  defaultDue,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialItems: CartItem[]
  /** Items already in the browser: scans matching these are added instantly,
   *  with no server round trip. */
  knownItems?: CartItem[]
  /** Set when picking up gear reserved for a shoot */
  shootId?: string
  /** Overrides the standard "tomorrow 7 pm" default (e.g. shoot end date) */
  defaultDue?: string
  onDone?: () => void
}) {
  const router = useRouter()
  const { pushToast } = useStore()
  const presets = useMemo(() => duePresets(), [])
  const [cart, setCart] = useState<CartEntry[]>(initialItems)
  const [scanning, setScanning] = useState(false)
  const [dueLocal, setDueLocal] = useState(defaultDue ?? defaultDueLocal())
  const [warnings, setWarnings] = useState<CheckoutWarning[] | null>(null)
  const [busy, setBusy] = useState(false)
  // Claimed synchronously so a second read of the same sticker cannot slip
  // past while the first is still resolving.
  const claimed = useRef<Set<string>>(new Set(initialItems.map((i) => i.code)))

  // Reset per open
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setCart(initialItems)
      setWarnings(null)
      setScanning(false)
      setDueLocal(defaultDue ?? defaultDueLocal())
    }
  }

  const dueIso = useMemo(() => {
    const d = new Date(dueLocal)
    return isNaN(d.getTime()) ? null : d.toISOString()
  }, [dueLocal])

  async function addByCode(code: string) {
    if (claimed.current.has(code)) {
      scanFeedback('duplicate')
      return
    }
    claimed.current.add(code)
    setWarnings(null)

    // Instant path: the item is already loaded in the browser
    const known = knownItems?.find((k) => k.code === code)
    if (known) {
      if (known.status !== 'available') {
        claimed.current.delete(code)
        scanFeedback('error')
        pushToast({
          title: `${known.name} cannot be added`,
          body: itemStatusLine(known),
          variant: 'error',
        })
        return
      }
      setCart((prev) => (prev.some((c) => c.id === known.id) ? prev : [...prev, known]))
      scanFeedback('added')
      return
    }

    // Optimistic path: show the row immediately, resolve in the background so
    // the user can keep scanning the next sticker without waiting.
    const placeholder: CartEntry = {
      id: `pending-${code}`,
      code,
      name: code,
      category: 'other',
      photo_url: null,
      status: 'available',
      pending: true,
    }
    setCart((prev) => [...prev, placeholder])
    try {
      const item = await lookupItemByCode(code)
      if (!item) {
        claimed.current.delete(code)
        scanFeedback('error')
        setCart((prev) => prev.filter((c) => c.id !== placeholder.id))
        pushToast({ title: `No item with code ${code}`, variant: 'error' })
        return
      }
      if (item.kind === 'assigned') {
        claimed.current.delete(code)
        scanFeedback('error')
        setCart((prev) => prev.filter((c) => c.id !== placeholder.id))
        pushToast({
          title: `${item.name} is an assigned device`,
          body: 'Open it to borrow it — it is not part of shoot checkout.',
          variant: 'error',
        })
        return
      }
      if (item.status !== 'available') {
        claimed.current.delete(code)
        scanFeedback('error')
        setCart((prev) => prev.filter((c) => c.id !== placeholder.id))
        pushToast({
          title: `${item.name} cannot be added`,
          body: itemStatusLine(item),
          variant: 'error',
        })
        return
      }
      setCart((prev) =>
        prev.some((c) => c.id === item.id)
          ? prev.filter((c) => c.id !== placeholder.id)
          : prev.map((c) => (c.id === placeholder.id ? item : c))
      )
      scanFeedback('added')
    } catch (err) {
      claimed.current.delete(code)
      scanFeedback('error')
      setCart((prev) => prev.filter((c) => c.id !== placeholder.id))
      pushToast({
        title: err instanceof Error ? err.message : 'Lookup failed',
        variant: 'error',
      })
    }
  }

  async function submit(confirm: boolean) {
    if (!dueIso) {
      pushToast({ title: 'Pick a return date and time.', variant: 'error' })
      return
    }
    setBusy(true)
    try {
      const result = await checkoutItems({
        itemIds: cart.map((c) => c.id),
        dueAt: dueIso,
        shootId,
        confirm,
      })
      if (result.status === 'warnings') {
        setWarnings(result.warnings)
        return
      }
      pushToast({
        title:
          result.count === 1
            ? `${cart[0]?.name ?? 'Item'} is yours`
            : `${result.count} items checked out`,
        body: `Due back ${new Date(dueIso).toLocaleString('en-IN', {
          day: 'numeric',
          month: 'short',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })}`,
        variant: 'success',
      })
      onOpenChange(false)
      onDone?.()
      router.refresh()
    } catch (err) {
      pushToast({
        title: err instanceof Error ? err.message : 'Checkout failed',
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
          <DialogTitle>{shootId ? 'Pick up gear' : 'Check out gear'}</DialogTitle>
          <DialogDescription>
            {shootId
              ? 'These items convert from reserved to checked out under your name.'
              : 'Scan more stickers to take several items in one go.'}
          </DialogDescription>
        </DialogHeader>

        {/* Cart */}
        <ul className="space-y-2 max-h-52 overflow-y-auto pr-1">
          {cart.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
            >
              {item.pending ? (
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <CategoryIcon category={item.category} photoUrl={item.photo_url} size="sm" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-medium">
                  {item.pending ? 'Adding...' : item.name}
                </div>
                <CodeChip code={item.code} />
              </div>
              {cart.length > 1 && (
                <button
                  type="button"
                  aria-label={`Remove ${item.name}`}
                  className="text-muted-foreground hover:text-rose-600"
                  onClick={() => setCart((prev) => prev.filter((c) => c.id !== item.id))}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>

        {/* Scan more */}
        {scanning ? (
          <div className="space-y-2">
            <QrScanner onCode={addByCode} paused={busy} />
            <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => setScanning(false)}>
              Done scanning
            </Button>
          </div>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={() => setScanning(true)}>
            <ScanLine className="h-4 w-4" /> Scan more items
          </Button>
        )}

        {/* Due date */}
        <div className="space-y-1.5">
          <Label htmlFor="lockup-due">Return by</Label>
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
            id="lockup-due"
            type="datetime-local"
            value={dueLocal}
            onChange={(e) => {
              setDueLocal(e.target.value)
              setWarnings(null)
            }}
          />
        </div>

        {/* Reservation conflicts (warn but allow) */}
        {warnings && warnings.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-1.5">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-amber-800">
              <AlertTriangle className="h-4 w-4" /> Reserved by someone else
            </div>
            <ul className="space-y-1 text-[12.5px] text-amber-800">
              {warnings.map((w, i) => (
                <li key={i}>
                  <span className="font-medium">{w.item_name}</span>: {w.message}
                </li>
              ))}
            </ul>
            <p className="text-[12px] text-amber-700">
              You can still take it. The person who reserved it gets notified right away.
            </p>
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
            Cancel
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={busy || cart.length === 0 || !dueIso || cart.some((c) => c.pending)}
            onClick={() => submit(Boolean(warnings && warnings.length > 0))}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {warnings && warnings.length > 0
              ? 'Take anyway'
              : cart.length > 1
                ? `Check out ${cart.length} items`
                : 'Check out'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
