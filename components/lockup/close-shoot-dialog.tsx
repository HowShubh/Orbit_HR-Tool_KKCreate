'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, Loader2, MessageSquare, PackageCheck } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useStore } from '@/lib/store'
import { checkinItem, forceCheckin } from '@/lib/actions/lockup'
import type { OutstandingGearRow } from '@/lib/queries/lockup'
import type { Tables } from '@/lib/supabase/database.types'
import { cn } from '@/lib/utils'
import { CategoryIcon, CodeChip, fmtDayTime } from './item-bits'

/**
 * Cancelling or deleting a shoot while its gear is still out would strand the
 * item: checked out to someone, with nothing left to say why. So this asks for
 * the gear back first — tick each item in as it comes back, and the destructive
 * button only unlocks once the list is empty.
 */
export function CloseShootDialog({
  open,
  onOpenChange,
  mode,
  shootName,
  outstanding,
  locations,
  currentUserId,
  canManageEquipment,
  busy,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'cancel' | 'delete'
  shootName: string
  outstanding: OutstandingGearRow[]
  locations: Tables<'equipment_locations'>[]
  currentUserId: string
  canManageEquipment: boolean
  busy: boolean
  onConfirm: () => void
}) {
  const router = useRouter()
  const { pushToast } = useStore()
  const [returningId, setReturningId] = useState<string | null>(null)
  const [shelfId, setShelfId] = useState<string>(locations[0]?.id ?? '')

  const blocked = outstanding.length > 0
  const isDelete = mode === 'delete'

  async function giveBack(row: OutstandingGearRow) {
    if (!shelfId) {
      pushToast({ title: 'Pick which shelf it goes back to.', variant: 'error' })
      return
    }
    setReturningId(row.item_id)
    try {
      // You can only check in gear you hold. A manager can force anyone's back,
      // which is exactly the case where the holder has left for the day.
      if (row.holder_id === currentUserId) {
        await checkinItem({ itemId: row.item_id, locationId: shelfId })
      } else {
        await forceCheckin(row.item_id)
      }
      pushToast({ title: `${row.name} is back`, variant: 'success' })
      router.refresh()
    } catch (err) {
      pushToast({
        title: err instanceof Error ? err.message : 'Could not check it in',
        variant: 'error',
      })
    } finally {
      setReturningId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isDelete ? 'Delete' : 'Cancel'} {shootName}?
          </DialogTitle>
          <DialogDescription>
            {blocked
              ? `${outstanding.length} item${outstanding.length === 1 ? '' : 's'} from this shoot ${outstanding.length === 1 ? 'is' : 'are'} still out. Get ${outstanding.length === 1 ? 'it' : 'them'} back first.`
              : isDelete
                ? 'This removes the shoot, its reservations and its studio slots. Gear history stays on each item.'
                : 'This releases its gear reservations and frees the studio. The shoot stays visible as cancelled.'}
          </DialogDescription>
        </DialogHeader>

        {blocked && (
          <>
            <div className="flex items-center gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Tick each item in as it comes back to the cupboard.
            </div>

            <div className="space-y-1.5">
              <span className="text-[11.5px] font-medium text-muted-foreground">
                Returning to
              </span>
              <Select value={shelfId} onValueChange={setShelfId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a shelf" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <ul className="space-y-2">
              {outstanding.map((row) => {
                const mine = row.holder_id === currentUserId
                const canReturn = mine || canManageEquipment
                return (
                  <li
                    key={row.checkout_id}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border px-3 py-2.5',
                      row.overdue ? 'border-rose-200 bg-rose-50' : 'border-border'
                    )}
                  >
                    <CategoryIcon category={row.category} photoUrl={row.photo_url} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13.5px] font-semibold">{row.name}</span>
                        <CodeChip code={row.code} />
                      </div>
                      <div
                        className={cn(
                          'text-[11.5px]',
                          row.overdue ? 'text-rose-700' : 'text-muted-foreground'
                        )}
                      >
                        {mine ? 'You have it' : `${row.holder_name} has it`}
                        {row.due_at
                          ? ` · ${row.overdue ? 'was due' : 'due'} ${fmtDayTime(row.due_at)}`
                          : ''}
                      </div>
                    </div>

                    {canReturn ? (
                      <Button
                        size="sm"
                        variant={mine ? 'default' : 'outline'}
                        disabled={returningId !== null}
                        onClick={() => giveBack(row)}
                      >
                        {returningId === row.item_id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        {mine ? 'Return' : 'Force in'}
                      </Button>
                    ) : (
                      <a
                        href={`/lockup/items/${row.code}`}
                        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground hover:bg-accent"
                      >
                        <MessageSquare className="h-3.5 w-3.5" /> Ask {row.holder_name.split(' ')[0]}
                      </a>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}

        {!blocked && (
          <div className="flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[12.5px] text-emerald-800">
            <PackageCheck className="h-4 w-4 shrink-0" />
            All gear from this shoot is back in the cupboard.
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            className="flex-1"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Keep the shoot
          </Button>
          <Button
            variant={isDelete ? 'destructive' : 'default'}
            className="flex-1"
            disabled={busy || blocked}
            onClick={onConfirm}
            title={blocked ? 'Return the gear first' : undefined}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {isDelete ? 'Delete the shoot' : 'Cancel the shoot'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
