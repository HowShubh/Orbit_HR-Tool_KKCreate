'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO, differenceInDays } from 'date-fns'
import { Plus, Search, Sparkles, Download } from 'lucide-react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { LeaveFormDialog } from '@/components/leave/leave-form-dialog'
import { CompoffRequestDialog } from '@/components/leave/compoff-request-dialog'
import { deleteLeave } from '@/lib/actions/leaves'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import type { AppUser } from '@/lib/auth/get-current-user'
import type { LeaveTypePolicy } from '@/lib/leave-types'
import type { Tables } from '@/lib/supabase/database.types'

type LeavesTab = 'leaves' | 'compoff'

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

const LEAVE_STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  active: 'Approved',
  delete_requested: 'Delete Requested',
  rejected: 'Rejected',
  deleted: 'Deleted',
}

const LEAVE_STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'muted'> = {
  pending: 'warning',
  active: 'success',
  delete_requested: 'warning',
  rejected: 'danger',
  deleted: 'muted',
}

function TypePill({ type, label }: { type: string; label?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
        LEAVE_TYPE_PILL[type] ?? 'bg-muted text-muted-foreground ring-border'
      )}
    >
      {label ?? LEAVE_TYPE_LABELS[type] ?? type}
    </span>
  )
}

function formatDays(value: number) {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)
}

function dateLabel(date: string) {
  return format(parseISO(date), 'MMM d, yyyy')
}

function rangeLabel(start: string, end: string) {
  if (start === end) return dateLabel(start)
  return `${format(parseISO(start), 'MMM d')} – ${dateLabel(end)}`
}

interface Props {
  currentUser: AppUser
  leaves: Tables<'leaves'>[]
  compoff: Tables<'compoff_grants'>[]
  balances: Tables<'leave_balances'>[]
  compoffBalances: Tables<'leave_balances'>[]
  leaveTypes: LeaveTypePolicy[]
}

