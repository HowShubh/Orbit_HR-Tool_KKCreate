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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useStore } from '@/lib/store'
import { createShoot } from '@/lib/actions/lockup'

function todayInput(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function ShootCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const { pushToast } = useStore()
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [startDate, setStartDate] = useState(todayInput(1))
  const [endDate, setEndDate] = useState(todayInput(1))
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      // Whole-day window: gear can be picked up from 24h before the first day
      // and reservations expire 24h after it starts.
      const shootId = await createShoot({
        name,
        location: location || undefined,
        startsAt: new Date(`${startDate}T00:00`).toISOString(),
        endsAt: new Date(`${endDate}T23:59`).toISOString(),
      })
      pushToast({ title: `${name} created`, body: 'Now reserve the gear it needs.', variant: 'success' })
      onOpenChange(false)
      setName('')
      setLocation('')
      router.push(`/lockup/shoots/${shootId}`)
      router.refresh()
    } catch (err) {
      pushToast({
        title: err instanceof Error ? err.message : 'Could not create the shoot',
        variant: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  const valid = name.trim().length > 0 && startDate && endDate && endDate >= startDate

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New shoot</DialogTitle>
          <DialogDescription>
            Reserve gear against it so conflicts show up before the shoot day.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="shoot-name">Name</Label>
            <Input
              id="shoot-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Spiti travel film"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="shoot-location">
              Location <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="shoot-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Studio B, Udaipur"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="shoot-start">First day</Label>
              <Input
                id="shoot-start"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value)
                  if (endDate < e.target.value) setEndDate(e.target.value)
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shoot-end">Last day</Label>
              <Input
                id="shoot-end"
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" className="flex-1" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" className="flex-1" disabled={busy || !valid} onClick={submit}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Create shoot
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
