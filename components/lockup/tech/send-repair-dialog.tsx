'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Wrench } from 'lucide-react'
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
import { sendToRepair } from '@/lib/actions/lockup'

export function SendToRepairDialog({
  open,
  onOpenChange,
  item,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: { id: string; name: string }
}) {
  const router = useRouter()
  const { pushToast } = useStore()
  const [expectedBackOn, setExpectedBackOn] = useState('')
  const [vendor, setVendor] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      await sendToRepair({
        itemId: item.id,
        expectedBackOn: expectedBackOn || undefined,
        vendor: vendor || undefined,
        notes: notes || undefined,
      })
      pushToast({
        title: `${item.name} sent for repair`,
        body: 'Shoots that reserved it have been warned.',
        variant: 'success',
      })
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      pushToast({ title: err instanceof Error ? err.message : 'Failed', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-4 w-4" /> Send {item.name} to repair
          </DialogTitle>
          <DialogDescription>
            The expected date drives shoot-planning warnings, so set it if you know it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="repair-date">Expected back on</Label>
            <Input
              id="repair-date"
              type="date"
              value={expectedBackOn}
              onChange={(e) => setExpectedBackOn(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="repair-vendor">
              Vendor <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="repair-vendor"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="e.g. Sony Service Center, Andheri"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="repair-notes">
              What is being fixed <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="repair-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. sensor cleaning"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" className="flex-1" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" className="flex-1" disabled={busy} onClick={submit}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Send to repair
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
