'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, Clapperboard, Loader2, ScanLine, ShoppingCart, X } from 'lucide-react'
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
  myOverdue = [],
  onDone,
}: {
  items: EquipmentItemRow[]
  shoots: ShootSummary[]
  currentUserId: string
  /** What this person already owes back. Warned about, never blocking. */
  myOverdue?: { item_name: string; days_late: number }[]
  /** Lets the sheet close itself after a successful checkout. */
  onDone?: () => void
}) {
  const router = useRouter()
  const { pushToast } = useStore()
  const cart = useCart()
  const [busy, setBusy] = useState(false)
  const [shootId, setShootId] = useState<string | null>(null)

  // Resolve ids against live rows, so a cart can never be stale about status.
  const rows = cart.ids.flatMap((id) => {
    const item = items.find((i) => i.id === id)
    return item ? [item] : []
  })
  const approvals = rows.filter((r) => r.requires_approval).length
  const myShoots = shoots.filter(
    (s) => s.owner_id === currentUserId && s.status !== 'done' && s.status !== 'cancelled'
  )

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
      {myOverdue.length > 0 && (
        <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-2.5">
          <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5" />
            You still have {myOverdue.length} item{myOverdue.length === 1 ? '' : 's'} out
          </div>
          <ul className="text-[11.5px] text-amber-800">
            {myOverdue.slice(0, 3).map((o, i) => (
              <li key={i}>
                {o.item_name} · {o.days_late} day{o.days_late === 1 ? '' : 's'} late
              </li>
            ))}
            {myOverdue.length > 3 && <li>and {myOverdue.length - 3} more</li>}
          </ul>
          <p className="text-[11px] text-amber-700">
            Take what you need, but please drop these back today.
          </p>
        </div>
      )}

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

      {/* Reserve only. Physically taking gear always starts with a scan at the
          shelf, so there is exactly one way for an item to leave the cupboard. */}
      <div className="space-y-1.5">
        <Label className="text-[11.5px] uppercase tracking-wider">Reserve for which shoot?</Label>
        {myShoots.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-[12px] text-muted-foreground">
            You have no upcoming shoots. Plan one first, then come back.
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
                    shootId === s.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent'
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

      <p className="rounded-lg bg-muted px-2.5 py-2 text-[11.5px] text-muted-foreground">
        <ScanLine className="mr-1 inline h-3 w-3" />
        Reserving holds gear for a shoot. To actually take something now, scan its sticker at the
        shelf.
      </p>

      {approvals > 0 && (
        <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-center text-[11.5px] font-medium text-amber-700">
          {approvals} approval{approvals === 1 ? '' : 's'} needed
        </p>
      )}
    </div>
  )
}
