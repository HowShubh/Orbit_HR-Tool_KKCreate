'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clapperboard, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useStore } from '@/lib/store'
import { addStudioBlock } from '@/lib/actions/lockup'
import type { StudioScheduleEntry } from '@/lib/queries/lockup'
import type { Tables } from '@/lib/supabase/database.types'
import { StudioWeekPicker } from './studio-week-picker'
import { slotLabel, dayLabel, type StudioSlot } from './schedule-picker'

/**
 * Block a studio for a shoot, using the SAME week grid as the wizard's step 2
 * and the Studio tab — tap free time, adjust below, book several slots at once
 * — instead of the old three-field popup that defaulted to arbitrary times.
 */
export function AddStudioDialog({
  open,
  onOpenChange,
  shootId,
  shootName,
  studios,
  blocks,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  shootId: string
  shootName: string
  studios: Tables<'equipment_studios'>[]
  blocks: StudioScheduleEntry[]
}) {
  const router = useRouter()
  const { pushToast } = useStore()
  const [slots, setSlots] = useState<StudioSlot[]>([])
  const [busy, setBusy] = useState(false)

  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setSlots([])
  }

  const studioNameOf = (id: string) => studios.find((s) => s.id === id)?.name ?? 'Studio'

  async function book() {
    if (slots.length === 0) return
    setBusy(true)
    try {
      for (const sl of slots) {
        await addStudioBlock({
          shootId,
          studioId: sl.studioId,
          startsAt: new Date(`${sl.date}T${sl.startHM}`).toISOString(),
          endsAt: new Date(`${sl.date}T${sl.endHM}`).toISOString(),
        })
      }
      pushToast({
        title: slots.length === 1 ? 'Studio booked' : `${slots.length} studio slots booked`,
        variant: 'success',
      })
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      pushToast({
        title: err instanceof Error ? err.message : 'Could not book the studio',
        variant: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Block a studio for {shootName}</DialogTitle>
          <DialogDescription>
            Tap free time on the grid to hold a room. Overlapping bookings are refused, so whoever
            books first has it.
          </DialogDescription>
        </DialogHeader>

        <StudioWeekPicker
          studios={studios}
          blocks={blocks}
          slots={slots}
          onSlotsChange={setSlots}
          slotsTitle="Booking for this shoot"
          emptyHint="Nothing picked yet. Tap any free time above to hold a room."
        />

        <div className="flex gap-2 border-t border-border pt-3">
          <Button variant="outline" className="flex-1" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="flex-1" disabled={busy || slots.length === 0} onClick={book}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
            Book {slots.length === 1 ? 'the room' : `${slots.length || ''} slots`}
          </Button>
        </div>

        {slots.length > 0 && (
          <p className="text-center text-[11.5px] text-muted-foreground">
            {slots
              .slice()
              .sort((a, b) => `${a.date}T${a.startHM}`.localeCompare(`${b.date}T${b.startHM}`))
              .map(
                (sl) =>
                  `${studioNameOf(sl.studioId)} ${dayLabel(sl.date)} ${slotLabel(sl.startHM)}–${slotLabel(sl.endHM)}`
              )
              .join('  ·  ')}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
