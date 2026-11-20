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
import { takeOverItem } from '@/lib/actions/lockup'

/** On-set handover: responsibility moves to the person scanning. */
export function TransferDialog({
  open,
  onOpenChange,
  item,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: { id: string; name: string; holder_name: string | null; due_at: string | null }
  onDone?: () => void
}) {
  const router = useRouter()
  const { pushToast } = useStore()
  const [dueLocal, setDueLocal] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      await takeOverItem({
        itemId: item.id,
        dueAt: dueLocal ? new Date(dueLocal).toISOString() : undefined,
      })
      pushToast({
        title: `${item.name} is now with you`,
        body: `${item.holder_name ?? 'The previous holder'} has been told.`,
        variant: 'success',
      })
      onOpenChange(false)
      onDone?.()
      router.refresh()
    } catch (err) {
      pushToast({
        title: err instanceof Error ? err.message : 'Take-over failed',
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
          <DialogTitle>Take over {item.name}</DialogTitle>
          <DialogDescription>
            It is currently with {item.holder_name ?? 'someone else'}. Taking over makes it your
            responsibility, and they get notified.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="lockup-transfer-due">
            New return time <span className="text-muted-foreground font-normal">(optional, keeps the current one if empty)</span>
          </Label>
          <Input
            id="lockup-transfer-due"
            type="datetime-local"
            value={dueLocal}
            onChange={(e) => setDueLocal(e.target.value)}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" className="flex-1" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" className="flex-1" disabled={busy} onClick={submit}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Take over
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
