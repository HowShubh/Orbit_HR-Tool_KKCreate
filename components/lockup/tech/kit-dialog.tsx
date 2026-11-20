'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Search } from 'lucide-react'
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
import { createKit, updateKit } from '@/lib/actions/lockup'
import type { EquipmentItemRow, KitRow } from '@/lib/queries/lockup'
import { CATEGORY_LABELS } from '@/lib/lockup/constants'
import { cn } from '@/lib/utils'

export function KitDialog({
  open,
  onOpenChange,
  kit,
  pooledItems,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = create a new kit */
  kit: KitRow | null
  pooledItems: EquipmentItemRow[]
}) {
  const router = useRouter()
  const { pushToast } = useStore()
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)

  // Re-seed the form whenever the dialog opens for a different kit
  useEffect(() => {
    if (open) {
      setName(kit?.name ?? '')
      setNotes(kit?.notes ?? '')
      setMemberIds(kit?.items.map((i) => i.item_id) ?? [])
      setSearch('')
    }
  }, [open, kit])

  const candidates = useMemo(
    () =>
      pooledItems
        .filter((i) => i.status !== 'retired' && i.status !== 'lost')
        .filter((i) => {
          if (!search.trim()) return true
          const q = search.trim().toLowerCase()
          return i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q)
        }),
    [pooledItems, search]
  )

  function toggle(id: string) {
    setMemberIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const valid = name.trim().length > 0 && memberIds.length > 0

  async function submit() {
    setBusy(true)
    try {
      if (kit) {
        await updateKit({ kitId: kit.id, name, notes, itemIds: memberIds })
        pushToast({ title: `${name.trim()} updated`, variant: 'success' })
      } else {
        await createKit({ name, notes: notes || undefined, itemIds: memberIds })
        pushToast({ title: `${name.trim()} created`, variant: 'success' })
      }
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      pushToast({
        title: err instanceof Error ? err.message : 'Could not save the kit',
        variant: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{kit ? `Edit ${kit.name}` : 'New kit'}</DialogTitle>
          <DialogDescription>
            One tap in shoot planning adds every item in the kit. Reservations and returns stay
            per item.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="kit-name">Name</Label>
              <Input
                id="kit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='e.g. "Podcast setup"'
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kit-notes">
                Notes <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="kit-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="what it covers..."
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>
              Items <span className="font-normal text-muted-foreground">({memberIds.length} selected)</span>
            </Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="search gear..."
                className="h-9 pl-8"
              />
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-border p-1.5">
              {candidates.length === 0 && (
                <p className="px-2 py-4 text-center text-[12.5px] text-muted-foreground">
                  Nothing matches.
                </p>
              )}
              {candidates.map((i) => {
                const selected = memberIds.includes(i.id)
                return (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => toggle(i.id)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors',
                      selected ? 'bg-primary/10' : 'hover:bg-muted'
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded border',
                        selected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-muted-foreground/40'
                      )}
                    >
                      {selected && <Check className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {i.name}
                      <span className="ml-1.5 text-[11px] text-muted-foreground">{i.code}</span>
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {CATEGORY_LABELS[i.category]}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

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
          <Button type="button" className="flex-1" disabled={busy || !valid} onClick={submit}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {kit ? 'Save kit' : 'Create kit'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
