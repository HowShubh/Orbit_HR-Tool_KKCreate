'use client'

import { useMemo, useState } from 'react'
import { ApprovalCard } from './approval-card'
import type { LeaveRequestWithDays } from './leave-request-types'

export function ApprovalQueueClient({
  initialRequests,
}: {
  initialRequests: LeaveRequestWithDays[]
}) {
  const [optimisticallyDecided, setDecided] = useState<Set<string>>(new Set())
  const visible = useMemo(
    () => initialRequests.filter((r) => !optimisticallyDecided.has(r.id)),
    [initialRequests, optimisticallyDecided]
  )

  if (visible.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-[13px] text-muted-foreground">
        All caught up — 0 pending approvals.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="text-[12px] font-medium text-muted-foreground">
        {visible.length} pending request{visible.length !== 1 ? 's' : ''}
      </div>
      {visible.map((req) => (
        <ApprovalCard
          key={req.id}
          request={req}
          onDecided={(id) =>
            setDecided((s) => {
              const next = new Set(s)
              next.add(id)
              return next
            })
          }
        />
      ))}
    </div>
  )
}
