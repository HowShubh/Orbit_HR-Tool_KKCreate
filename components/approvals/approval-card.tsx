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
import {
  approveLeave,
  approveLeaveDeletion,
  rejectLeave,
  rejectLeaveDeletion,
} from '@/lib/actions/leaves'
import { ConflictPill } from './conflict-pill'
import { ApprovalCardExpanded } from './approval-card-expanded'
import type { LeaveRequestWithDays } from './leave-request-types'

function summaryText(req: LeaveRequestWithDays): string {
  const totals = new Map<string, number>()
  for (const day of req.days) {
    totals.set(day.type_name, (totals.get(day.type_name) ?? 0) + day.days_deducted)
  }
  const parts = Array.from(totals.entries()).map(
    ([label, days]) => `${formatDays(days)} ${label}`
  )
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
  const { pushToast, currentUser } = useStore()
  const [expanded, setExpanded] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [confirmOverride, setConfirmOverride] = useState<'approve' | 'reject' | null>(null)
  const isDeleteRequest = request.status === 'delete_requested'

  // The manager is the normal approver. If the viewer is an HR/Founder acting on
  // someone whose manager isn't them, it's an override — prompt before deciding.
  const isManager = request.user_manager_id === currentUser.id
  const isPrivileged = currentUser.role === 'hr' || currentUser.role === 'founder'
  const isOverride = isPrivileged && !isManager && request.user_manager_id != null

  function requestDecision(decision: 'approve' | 'reject') {
    if (isOverride) {
      setConfirmOverride(decision)
      return
    }
    decide(decision)
  }

  function decide(decision: 'approve' | 'reject') {
    setConfirmOverride(null)
    startTransition(async () => {
      try {
        if (decision === 'approve' && isDeleteRequest) {
          await approveLeaveDeletion(request.decision_leave_id)
          pushToast({ title: 'Leave deletion approved', variant: 'success' })
        } else if (decision === 'reject' && isDeleteRequest) {
          await rejectLeaveDeletion(request.decision_leave_id)
          pushToast({ title: 'Leave deletion rejected', variant: 'info' })
        } else if (decision === 'approve') {
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
            onClick={() => requestDecision('reject')}
            className="border-rose-200 text-rose-700 hover:bg-rose-50"
          >
            Reject
          </Button>
          <Button size="sm" disabled={isPending} onClick={() => requestDecision('approve')}>
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
      {confirmOverride && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-900">
          <span>
            This is normally <strong>{request.user_manager_name}</strong>&rsquo;s request to
            decide. You have permission to override and{' '}
            {confirmOverride === 'approve' ? 'approve' : 'reject'} it. Continue?
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => setConfirmOverride(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={isPending}
              onClick={() => decide(confirmOverride)}
              className={
                confirmOverride === 'reject'
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : undefined
              }
            >
              {isPending
                ? 'Working…'
                : `Yes, override & ${confirmOverride === 'approve' ? 'approve' : 'reject'}`}
            </Button>
          </div>
        </div>
      )}
      {expanded && <ApprovalCardExpanded request={request} />}
    </div>
  )
}
