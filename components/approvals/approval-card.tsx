'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { approveLeave, rejectLeave } from '@/lib/actions/leaves'
import { ConflictPill } from './conflict-pill'
import { ApprovalCardExpanded } from './approval-card-expanded'
import type { LeaveRequestWithDays } from './leave-request-types'

function summaryText(req: LeaveRequestWithDays): string {
  const parts: string[] = []
  if (req.summary.leave_days > 0) parts.push(`${formatDays(req.summary.leave_days)} Leave`)
  if (req.summary.wfh_days > 0) parts.push(`${formatDays(req.summary.wfh_days)} WFH`)
  const range =
    req.summary.start_date === req.summary.end_date
      ? format(parseISO(req.summary.start_date), 'MMM d, yyyy')
      : `${format(parseISO(req.summary.start_date), 'MMM d')} – ${format(
          parseISO(req.summary.end_date),
          'MMM d, yyyy'
        )}`
  return `${parts.join(' + ')} · ${range}`
}

function formatDays(n: number): string {
  return Number.isInteger(n) ? n.toFixed(0) : n.toFixed(1)
}

export function ApprovalCard({
  request,
  onDecided,
}: {
  request: LeaveRequestWithDays
  onDecided: (id: string) => void
}) {
  const router = useRouter()
  const { pushToast } = useStore()
  const [expanded, setExpanded] = useState(false)
  const [isPending, startTransition] = useTransition()
  const isDeleteRequest = request.status === 'delete_requested'

  function decide(decision: 'approve' | 'reject') {
    startTransition(async () => {
      try {
        if (decision === 'approve') {
          await approveLeave(request.decision_leave_id)
          pushToast({ title: 'Request approved', variant: 'success' })
        } else {
          await rejectLeave(request.decision_leave_id)
          pushToast({ title: 'Request rejected', variant: 'info' })
        }
        onDecided(request.id)
        router.refresh()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to update request'
        pushToast({ title: 'Error', body: msg, variant: 'error' })
      }
    })
  }

  return (
    <div className="overflow-hidden rounded-lg border border-amber-200 bg-white shadow-sm">
      <div
        className="flex cursor-pointer flex-wrap items-start gap-3 p-4 hover:bg-amber-50/40"
        onClick={() => setExpanded((v) => !v)}
      >
        <Avatar name={request.user_full_name} size="md" />
        <div className="min-w-[200px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold text-foreground">
              {request.user_full_name}
            </span>
            {isDeleteRequest ? (
              <Badge variant="warning">Delete request</Badge>
            ) : (
              <Badge variant="warning">Pending</Badge>
            )}
            {request.user_team_name && (
              <span className="text-[11px] text-muted-foreground">
                · {request.user_team_name}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[12.5px] text-muted-foreground">
            {summaryText(request)}
          </div>
          {request.reason && (
            <div
              className="mt-1 truncate text-[12px] text-muted-foreground"
              title={request.reason}
            >
              &ldquo;{request.reason}&rdquo;
            </div>
          )}
          {request.conflicts.length > 0 && (
            <div className="mt-2">
              <ConflictPill conflicts={request.conflicts} />
            </div>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => decide('reject')}
            className="border-rose-200 text-rose-700 hover:bg-rose-50"
          >
            Reject
          </Button>
          <Button size="sm" disabled={isPending} onClick={() => decide('approve')}>
            {isDeleteRequest ? 'Approve Delete' : 'Approve'}
          </Button>
          <button
            type="button"
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted',
            )}
            onClick={(e) => {
              e.stopPropagation()
              setExpanded((v) => !v)
            }}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {expanded && <ApprovalCardExpanded request={request} />}
    </div>
  )
}
