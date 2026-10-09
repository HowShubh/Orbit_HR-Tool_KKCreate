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
import { Textarea } from '@/components/ui/textarea'
import { useStore } from '@/lib/store'
import { reportIssue } from '@/lib/actions/lockup'

export function ReportIssueDialog({
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
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      await reportIssue({ itemId: item.id, note })
      pushToast({
        title: 'Problem reported',
        body: 'The tech lead has been notified.',
        variant: 'success',
      })
      setNote('')
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      pushToast({
        title: err instanceof Error ? err.message : 'Could not report the problem',
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
          <DialogTitle>Report a problem</DialogTitle>
          <DialogDescription>{item.name}</DialogDescription>
        </DialogHeader>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What is wrong? e.g. autofocus hunting, dent on the hood"
          rows={4}
        />
        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" className="flex-1" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" className="flex-1" disabled={busy || !note.trim()} onClick={submit}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Report
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
