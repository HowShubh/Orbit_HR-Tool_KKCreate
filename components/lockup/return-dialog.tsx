'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useStore } from '@/lib/store'
import { checkinItem } from '@/lib/actions/lockup'
import type { Tables } from '@/lib/supabase/database.types'
import { cn } from '@/lib/utils'

/**
 * One-tap return: pick which cupboard it went back to (defaults to the item's
 * home) and optionally report a problem.
 */
export function ReturnDialog({
  open,
  onOpenChange,
  item,
  locations,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: { id: string; name: string; home_location_id: string | null }
  locations: Tables<'equipment_locations'>[]
  onDone?: () => void
}) {
  const router = useRouter()
  const { pushToast } = useStore()
  const [locationId, setLocationId] = useState<string | null>(
    item.home_location_id ?? locations[0]?.id ?? null
  )
  const [showIssue, setShowIssue] = useState(false)
  const [issueNote, setIssueNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!locationId) {
      pushToast({ title: 'Pick where you put it back.', variant: 'error' })
      return
    }
    setBusy(true)
    try {
      await checkinItem({
        itemId: item.id,
        locationId,
        issueNote: showIssue ? issueNote : undefined,
      })
      pushToast({ title: `${item.name} checked in`, variant: 'success' })
      onOpenChange(false)
      onDone?.()
      router.refresh()
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
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Check in {item.name}</DialogTitle>
          <DialogDescription>Where did you put it back?</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          {locations.map((loc) => (
            <button
              key={loc.id}
              type="button"
              onClick={() => setLocationId(loc.id)}
              className={cn(
                'rounded-xl border px-3 py-3 text-[14px] font-semibold transition-colors',
                locationId === loc.id
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:bg-accent'
              )}
            >
              {loc.label}
              {item.home_location_id === loc.id && (
                <span className="block text-[10.5px] font-normal text-muted-foreground">
                  home shelf
                </span>
              )}
            </button>
          ))}
        </div>

        {showIssue ? (
          <div className="space-y-1.5">
            <Label htmlFor="lockup-issue">What is wrong with it?</Label>
            <Textarea
              id="lockup-issue"
              value={issueNote}
              onChange={(e) => setIssueNote(e.target.value)}
              placeholder="e.g. lens cap missing, battery not holding charge"
              rows={3}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowIssue(true)}
            className="text-left text-[12.5px] text-muted-foreground underline-offset-2 hover:underline"
          >
            Report a problem with this item
          </button>
        )}

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" className="flex-1" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={busy || !locationId || (showIssue && !issueNote.trim())}
            onClick={submit}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Check in
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
