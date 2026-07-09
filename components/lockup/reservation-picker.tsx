'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, Search } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useStore } from '@/lib/store'
import { reserveItems } from '@/lib/actions/lockup'
import type { AvailabilityRow } from '@/lib/queries/lockup'
import { CategoryIcon, CodeChip } from './item-bits'
import { cn } from '@/lib/utils'

/**
 * Availability-aware picker: everything is selectable, but items that clash
 * with this shoot's window carry a visible warning so double-booking is a
 * decision, never an accident.
 */
export function ReservationPicker({
  open,
  onOpenChange,
  shootId,
  shootName,
  availability,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  shootId: string
  shootName: string
  availability: AvailabilityRow[]
}) {
  const router = useRouter()
  const { pushToast } = useStore()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return availability
      .filter((r) => !r.already_reserved_for_shoot)
      .filter(
        (r) =>
          !q ||
          r.name.toLowerCase().includes(q) ||
          r.code.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q)
      )
      .sort((a, b) => Number(Boolean(a.conflict)) - Number(Boolean(b.conflict)))
  }, [availability, query])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function submit() {
    // Optimistic: close immediately and reserve in the background, so adding
    // gear never blocks the user. Errors surface as a toast.
    const ids = Array.from(selected)
    setSelected(new Set())
    onOpenChange(false)
    void (async () => {
      try {
        await reserveItems({ shootId, itemIds: ids })
        pushToast({
          title: `${ids.length} item${ids.length === 1 ? '' : 's'} reserved for ${shootName}`,
          variant: 'success',
        })
      } catch (err) {
        pushToast({
          title: err instanceof Error ? err.message : 'Reservation failed',
          variant: 'error',
        })
      } finally {
        router.refresh()
      }
    })()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reserve gear</DialogTitle>
          <DialogDescription>For {shootName}. Items with a warning clash with this shoot&apos;s dates.</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search gear..."
            className="pl-9"
          />
        </div>

        <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
          {rows.map((r) => {
            const isSelected = selected.has(r.item_id)
            return (
              <li key={r.item_id}>
                <button
                  type="button"
                  onClick={() => toggle(r.item_id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors',
                    isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/50'
                  )}
                >
                  <div
                    className={cn(
                      'grid h-5 w-5 shrink-0 place-items-center rounded border',
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input'
                    )}
                  >
                    {isSelected && <Check className="h-3.5 w-3.5" />}
                  </div>
                  <CategoryIcon category={r.category} photoUrl={r.photo_url} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13.5px] font-medium">{r.name}</span>
                      <CodeChip code={r.code} />
                    </div>
                    {r.conflict ? (
                      <div className="flex items-center gap-1 text-[11.5px] font-medium text-amber-600">
                        <AlertTriangle className="h-3 w-3 shrink-0" /> {r.conflict.message}
                      </div>
                    ) : (
                      <div className="text-[11.5px] text-emerald-600">Free on those dates</div>
                    )}
                  </div>
                </button>
              </li>
            )
          })}
          {rows.length === 0 && (
            <li className="px-3 py-8 text-center text-[13px] text-muted-foreground">
              Nothing matches.
            </li>
          )}
        </ul>

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" className="flex-1" disabled={selected.size === 0} onClick={submit}>
            Reserve {selected.size > 0 ? selected.size : ''}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
