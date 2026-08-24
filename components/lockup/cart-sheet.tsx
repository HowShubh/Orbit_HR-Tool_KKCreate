'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, Clapperboard, Loader2, Trash2 } from 'lucide-react'
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
import { checkoutItems, reserveItems, type CheckoutWarning } from '@/lib/actions/lockup'
import type { EquipmentItemRow, ShootSummary } from '@/lib/queries/lockup'
import { useCart } from '@/lib/lockup/cart'
import { CategoryIcon, CodeChip, defaultDueLocal, duePresets, fmtShootWindow } from './item-bits'

/**
 * The one checkout point. A cart is taken now (checked out to you), or saved
 * onto a shoot (reserved for that window) — same basket either way, so a browse
 * is never thrown away when you realise it belongs to a shoot.
 */
export function CartSheet({
  open,
  onOpenChange,
  items,
  shoots,
  currentUserId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: EquipmentItemRow[]
  shoots: ShootSummary[]
  currentUserId: string
}) {
  const router = useRouter()
  const { pushToast } = useStore()
  const cart = useCart()
  const presets = useMemo(() => duePresets(), [])
  const [dueLocal, setDueLocal] = useState(presets[0]?.value ?? defaultDueLocal())
  const [warnings, setWarnings] = useState<CheckoutWarning[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'now' | 'shoot'>('now')
  const [shootId, setShootId] = useState<string | null>(null)

  // Resolve ids against live rows, so a cart can never be stale about status.
  const rows = cart.ids.flatMap((id) => {
    const item = items.find((i) => i.id === id)
    return item ? [item] : []
  })
  const takeable = rows.filter((r) => r.status === 'available')
  const approvals = rows.filter((r) => r.requires_approval).length

  // Only shoots you can actually plan: yours, still upcoming.
  const myShoots = shoots.filter(
    (s) => s.owner_id === currentUserId && s.status !== 'done' && s.status !== 'cancelled'
  )

  const dueIso = useMemo(() => {
    const d = new Date(dueLocal)
    return isNaN(d.getTime()) ? null : d.toISOString()
  }, [dueLocal])

  async function takeNow(confirm: boolean) {
    if (!dueIso || takeable.length === 0) return
    setBusy(true)
    try {
      const result = await checkoutItems({
        itemIds: takeable.map((r) => r.id),
        dueAt: dueIso,
        confirm,
      })
      if (result.status === 'warnings') {
        setWarnings(result.warnings)
        return
      }
      pushToast({
        title:
          result.count === 1 ? `${takeable[0].name} is yours` : `${result.count} items are yours`,
        body: `Back by ${new Date(dueIso).toLocaleString('en-IN', {
          day: 'numeric',
          month: 'short',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })}`,
        variant: 'success',
      })
      cart.clear()
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      pushToast({ title: err instanceof Error ? err.message : 'Checkout failed', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function saveToShoot() {
    if (!shootId || rows.length === 0) return
    setBusy(true)
    try {
      await reserveItems({ shootId, itemIds: rows.map((r) => r.id) })
      const shoot = myShoots.find((s) => s.id === shootId)
      pushToast({
        title: `${rows.length} item${rows.length === 1 ? '' : 's'} reserved for ${shoot?.name ?? 'the shoot'}`,
        body: approvals > 0 ? `${approvals} awaiting Tech Lead approval.` : undefined,
        variant: 'success',
      })
      cart.clear()
      onOpenChange(false)
      router.push(`/lockup/shoots/${shootId}`)
    } catch (err) {
      pushToast({ title: err instanceof Error ? err.message : 'Could not reserve', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Your cart</DialogTitle>
          <DialogDescription>
            {rows.length} item{rows.length === 1 ? '' : 's'} picked. Nothing is held until you
            check out.
          </DialogDescription>
        </DialogHeader>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center text-[13px] text-muted-foreground">
            Your cart is empty. Tap + on any gear to add it.
          </div>
        ) : (
          <>
            <ul className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                    row.status === 'available'
                      ? 'border-border'
                      : 'border-blue-200 bg-blue-50/60'
                  }`}
                >
                  <CategoryIcon category={row.category} photoUrl={row.photo_url} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13.5px] font-medium">{row.name}</span>
                      <CodeChip code={row.code} />
                    </div>
                    {row.status !== 'available' && (
                      <div className="text-[11.5px] text-blue-700">
                        {row.holder_name ? `with ${row.holder_name}` : 'not free right now'} · can
                        still be reserved
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${row.name}`}
                    className="text-muted-foreground hover:text-rose-600"
                    onClick={() => cart.remove(row.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>

            {/* Mode switch */}
            <div className="flex gap-1 rounded-xl bg-muted p-1">
              <button
                type="button"
                onClick={() => setMode('now')}
                className={`flex-1 rounded-lg py-2 text-[13px] font-semibold transition-colors ${
                  mode === 'now' ? 'bg-card shadow-sm' : 'text-muted-foreground'
                }`}
              >
                Take now
              </button>
              <button
                type="button"
                onClick={() => setMode('shoot')}
                className={`flex-1 rounded-lg py-2 text-[13px] font-semibold transition-colors ${
                  mode === 'shoot' ? 'bg-card shadow-sm' : 'text-muted-foreground'
                }`}
              >
                Save to a shoot
              </button>
            </div>

            {mode === 'now' ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="cart-due">Back by</Label>
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
                            : 'border-border bg-card hover:bg-accent'
                        }`}
                      >
                        {p.label}
                        <span className="text-[10.5px] font-normal text-muted-foreground">
                          {p.sub}
                        </span>
                      </button>
                    ))}
                  </div>
                  <Input
                    id="cart-due"
                    type="datetime-local"
                    value={dueLocal}
                    onChange={(e) => {
                      setDueLocal(e.target.value)
                      setWarnings(null)
                    }}
                  />
                </div>

                {rows.length > takeable.length && (
                  <p className="text-[12px] text-muted-foreground">
                    {rows.length - takeable.length} item
                    {rows.length - takeable.length === 1 ? ' is' : 's are'} not free right now and
                    will be skipped. Save to a shoot instead to reserve them.
                  </p>
                )}

                {warnings && warnings.length > 0 && (
                  <div className="space-y-1.5 rounded-lg border border-amber-300 bg-amber-50 p-3">
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
                      You can still take it. Whoever reserved it gets notified right away.
                    </p>
                  </div>
                )}

                <Button
                  className="w-full"
                  disabled={busy || takeable.length === 0 || !dueIso}
                  onClick={() => takeNow(Boolean(warnings && warnings.length > 0))}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {warnings && warnings.length > 0
                    ? 'Take anyway'
                    : `Take ${takeable.length} item${takeable.length === 1 ? '' : 's'} now`}
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Which shoot?</Label>
                  {myShoots.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-[12.5px] text-muted-foreground">
                      You have no upcoming shoots. Plan one first, then come back.
                    </div>
                  ) : (
                    <ul className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
                      {myShoots.map((s) => (
                        <li key={s.id}>
                          <button
                            type="button"
                            onClick={() => setShootId(s.id)}
                            className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                              shootId === s.id
                                ? 'border-primary bg-primary/10'
                                : 'border-border hover:bg-accent'
                            }`}
                          >
                            <Clapperboard className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[13.5px] font-semibold">{s.name}</div>
                              <div className="text-[11.5px] text-muted-foreground">
                                {fmtShootWindow(s.starts_at, s.ends_at)}
                              </div>
                            </div>
                            {shootId === s.id && <Check className="h-4 w-4 shrink-0 text-primary" />}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <Button className="w-full" disabled={busy || !shootId} onClick={saveToShoot}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
                  Reserve {rows.length} item{rows.length === 1 ? '' : 's'} for this shoot
                </Button>
              </>
            )}

            {approvals > 0 && (
              <p className="text-center text-[11.5px] text-muted-foreground">
                {approvals} item{approvals === 1 ? '' : 's'} need Tech Lead approval.
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
