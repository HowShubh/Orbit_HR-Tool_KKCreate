'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { PersonName } from '@/components/people/person-drawer-context'
import { cn } from '@/lib/utils'
import type { LeaveRequestWithDays, LeaveRequestStatus } from './leave-request-types'

const STATUS_LABEL: Record<LeaveRequestStatus, string> = {
  pending: 'Pending',
  active: 'Approved',
  rejected: 'Rejected',
  deleted: 'Deleted',
  delete_requested: 'Delete Requested',
}

const STATUS_VARIANT: Record<LeaveRequestStatus, 'success' | 'warning' | 'danger' | 'muted'> = {
  pending: 'warning',
  active: 'success',
  rejected: 'danger',
  deleted: 'muted',
  delete_requested: 'warning',
}

export function RequestHistoryTable({
  history,
}: {
  history: LeaveRequestWithDays[]
}) {
  const [open, setOpen] = useState(false)
  const counts = history.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1
      return acc
    },
    {} as Record<string, number>
  )
  const summary = `${counts.active ?? 0} approved · ${counts.rejected ?? 0} rejected · ${counts.deleted ?? 0} deleted`

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/40"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="text-[13px] font-semibold">Past requests</span>
          <span className="text-[12px] text-muted-foreground">· {summary}</span>
        </div>
      </button>
      {open && (
        <Card className="rounded-t-none border-0 border-t">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 text-left text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Employee</th>
                    <th className="px-4 py-2 font-medium">Summary</th>
                    <th className="px-4 py-2 font-medium">Dates</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Decided</th>
                  </tr>
                </thead>
                <tbody>
                  {history.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        No past requests.
                      </td>
                    </tr>
                  ) : (
                    history.map((r) => (
                      <tr key={r.id} className={cn('border-t', r.status === 'deleted' && 'opacity-50')}>
                        <td className="whitespace-nowrap px-4 py-2">
                          <div className="flex items-center gap-2">
                            <Avatar name={r.user_full_name} size="sm" />
                            <PersonName userId={r.user_id} name={r.user_full_name} className="font-medium" />
                          </div>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {Array.from(
                            r.days.reduce((totals, day) => {
                              totals.set(day.type_name, (totals.get(day.type_name) ?? 0) + day.days_deducted)
                              return totals
                            }, new Map<string, number>())
                          )
                            .map(([label, days]) => `${days} ${label}`)
                            .join(' + ')}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                          {r.summary.start_date === r.summary.end_date
                            ? format(parseISO(r.summary.start_date), 'MMM d, yyyy')
                            : `${format(parseISO(r.summary.start_date), 'MMM d')} – ${format(
                                parseISO(r.summary.end_date),
                                'MMM d, yyyy'
                              )}`}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2">
                          <Badge variant={STATUS_VARIANT[r.status] ?? 'muted'}>
                            {STATUS_LABEL[r.status] ?? r.status}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-[12px] text-muted-foreground">
                          {r.decided_at ? format(parseISO(r.decided_at), 'MMM d, yyyy') : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
