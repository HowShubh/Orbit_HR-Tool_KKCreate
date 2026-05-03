'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { Search } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { BackdateLeaveDialog } from './backdate-leave-dialog'
import { deleteLeave } from '@/lib/actions/leaves'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import type { LeaveWithUser } from '@/lib/queries/leaves'
import type { UserWithMembership } from '@/lib/queries/users'

interface Props {
  leaves: LeaveWithUser[]
  users: UserWithMembership[]
}

const LEAVE_TYPE_LABELS: Record<string, string> = {
  wfh: 'WFH',
  leave: 'Leave',
  compoff_wfh: 'Comp-off WFH',
  compoff_leave: 'Comp-off Leave',
}

const LEAVE_TYPE_PILL: Record<string, string> = {
  wfh: 'bg-blue-50 text-blue-700 ring-blue-100',
  leave: 'bg-orange-50 text-orange-700 ring-orange-100',
  compoff_wfh: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
  compoff_leave: 'bg-amber-50 text-amber-700 ring-amber-100',
}

function TypePill({ type }: { type: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
        LEAVE_TYPE_PILL[type] ?? 'bg-muted text-muted-foreground ring-border'
      )}
    >
      {LEAVE_TYPE_LABELS[type] ?? type}
    </span>
  )
}

function formatDays(value: number) {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)
}

export function AllLeavesTab({ leaves, users }: Props) {
  const router = useRouter()
  const { pushToast } = useStore()
  const [search, setSearch] = useState('')
  const [isPending, startTransition] = useTransition()

  const filteredLeaves = useMemo(() => {
    if (!search.trim()) return leaves
    const q = search.toLowerCase()
    return leaves.filter(
      (l) =>
        l.user_full_name.toLowerCase().includes(q) ||
        l.type.toLowerCase().includes(q) ||
        (l.reason ?? '').toLowerCase().includes(q) ||
        l.start_date.includes(q) ||
        l.end_date.includes(q)
    )
  }, [leaves, search])

  function handleDelete(leaveId: string) {
    if (!window.confirm('Delete this leave? This will refund the balance.')) return
    startTransition(async () => {
      try {
        await deleteLeave(leaveId)
        pushToast({ title: 'Leave deleted', variant: 'success' })
        router.refresh()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to delete leave'
        pushToast({ title: 'Error', body: msg, variant: 'error' })
      }
    })
  }

  const activeCount = leaves.filter((l) => l.status === 'active').length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, type or reason…"
              className="h-9 w-64 rounded-lg border border-border bg-card pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <span className="text-sm text-muted-foreground">
            {activeCount} active leave{activeCount !== 1 ? 's' : ''}
          </span>
        </div>

        <BackdateLeaveDialog
          users={users}
          trigger={
            <Button size="sm">Backdate Leave</Button>
          }
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Employee</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Dates</th>
                  <th className="px-4 py-3 font-medium">Days</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Reason</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filteredLeaves.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-12 text-center text-muted-foreground"
                    >
                      No leaves found.
                    </td>
                  </tr>
                ) : (
                  filteredLeaves.map((leave) => {
                    const isDeleted = leave.status === 'deleted'
                    const createdByUser = users.find((u) => u.id === leave.created_by)
                    const dateRange =
                      leave.start_date === leave.end_date
                        ? format(parseISO(leave.start_date), 'MMM d, yyyy')
                        : `${format(parseISO(leave.start_date), 'MMM d')} – ${format(parseISO(leave.end_date), 'MMM d, yyyy')}`

                    return (
                      <tr
                        key={leave.id}
                        className={cn(
                          'border-t hover:bg-muted/30',
                          isDeleted && 'opacity-50'
                        )}
                      >
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Avatar name={leave.user_full_name} size="sm" />
                            <span className="font-medium">{leave.user_full_name}</span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <TypePill type={leave.type} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {isDeleted ? (
                            <span className="line-through">{dateRange}</span>
                          ) : (
                            dateRange
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                          {formatDays(leave.days_deducted)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <Badge variant={isDeleted ? 'danger' : 'success'}>
                            {isDeleted ? 'Deleted' : 'Active'}
                          </Badge>
                        </td>
                        <td className="min-w-[160px] max-w-[240px] px-4 py-3 text-muted-foreground truncate">
                          {leave.reason ?? '—'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground text-[12px]">
                          {createdByUser
                            ? createdByUser.full_name
                            : leave.created_by === leave.user_id
                            ? 'Self'
                            : 'HR'}
                        </td>
                        <td className="px-4 py-3">
                          {!isDeleted && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isPending}
                              onClick={() => handleDelete(leave.id)}
                              className="text-rose-600 border-rose-200 hover:bg-rose-50"
                            >
                              Delete
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
