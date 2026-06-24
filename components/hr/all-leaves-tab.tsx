'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ApprovalQueueClient } from '@/components/approvals/approval-queue-client'
import { RequestHistoryTable } from '@/components/approvals/request-history-table'
import { BackdateLeaveDialog } from './backdate-leave-dialog'
import { BacklogLeavesCsvImport } from './backlog-leaves-csv-import'
import type { LeaveRequestWithDays } from '@/components/approvals/leave-request-types'
import type { UserWithMembership } from '@/lib/queries/users'
import type { LeaveTypePolicy } from '@/lib/leave-types'

interface Props {
  pendingRequests: LeaveRequestWithDays[]
  history: LeaveRequestWithDays[]
  users: UserWithMembership[]
  leaveTypes: LeaveTypePolicy[]
}

export function AllLeavesTab({ pendingRequests, history, users, leaveTypes }: Props) {
  const [search, setSearch] = useState('')
  const [importOpen, setImportOpen] = useState(false)

  const filteredHistory = search.trim()
    ? history.filter((r) => {
        const q = search.toLowerCase()
        return (
          r.user_full_name.toLowerCase().includes(q) ||
          (r.reason ?? '').toLowerCase().includes(q) ||
          r.summary.start_date.includes(q) ||
          r.summary.end_date.includes(q)
        )
      })
    : history

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search history…"
              className="h-9 w-64 rounded-lg border border-border bg-card pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <span className="text-sm text-muted-foreground">
            {pendingRequests.length} pending
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            Import CSV
          </Button>
          <BackdateLeaveDialog
            users={users}
            leaveTypes={leaveTypes}
            trigger={<Button size="sm">Backdate Leave</Button>}
          />
        </div>
      </div>

      <BacklogLeavesCsvImport
        open={importOpen}
        onOpenChange={setImportOpen}
        users={users}
        leaveTypes={leaveTypes}
      />

      <ApprovalQueueClient initialRequests={pendingRequests} />

      <RequestHistoryTable history={filteredHistory} />
    </div>
  )
}
