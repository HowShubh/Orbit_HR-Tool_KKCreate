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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useStore } from '@/lib/store'
import { setItemAssignee } from '@/lib/actions/lockup'

/** Managers pick (or clear) the long-term owner of an assigned device. */
export function AssignDeviceDialog({
  open,
  onOpenChange,
  item,
  people,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: { id: string; name: string; assignee_id: string | null }
  people: { id: string; full_name: string }[]
}) {
  const router = useRouter()
  const { pushToast } = useStore()
  const UNASSIGNED = '__none__'
  const [userId, setUserId] = useState(item.assignee_id ?? UNASSIGNED)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      const assigneeId = userId === UNASSIGNED ? null : userId
      await setItemAssignee({ itemId: item.id, assigneeId })
      const person = people.find((p) => p.id === assigneeId)
      pushToast({
        title: person ? `${item.name} assigned to ${person.full_name}` : `${item.name} owner cleared`,
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
          <DialogTitle>Assign {item.name}</DialogTitle>
          <DialogDescription>
            The owner is who this device belongs to long-term. They can still lend it out.
          </DialogDescription>
        </DialogHeader>
        <Select value={userId} onValueChange={setUserId}>
          <SelectTrigger>
            <SelectValue placeholder="Pick a person..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
            {people.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" className="flex-1" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" className="flex-1" disabled={busy} onClick={submit}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
