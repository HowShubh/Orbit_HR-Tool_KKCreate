'use client'

import { useState, useTransition } from 'react'
import { format, parseISO } from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Upload, Trash2 } from 'lucide-react'
import { decideCompoff, removeCompoffGrant } from '@/lib/actions/compoff'
import { CompoffRequestDialog } from '@/components/leave/compoff-request-dialog'
import { CompoffCsvImport } from './compoff-csv-import'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import type { Tables } from '@/lib/supabase/database.types'
import type { UserWithMembership } from '@/lib/queries/users'

interface Props {
  grants: Tables<'compoff_grants'>[]
  users: UserWithMembership[]
}

const TYPE_LABEL: Record<string, string> = {
  compoff_leave: 'Comp Leave',
  compoff_wfh: 'Comp WFH',
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: 'warning' | 'success' | 'muted' }) {
  const cls = {
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    muted: 'border-border bg-muted/40 text-muted-foreground',
  }[tone]
  return (
    <div className={cn('rounded-xl border p-4', cls)}>
      <div className="text-[12px] uppercase tracking-wide font-semibold opacity-80">{label}</div>
      <div className="text-[24px] font-semibold tabular-nums">{value}</div>
    </div>
  )
}

export function CompoffTab({ grants, users }: Props) {
  const { pushToast, currentUser } = useStore()
  const [isPending, startTransition] = useTransition()
  const [confirm, setConfirm] = useState<{ id: string; decision: 'approved' | 'rejected' } | null>(null)

  const [csvOpen, setCsvOpen] = useState(false)
  const [removeId, setRemoveId] = useState<string | null>(null)

  const pending = grants.filter((g) => g.status === 'pending')
  const approved = grants.filter((g) => g.status === 'approved')
  const rejected = grants.filter((g) => g.status === 'rejected')

  const isPrivileged = currentUser.role === 'hr' || currentUser.role === 'founder'

  // The grant's manager_id is the normal approver. HR/Founder acting on someone
  // else's grant is an override → confirm first (matches the leave flow).
  function requestDecide(
    grant: Tables<'compoff_grants'>,
    decision: 'approved' | 'rejected'
  ) {
    const isOverride = isPrivileged && grant.manager_id !== currentUser.id
    if (isOverride) {
      setConfirm({ id: grant.id, decision })
      return
    }
    handleDecide(grant.id, decision)
  }

  function handleDecide(grantId: string, decision: 'approved' | 'rejected') {
    setConfirm(null)
    startTransition(async () => {
      try {
        await decideCompoff(grantId, decision)
        pushToast({
          title: decision === 'approved' ? 'Compoff approved' : 'Compoff rejected',
          variant: decision === 'approved' ? 'success' : 'info',
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed'
        pushToast({ title: 'Error', body: msg, variant: 'error' })
      }
    })
  }

  function handleRemove(grantId: string) {
    setRemoveId(null)
    startTransition(async () => {
      try {
        await removeCompoffGrant(grantId)
        pushToast({ title: 'Comp-off removed', body: 'Balance refunded.', variant: 'success' })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed'
        pushToast({ title: 'Could not remove', body: msg, variant: 'error' })
      }
    })
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold">Comp-off</div>
          {isPrivileged && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setCsvOpen(true)}>
                <Upload className="h-4 w-4" />
                Import CSV
              </Button>
              <CompoffRequestDialog
                onBehalf={{ users }}
                trigger={<Button size="sm">Add comp-off</Button>}
              />
            </div>
          )}
        </div>
        {isPrivileged && (
          <CompoffCsvImport open={csvOpen} onOpenChange={setCsvOpen} users={users} />
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard label="Pending" value={pending.length} tone="warning" />
          <StatCard label="Approved" value={approved.length} tone="success" />
          <StatCard label="Rejected" value={rejected.length} tone="muted" />
        </div>

        {grants.length === 0 && (
          <p className="text-center text-muted-foreground text-sm py-6">
            No compoff grants found.
          </p>
        )}

        {pending.length > 0 && (
          <div>
            <div className="text-[13px] font-semibold mb-2">Pending</div>
            <div className="space-y-3">
              {pending.map((g) => {
                const u = users.find((x) => x.id === g.user_id)
                const manager = users.find((x) => x.id === g.manager_id)
                return (
                  <div
                    key={g.id}
                    className="rounded-xl border border-border p-4 flex flex-wrap items-center gap-4"
                  >
                    <Avatar name={u?.full_name ?? '?'} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13.5px] font-semibold">{u?.full_name ?? 'Unknown'}</span>
                        <span className="text-[11.5px] text-muted-foreground">
                          {TYPE_LABEL[g.type] ?? g.type} · {g.amount} day · worked{' '}
                          {format(parseISO(g.work_date), 'MMM d')}
                        </span>
                      </div>
                      <div className="text-[12.5px] text-muted-foreground line-clamp-2 mt-0.5">
                        {g.reason}
                      </div>
                      <div className="text-[11.5px] text-muted-foreground/80 mt-1">
                        Manager: {manager?.full_name ?? '—'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isPending}
                        onClick={() => requestDecide(g, 'rejected')}
                      >
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        disabled={isPending}
                        onClick={() => requestDecide(g, 'approved')}
                      >
                        Approve
                      </Button>
                    </div>

                    {confirm?.id === g.id && (
                      <div className="flex w-full flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-900 ring-1 ring-amber-200">
                        <span>
                          This is normally <strong>{manager?.full_name ?? 'the manager'}</strong>
                          &rsquo;s comp-off to decide. Override and{' '}
                          {confirm.decision === 'approved' ? 'approve' : 'reject'} it?
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isPending}
                            onClick={() => setConfirm(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            disabled={isPending}
                            onClick={() => handleDecide(g.id, confirm.decision)}
                          >
                            {isPending
                              ? 'Working…'
                              : `Yes, override & ${confirm.decision === 'approved' ? 'approve' : 'reject'}`}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {(approved.length > 0 || rejected.length > 0) && (
          <div>
            <div className="text-[13px] font-semibold mb-2">Decided</div>
            <div className="space-y-3">
              {[...approved, ...rejected].map((g) => {
                const u = users.find((x) => x.id === g.user_id)
                return (
                  <div
                    key={g.id}
                    className="rounded-xl border border-border p-4 flex flex-wrap items-center gap-4 opacity-75"
                  >
                    <Avatar name={u?.full_name ?? '?'} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13.5px] font-semibold">{u?.full_name ?? 'Unknown'}</span>
                        <span className="text-[11.5px] text-muted-foreground">
                          {TYPE_LABEL[g.type] ?? g.type} · {g.amount} day · worked{' '}
                          {format(parseISO(g.work_date), 'MMM d')}
                        </span>
                      </div>
                      <div className="text-[12.5px] text-muted-foreground line-clamp-1 mt-0.5">
                        {g.reason}
                      </div>
                    </div>
                    <Badge variant={g.status === 'approved' ? 'success' : 'muted'} className="capitalize">
                      {g.status}
                    </Badge>
                    {isPrivileged && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-rose-600 hover:bg-rose-50"
                        disabled={isPending}
                        onClick={() => setRemoveId(g.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </Button>
                    )}

                    {removeId === g.id && (
                      <div className="flex w-full flex-wrap items-center justify-between gap-3 rounded-lg bg-rose-50 px-3 py-2.5 text-[12.5px] text-rose-900 ring-1 ring-rose-200">
                        <span>
                          Remove this comp-off entry
                          {g.status === 'approved' ? ' and refund the credited balance?' : '?'} This
                          can&rsquo;t be undone.
                        </span>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" disabled={isPending} onClick={() => setRemoveId(null)}>
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            className="bg-rose-600 hover:bg-rose-700"
                            disabled={isPending}
                            onClick={() => handleRemove(g.id)}
                          >
                            {isPending ? 'Removing…' : 'Yes, remove'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