export function MyLeavesClient({ currentUser, leaves, compoff, balances, compoffBalances, leaveTypes }: Props) {
  const router = useRouter()
  const { pushToast } = useStore()
  const [tab, setTab] = useState<LeavesTab>('leaves')
  const [search, setSearch] = useState('')
  const [isPending, startTransition] = useTransition()

  const allBalances = [...balances, ...compoffBalances]
  const visibleBalanceTypes = leaveTypes.filter(
    (type) => type.is_active && allBalances.some((balance) => balance.type === type.key)
  )
  const balanceSummary = visibleBalanceTypes.map((type) => {
    const bal = allBalances.find((b) => b.type === type.key)
    const allocated = bal?.allocated ?? 0
    const used = bal?.used ?? 0
    const remaining = Math.max(0, allocated - used)
    return { type: type.key, label: type.name, allocated, used, remaining }
  })

  const filteredLeaves = useMemo(() => {
    if (!search.trim()) return leaves
    const q = search.toLowerCase()
    return leaves.filter(
      (l) =>
        l.type.toLowerCase().includes(q) ||
        (l.reason ?? '').toLowerCase().includes(q) ||
        l.start_date.includes(q) ||
        l.end_date.includes(q)
    )
  }, [leaves, search])

  const filteredCompoff = useMemo(() => {
    if (!search.trim()) return compoff
    const q = search.toLowerCase()
    return compoff.filter(
      (g) =>
        g.type.toLowerCase().includes(q) ||
        g.reason.toLowerCase().includes(q) ||
        g.status.toLowerCase().includes(q) ||
        g.work_date.includes(q)
    )
  }, [compoff, search])

  function handleDelete(leave: Tables<'leaves'>) {
    const isApproved = leave.status === 'active'
    // HR & founders approve their own actions, so their approved leaves are
    // removed immediately rather than routed for deletion approval.
    const selfApproves = currentUser.role === 'hr' || currentUser.role === 'founder'
    const message = !isApproved
      ? 'Delete this pending leave request?'
      : selfApproves
        ? 'Remove this approved leave? It will be deleted and the balance restored.'
        : 'Request deletion for this approved leave? It will stay approved until HR or your manager approves the deletion.'
    if (!window.confirm(message)) return
    startTransition(async () => {
      try {
        const result = await deleteLeave(leave.id)
        pushToast({
          title: result?.status === 'delete_requested' ? 'Deletion request sent' : 'Leave removed',
          variant: 'success',
        })
        router.refresh()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to update leave'
        pushToast({ title: 'Error', body: msg, variant: 'error' })
      }
    })
  }

  function downloadCsv() {
    const headers = ['Date', 'Type', 'Days', 'Status', 'Reason']
    const body = leaves.map((l) => [
      rangeLabel(l.start_date, l.end_date),
      leaveTypes.find((type) => type.key === (l.requested_type ?? l.type))?.name ??
        LEAVE_TYPE_LABELS[l.requested_type ?? l.type] ??
        l.requested_type ??
        l.type,
      l.days_deducted.toString(),
      LEAVE_STATUS_LABEL[l.status] ?? l.status,
      l.reason ?? '',
    ])
    const csv = [headers, ...body]
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${currentUser.full_name.toLowerCase().replaceAll(' ', '-')}-leaves.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <Topbar title="My Leaves" subtitle="Apply, track and review your leave history" />

      <div className="px-5 lg:px-8 py-5 space-y-5">
        {/* Balance tiles */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {balanceSummary.map((item) => (
            <Card key={item.type}>
              <CardContent className="p-4">
                <div className="text-[12px] font-medium text-muted-foreground">{item.label}</div>
                <div className="mt-2 text-[22px] font-semibold tabular-nums text-foreground">
                  {formatDays(item.remaining)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  of {formatDays(item.allocated)} days
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <Tabs value={tab} onValueChange={(v) => setTab(v as LeavesTab)}>
            <TabsList>
              <TabsTrigger value="leaves">
                Leaves {leaves.length > 0 && `(${leaves.length})`}
              </TabsTrigger>
              <TabsTrigger value="compoff">
                Compoff Requests {compoff.length > 0 && `(${compoff.length})`}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <div className="relative flex-1 min-w-[150px] sm:flex-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring sm:w-48"
              />
            </div>
            <Button variant="outline" size="sm" onClick={downloadCsv}>
              <Download className="h-4 w-4" />
            </Button>
            <CompoffRequestDialog
              trigger={
                <Button variant="outline" size="sm">
                  <Sparkles className="h-4 w-4" />
                  Comp-off
                </Button>
              }
            />
            <LeaveFormDialog
              trigger={
                <Button size="sm">
                  <Plus className="h-4 w-4" />
                  Apply
                </Button>
              }
            />
          </div>
        </div>

        {/* Tab content */}
        {tab === 'leaves' && (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 text-left text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Dates</th>
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th className="px-4 py-3 font-medium">Days</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Reason</th>
                      <th className="px-4 py-3 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeaves.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                          No leaves found.
                        </td>
                      </tr>
                    ) : (
                      filteredLeaves.map((leave) => {
                        const isDeleted = leave.status === 'deleted'
                        const canDelete =
                          leave.status === 'active' ||
                          leave.status === 'pending'

                        return (
                          <tr
                            key={leave.id}
                            className={cn(
                              'border-t hover:bg-muted/30',
                              isDeleted && 'opacity-50'
                            )}
                          >
                            <td className="whitespace-nowrap px-4 py-3 text-foreground">
                              {isDeleted ? (
                                <span className="line-through">
                                  {rangeLabel(leave.start_date, leave.end_date)}
                                </span>
                              ) : (
                                rangeLabel(leave.start_date, leave.end_date)
                              )}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3">
                              <TypePill
                                type={leave.requested_type ?? leave.type}
                                label={leaveTypes.find((type) => type.key === (leave.requested_type ?? leave.type))?.name}
                              />
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                              {formatDays(leave.days_deducted)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3">
                              <Badge variant={LEAVE_STATUS_VARIANT[leave.status] ?? 'muted'}>
                                {LEAVE_STATUS_LABEL[leave.status] ?? leave.status}
                              </Badge>
                            </td>
                            <td className="min-w-[180px] px-4 py-3 text-muted-foreground">
                              {leave.reason ?? '—'}
                            </td>
                            <td className="px-4 py-3">
                              {canDelete && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={isPending}
                                  onClick={() => handleDelete(leave)}
                                  className="text-rose-600 border-rose-200 hover:bg-rose-50"
                                >
                                  {leave.status === 'active' &&
                                  !(currentUser.role === 'hr' || currentUser.role === 'founder')
                                    ? 'Request Delete'
                                    : 'Delete'}
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
        )}

        {tab === 'compoff' && (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 text-left text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th className="px-4 py-3 font-medium">Amount</th>
                      <th className="px-4 py-3 font-medium">Work Date</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Expires</th>
                      <th className="px-4 py-3 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCompoff.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                          No compoff requests found.
                        </td>
                      </tr>
                    ) : (
                      filteredCompoff.map((g) => {
                        const daysUntilExpiry = g.expires_at
                          ? differenceInDays(parseISO(g.expires_at), new Date())
                          : null

                        return (
                          <tr key={g.id} className="border-t hover:bg-muted/30">
                            <td className="whitespace-nowrap px-4 py-3">
                              <TypePill type={g.type} />
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 tabular-nums font-semibold">
                              {formatDays(g.amount)} day{g.amount !== 1 ? 's' : ''}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3">
                              {dateLabel(g.work_date)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3">
                              <Badge
                                variant={
                                  g.status === 'approved'
                                    ? 'success'
                                    : g.status === 'rejected'
                                    ? 'danger'
                                    : 'warning'
                                }
                                className="capitalize"
                              >
                                {g.status}
                              </Badge>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                              {g.status === 'approved' && daysUntilExpiry !== null ? (
                                <span className={cn(daysUntilExpiry < 7 && 'text-rose-600 font-medium')}>
                                  {daysUntilExpiry > 0
                                    ? `In ${daysUntilExpiry} days`
                                    : 'Expired'}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="min-w-[200px] px-4 py-3 text-muted-foreground">
                              {g.reason}
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
        )}
      </div>
    </>
  )
}
