'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, Clapperboard, Loader2, ShoppingCart, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useStore } from '@/lib/store'
import { checkoutItems, reserveItems, type CheckoutWarning } from '@/lib/actions/lockup'
import type { EquipmentItemRow, ShootSummary } from '@/lib/queries/lockup'
import { useCart } from '@/lib/lockup/cart'
import { cn } from '@/lib/utils'
import { CodeChip, defaultDueLocal, duePresets, fmtShootWindow } from './item-bits'

/**
 * The cart's contents and checkout controls. Rendered as a always-visible rail
 * on desktop and inside a sheet on mobile, so there is exactly one cart UI.
 */
export function CartPanel({
  items,
  shoots,
  currentUserId,
  onDone,
}: {
  items: EquipmentItemRow[]
  shoots: ShootSummary[]
  currentUserId: string
  /** Lets the sheet close itself after a successful checkout. */
  onDone?: () => void
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
      onDone?.()
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
      onDone?.()
      router.push(`/lockup/shoots/${shootId}`)
    } catch (err) {
      pushToast({ title: err instanceof Error ? err.message : 'Could not reserve', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-10 text-center">
        <ShoppingCart className="h-6 w-6 text-muted-foreground/50" />
        <p className="text-[13px] text-muted-foreground">Nothing picked yet.</p>
        <p className="text-[12px] text-muted-foreground/70">
          Tap + on any gear to build your cart.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li
            key={row.id}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-3 py-2',
              row.status === 'available' ? 'border-border' : 'border-blue-200 bg-blue-50/60'
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[13px] font-semibold">{row.name}</span>
                <CodeChip code={row.code} />
              </div>
              {row.status !== 'available' && (
                <div className="text-[11px] text-blue-700">
                  {row.holder_name ? `with ${row.holder_name}` : 'not free now'} · reserve only
                </div>
              )}
            </div>
            <button
              type="button"
              aria-label={`Remove ${row.name}`}
              onClick={() => cart.remove(row.id)}
              className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-rose-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>

      <div className="flex gap-1 rounded-xl bg-muted p-1">
        <button
          type="button"
          onClick={() => setMode('now')}
          className={cn(
            'flex-1 rounded-lg py-1.5 text-[12.5px] font-semibold transition-colors',
            mode === 'now' ? 'bg-card shadow-sm' : 'text-muted-foreground'
          )}
        >
          Take now
        </button>
        <button
          type="button"
          onClick={() => setMode('shoot')}
          className={cn(
            'flex-1 rounded-lg py-1.5 text-[12.5px] font-semibold transition-colors',
            mode === 'shoot' ? 'bg-card shadow-sm' : 'text-muted-foreground'
          )}
        >
          To a shoot
        </button>
      </div>

      {mode === 'now' ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="cart-due" className="text-[11.5px] uppercase tracking-wider">
              Back by
            </Label>
            <div className="flex gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    setDueLocal(p.value)
                    setWarnings(null)
                  }}
                  className={cn(
                    'flex flex-1 flex-col items-center rounded-lg border px-1 py-1.5 text-[12px] font-semibold transition-colors',
                    dueLocal === p.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card hover:bg-accent'
                  )}
                >
                  {p.label}
                  <span className="text-[10px] font-normal text-muted-foreground">{p.sub}</span>
                </button>
              ))}
            </div>
            <Input
              id="cart-due"
              type="datetime-local"
              className="h-9 text-[13px]"
              value={dueLocal}
              onChange={(e) => {
                setDueLocal(e.target.value)
                setWarnings(null)
              }}
            />
          </div>

          {rows.length > takeable.length && (
            <p className="text-[11.5px] text-muted-foreground">
              {rows.length - takeable.length} item
              {rows.length - takeable.length === 1 ? ' is' : 's are'} not free now and will be
              skipped. Send the cart to a shoot to reserve them instead.
            </p>
          )}

          {warnings && warnings.length > 0 && (
            <div className="space-y-1.5 rounded-lg border border-amber-300 bg-amber-50 p-2.5">
              <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5" /> Reserved by someone else
              </div>
              <ul className="space-y-1 text-[12px] text-amber-800">
                {warnings.map((w, i) => (
                  <li key={i}>
                    <span className="font-medium">{w.item_name}</span>: {w.message}
                  </li>
                ))}
              </ul>
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
              : `Take ${takeable.length} item${takeable.length === 1 ? '' : 's'}`}
          </Button>
        </>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label className="text-[11.5px] uppercase tracking-wider">Which shoot?</Label>
            {myShoots.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-[12px] text-muted-foreground">
                You have no upcoming shoots. Plan one first.
              </div>
            ) : (
              <ul className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
                {myShoots.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setShootId(s.id)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors',
                        shootId === s.id
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:bg-accent'
                      )}
                    >
                      <Clapperboard className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] font-semibold">{s.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {fmtShootWindow(s.starts_at, s.ends_at)}
                        </div>
                      </div>
                      {shootId === s.id && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Button className="w-full" disabled={busy || !shootId} onClick={saveToShoot}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
            Reserve {rows.length} item{rows.length === 1 ? '' : 's'}
          </Button>
        </>
      )}

      {approvals > 0 && (
        <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-center text-[11.5px] font-medium text-amber-700">
          {approvals} approval{approvals === 1 ? '' : 's'} needed
        </p>
      )}
    </div>
  )
}
