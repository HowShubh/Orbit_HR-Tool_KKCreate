'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { backdateLeave } from '@/lib/actions/leaves'
import { useStore } from '@/lib/store'
import type { UserWithMembership } from '@/lib/queries/users'

interface Props {
  users: UserWithMembership[]
  trigger?: React.ReactNode
}

export function BackdateLeaveDialog({ users, trigger }: Props) {
  const router = useRouter()
  const { pushToast } = useStore()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const [userId, setUserId] = useState('')
  const [type, setType] = useState<'wfh' | 'leave' | 'compoff_wfh' | 'compoff_leave'>('leave')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [halfDayStart, setHalfDayStart] = useState(false)
  const [halfDayEnd, setHalfDayEnd] = useState(false)
  const [halfDayPosition, setHalfDayPosition] = useState<'first_half' | 'second_half'>('first_half')
  const [reason, setReason] = useState('')

  const isSingleDay = startDate === endDate && startDate !== ''
  const showPosition = halfDayStart && isSingleDay

  const activeUsers = users.filter((u) => u.status === 'active')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) {
      pushToast({ title: 'Error', body: 'Please select a user', variant: 'error' })
      return
    }
    startTransition(async () => {
      try {
        await backdateLeave({
          user_id: userId,
          type,
          start_date: startDate,
          end_date: endDate,
          half_day_start: halfDayStart,
          half_day_end: !isSingleDay && halfDayEnd ? halfDayEnd : false,
          half_day_position: showPosition ? halfDayPosition : null,
          reason: reason || null,
        })
        pushToast({ title: 'Leave backdated successfully', variant: 'success' })
        setOpen(false)
        router.refresh()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to backdate leave'
        pushToast({ title: 'Error', body: msg, variant: 'error' })
      }
    })
  }

  function handleOpenChange(v: boolean) {
    setOpen(v)
    if (!v) {
      setUserId('')
      setType('leave')
      setStartDate('')
      setEndDate('')
      setHalfDayStart(false)
      setHalfDayEnd(false)
      setHalfDayPosition('first_half')
      setReason('')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">Backdate Leave</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Backdate Leave</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Employee</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select employee…" />
              </SelectTrigger>
              <SelectContent>
                {activeUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="leave">Leave</SelectItem>
                <SelectItem value="wfh">Work From Home (WFH)</SelectItem>
                <SelectItem value="compoff_leave">Comp-off Leave</SelectItem>
                <SelectItem value="compoff_wfh">Comp-off WFH</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start date</Label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value)
                  if (!endDate || e.target.value > endDate) setEndDate(e.target.value)
                }}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>End date</Label>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                required
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={halfDayStart}
                onChange={(e) => setHalfDayStart(e.target.checked)}
                className="rounded"
              />
              Half day (start)
            </label>
            {!isSingleDay && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={halfDayEnd}
                  onChange={(e) => setHalfDayEnd(e.target.checked)}
                  className="rounded"
                />
                Half day (end)
              </label>
            )}
          </div>

          {showPosition && (
            <div className="space-y-1.5">
              <Label>Half day position</Label>
              <Select
                value={halfDayPosition}
                onValueChange={(v) => setHalfDayPosition(v as 'first_half' | 'second_half')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="first_half">First half</SelectItem>
                  <SelectItem value="second_half">Second half</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Reason (optional)</Label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Note for audit trail…"
              className="flex min-h-[80px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : 'Backdate leave'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
