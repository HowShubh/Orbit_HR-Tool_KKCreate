'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { format, parseISO, differenceInDays } from 'date-fns'
import { Loader2, CalendarDays, Briefcase, Trash2 } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { getUserLeaveProfile } from '@/lib/actions/person-detail'
import { deleteLeave } from '@/lib/actions/leaves'
import type { PersonLeaveProfile, PersonLeaveRow } from '@/lib/person-detail-types'
import { useStore } from '@/lib/store'

type TypeFilter = 'all' | 'leave' | 'wfh' | 'compoff'
type StatusFilter = 'all' | 'active' | 'pending' | 'rejected' | 'deleted'

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'muted' | 'info'> = {
  active: 'success',
  pending: 'warning',
  delete_requested: 'warning',
  rejected: 'muted',
  deleted: 'muted',
}

function fmtDays(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

function dateRange(l: PersonLeaveRow) {
  if (l.start_date === l.end_date) return format(parseISO(l.start_date), 'MMM d, yyyy')
  return `${format(parseISO(l.start_date), 'MMM d')} – ${format(parseISO(l.end_date), 'MMM d, yyyy')}`
}

function matchesType(l: PersonLeaveRow, f: TypeFilter) {
  if (f === 'all') return true
  if (f === 'leave') return l.type_category === 'leave'
  if (f === 'wfh') return l.type_category === 'wfh'
  return l.type_category === 'compoff_leave' || l.type_category === 'compoff_wfh'
}

export function PersonDetail({ userId }: { userId: string }) {
  const { pushToast, currentUser } = useStore()
  const [data, setData] = useState<PersonLeaveProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [isDeleting, startDelete] = useTransition()

  const canManage = currentUser?.role === 'hr' || currentUser?.role === 'founder'

  // Same fetch shape as before, with an `active` guard, plus a refreshKey the
  // delete action bumps to reload after a successful delete.
  useEffect(() => {
    let active = true
    setLoading(true)
    getUserLeaveProfile(userId)
      .then((d) => {
        if (active) setData(d)
      })
      .catch((err) => {
        if (!active) return
        const msg = err instanceof Error ? err.message : 'Failed to load'
        pushToast({ title: 'Error', body: msg, variant: 'error' })
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [userId, pushToast, refreshKey])

  function handleDelete(leaveId: string) {
    setConfirmId(null)
    startDelete(async () => {
      try {
        await deleteLeave(leaveId)
        pushToast({ title: 'Leave removed', body: 'The balance was refunded.', variant: 'success' })
        setRefreshKey((k) => k + 1) // reload the profile
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to delete'
        pushToast({ title: 'Could not delete', body: msg, variant: 'error' })
      }
    })
  }

  const filteredLeaves = useMemo(() => {
    if (!data) return []
    return data.leaves.filter(
      (l) =>
        matchesType(l, typeFilter) &&
        (statusFilter === 'all' ||
          l.status === statusFilter ||
          (statusFilter === 'active' && l.status === 'delete_requested'))
    )
  }, [data, typeFilter, statusFilter])

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    )
  }
  if (!data) {
    return <div className="p-6 text-sm text-muted-foreground">Could not load this person.</div>
  }

  const { user, managerName, teams, directReports, balances, compoff } = data

  return (
    <div className="space-y-5">
      {/* Identity */}
      <div className="flex items-start gap-3">
        <Avatar name={user.full_name} src={user.photo_url} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-semibold tracking-tight">{user.full_name}</div>
          <div className="text-[12.5px] text-muted-foreground">{user.designation || '—'}</div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="muted" className="capitalize">
              {user.role.replace('_', ' ')}
            </Badge>
            <Badge variant={user.status === 'active' ? 'success' : 'muted'}>
              {user.status === 'active' ? 'Active' : 'Exited'}
            </Badge>
            {teams.map((t) => (
              <Badge key={t.id} variant={t.is_primary ? 'default' : 'muted'}>
                {t.name}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Facts */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
        <Fact label="Email" value={user.email} />
        <Fact label="Phone" value={user.phone ?? '—'} />
        <Fact label="Reports to" value={managerName ?? 'Not assigned'} />
        <Fact
          label="Joined"
          value={user.joined_at ? format(parseISO(user.joined_at), 'MMM d, yyyy') : '—'}
        />
        {directReports.length > 0 && (
          <Fact label="Manager of" value={`${directReports.length} ${directReports.length === 1 ? 'person' : 'people'}`} />
        )}
      </div>

      {/* Balances */}
      {balances.length > 0 && (
        <div>
          <SectionTitle icon={<Briefcase className="h-3.5 w-3.5" />}>Balances</SectionTitle>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {balances.map((b) => {
              const remaining = Number(b.allocated) - Number(b.used)
              return (
                <div key={b.id} className="rounded-lg border p-2.5">
                  <div className="text-[11px] text-muted-foreground truncate">
                    {b.type_name}
                  </div>
                  <div className="text-[15px] font-semibold tabular-nums">{fmtDays(remaining)}</div>
                  <div className="text-[10px] text-muted-foreground">of {fmtDays(Number(b.allocated))}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Earned comp-off */}
      {compoff.length > 0 && (
        <div>
          <SectionTitle>Earned comp-off</SectionTitle>
          <div className="mt-2 space-y-1.5">
            {compoff.map((g) => {
              const daysToExpiry = g.expires_at ? differenceInDays(parseISO(g.expires_at), new Date()) : null
              return (
                <div key={g.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5 text-[12px]">
                  <span className="font-medium capitalize">{g.type.replace('compoff_', 'Comp-off ')}</span>
                  <span className="tabular-nums">+{fmtDays(Number(g.amount))}d</span>
                  <span className="text-muted-foreground">worked {format(parseISO(g.work_date), 'MMM d')}</span>
                  <Badge variant={STATUS_VARIANT[g.status] ?? 'muted'} className="capitalize">
                    {g.status}
                  </Badge>
                  {g.status === 'approved' && daysToExpiry !== null && (
                    <span className={cn('text-[11px]', daysToExpiry < 0 ? 'text-rose-600' : 'text-muted-foreground')}>
                      {daysToExpiry < 0 ? 'expired' : `expires in ${daysToExpiry}d`}
                    </span>
                  )}
                  {g.reason && <span className="text-muted-foreground truncate">· {g.reason}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Leave history */}
      <div>
        <SectionTitle icon={<CalendarDays className="h-3.5 w-3.5" />}>
          Leaves &amp; WFH ({filteredLeaves.length})
        </SectionTitle>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <FilterChips
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              ['all', 'All'],
              ['leave', 'Leave'],
              ['wfh', 'WFH'],
              ['compoff', 'Comp-off'],
            ]}
          />
          <select
            className="ml-auto h-7 rounded-md border border-border bg-card px-2 text-[12px]"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
            <option value="deleted">Deleted</option>
          </select>
        </div>

        <div className="mt-2 space-y-1.5">
          {filteredLeaves.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-[12px] text-muted-foreground">
              No entries match.
            </p>
          ) : (
            filteredLeaves.map((l) => {
              const deletable =
                l.status === 'active' || l.status === 'pending' || l.status === 'delete_requested'
              return (
                <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5 text-[12px]">
                  <span className="font-medium">{l.type_name}</span>
                  <span className="text-muted-foreground">{dateRange(l)}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {fmtDays(Number(l.days_deducted))}d
                    {l.half_day_position ? ' (½)' : ''}
                  </span>
                  <Badge variant={STATUS_VARIANT[l.status] ?? 'muted'} className="capitalize">
                    {l.status === 'delete_requested' ? 'delete requested' : l.status}
                  </Badge>
                  {l.reason && <span className="text-muted-foreground truncate">· {l.reason}</span>}
                  {canManage && deletable && (
                    <button
                      type="button"
                      onClick={() => setConfirmId(l.id)}
                      disabled={isDeleting}
                      className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                    >
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  )}
                  {confirmId === l.id && (
                    <div className="mt-1 flex w-full items-center justify-between gap-2 rounded-md bg-rose-50 px-2 py-1.5 text-[11px] text-rose-900 ring-1 ring-inset ring-rose-200">
                      <span>Delete this record and refund the balance?</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setConfirmId(null)}
                          className="rounded px-1.5 py-0.5 hover:bg-white/70"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(l.id)}
                          disabled={isDeleting}
                          className="rounded bg-rose-600 px-2 py-0.5 font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                        >
                          {isDeleting ? 'Deleting…' : 'Yes, delete'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium truncate">{value}</span>
    </div>
  )
}

function SectionTitle({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
      {icon}
      {children}
    </div>
  )
}

function FilterChips<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: [T, string][]
}) {
  return (
    <div className="flex rounded-lg border bg-background p-0.5">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn(
            'rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors',
            value === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
