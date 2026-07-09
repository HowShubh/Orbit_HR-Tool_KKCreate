'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Clapperboard, Loader2 } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useStore } from '@/lib/store'
import { addStudioBlock } from '@/lib/actions/lockup'
import type { Tables } from '@/lib/supabase/database.types'

function toDateInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Book a studio for a shoot. Hard block: if the slot is taken, the error names
 * the shoot holding it and the exact time, and nothing is saved.
 */
export function StudioBlockDialog({
  open,
  onOpenChange,
  shootId,
  shootName,
  shootStartsAt,
  studios,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  shootId: string
  shootName: string
  shootStartsAt: string
  studios: Tables<'equipment_studios'>[]
}) {
  const router = useRouter()
  const { pushToast } = useStore()
  const [studioId, setStudioId] = useState(studios[0]?.id ?? '')
  const [date, setDate] = useState(toDateInput(shootStartsAt))
  const [fromTime, setFromTime] = useState('10:00')
  const [toTime, setToTime] = useState('18:00')
  const [clash, setClash] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const valid = studioId && date && fromTime && toTime && toTime > fromTime

  async function submit() {
    setBusy(true)
    setClash(null)
    try {
      await addStudioBlock({
        shootId,
        studioId,
        startsAt: new Date(`${date}T${fromTime}`).toISOString(),
        endsAt: new Date(`${date}T${toTime}`).toISOString(),
      })
      const studio = studios.find((s) => s.id === studioId)
      pushToast({
        title: `${studio?.name ?? 'Studio'} is yours`,
        body: `Booked for ${shootName}. Nobody else can take this slot now.`,
        variant: 'success',
      })
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      // Show the clash inline so the user can adjust the time without reopening
      setClash(err instanceof Error ? err.message : 'Booking failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clapperboard className="h-4 w-4" /> Block a studio
          </DialogTitle>
          <DialogDescription>
            Holds the studio for {shootName}. Overlapping bookings are refused, so whoever books
            first has it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {studios.length > 1 && (
            <div className="space-y-1.5">
              <Label>Studio</Label>
              <Select
                value={studioId}
                onValueChange={(v) => {
                  setStudioId(v)
                  setClash(null)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick a studio..." />
                </SelectTrigger>
                <SelectContent>
                  {studios.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="block-date">Date</Label>
            <Input
              id="block-date"
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value)
                setClash(null)
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="block-from">From</Label>
              <Input
                id="block-from"
                type="time"
                value={fromTime}
                onChange={(e) => {
                  setFromTime(e.target.value)
                  setClash(null)
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="block-to">To</Label>
              <Input
                id="block-to"
                type="time"
                value={toTime}
                onChange={(e) => {
                  setToTime(e.target.value)
                  setClash(null)
                }}
              />
            </div>
          </div>

          {clash && (
            <div className="flex gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{clash}</span>
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" className="flex-1" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" className="flex-1" disabled={busy || !valid} onClick={submit}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Block studio
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
