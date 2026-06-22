'use client'

import { useMemo, useState, useTransition } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Save, Wand2 } from 'lucide-react'
import {
  upsertBalance,
  fetchBalancesForYear,
  applyQuotasToYear,
} from '@/lib/actions/balances'
import { useStore } from '@/lib/store'
import { currentFiscalYearStart, formatFiscalYear } from '@/lib/date'
import type { UserWithMembership } from '@/lib/queries/users'
import type { LeaveTypePolicy } from '@/lib/leave-types'
import type { Tables } from '@/lib/supabase/database.types'

interface Props {
  users: UserWithMembership[]
  balances: Tables<'leave_balances'>[]
  compoffBalances: Tables<'leave_balances'>[]
  leaveTypes: LeaveTypePolicy[]
  leaveYear: number
  availableYears: number[]
}

type BalanceType = string

interface EditState {
  userId: string
  type: BalanceType
  value: string
}

export function BalancesTab({ users, balances, compoffBalances, leaveTypes, leaveYear, availableYears }: Props) {
  const { pushToast } = useStore()
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState<EditState | null>(null)

  const [year, setYear] = useState(leaveYear)
  const [bal, setBal] = useState<Tables<'leave_balances'>[]>(balances)
  const [confirmApply, setConfirmApply] = useState(false)

  // Only show years that actually have balance data, plus the current FY and the
  // year currently selected — so a stray/deleted year doesn't linger in the list.
  const yearOptions = useMemo(() => {
    const set = new Set<number>([currentFiscalYearStart(), leaveYear, year, ...availableYears])
    return Array.from(set).sort((a, b) => b - a)
  }, [leaveYear, year, availableYears])

  const allBalances = [...bal, ...compoffBalances]

  function getBalance(userId: string, type: BalanceType) {
    return allBalances.find((b) => b.user_id === userId && b.type === type)
  }

  function reloadYear(targetYear: number) {
    startTransition(async () => {
      try {
        const rows = await fetchBalancesForYear(targetYear)
        setBal(rows)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load balances'
        pushToast({ title: 'Error', body: msg, variant: 'error' })
      }
    })
  }

  function changeYear(targetYear: number) {
    setEditing(null)
    setConfirmApply(false)
    setYear(targetYear)
    reloadYear(targetYear)
  }

  function runApplyQuotas() {
    startTransition(async () => {
      try {
        const res = await applyQuotasToYear({ leaveYear: year, prorate: true })
        const rows = await fetchBalancesForYear(year)
        setBal(rows)
        setConfirmApply(false)
        pushToast({
          title: 'Quotas applied',
          body: `Updated ${res.updated} balances for ${res.users} active employees.`,
          variant: 'success',
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to apply quotas'
        pushToast({ title: 'Error', body: msg, variant: 'error' })
      }
    })
  }

  function startEdit(userId: string, type: BalanceType) {
    const b = getBalance(userId, type)
    setEditing({ userId, type, value: b ? String(b.allocated) : '' })
  }

  function handleSave(userId: string, type: BalanceType) {
    if (!editing) return
    const allocated = parseFloat(editing.value)
    if (isNaN(allocated) || allocated < 0) {
      pushToast({ title: 'Invalid value', body: 'Enter a valid number', variant: 'error' })
      return
    }

    const existing = getBalance(userId, type)
    const policy = leaveTypes.find((leaveType) => leaveType.key === type)
    const isCompoff =
      policy?.category === 'compoff_leave' || policy?.category === 'compoff_wfh'

    startTransition(async () => {
      try {
        const saved = await upsertBalance({
          user_id: userId,
          leave_year: isCompoff ? 0 : year,
          type,
          allocated,
          used: existing?.used ?? 0,
        })
        setBal((prev) => {
          if (isCompoff) return prev // compoff lives in year 0, not in `bal`
          const idx = prev.findIndex((b) => b.user_id === userId && b.type === type)
          if (idx === -1) return [...prev, saved]
          const next = [...prev]
          next[idx] = saved
          return next
        })
        pushToast({ title: 'Balance saved', variant: 'success' })
        setEditing(null)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed'
        pushToast({ title: 'Error', body: msg, variant: 'error' })
      }
    })
  }

  const isEditing = (userId: string, type: BalanceType) =>
    editing?.userId === userId && editing?.type === type

  function BalanceCell({ userId, type }: { userId: string; type: BalanceType }) {
    const b = getBalance(userId, type)

    if (isEditing(userId, type)) {
      return (
        <div className="flex items-center gap-1">
          <Input
            className="h-7 w-20 text-xs"
            value={editing?.value ?? ''}
            onChange={(e) => setEditing((prev) => (prev ? { ...prev, value: e.target.value } : prev))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave(userId, type)
              if (e.key === 'Escape') setEditing(null)
            }}
            autoFocus
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={isPending}
            onClick={() => handleSave(userId, type)}
          >
            <Save className="h-3.5 w-3.5" />
          </Button>
        </div>
      )
    }

    if (!b) {
      return (
        <button
          className="text-muted-foreground hover:text-foreground text-sm"
          onClick={() => startEdit(userId, type)}
        >
          —
        </button>
      )
    }

    const remaining = (b.allocated - b.used).toFixed(1)
    return (
      <button
        className="text-left hover:underline"
        onClick={() => startEdit(userId, type)}
        title="Click to edit allocated"
      >
        <span className="font-semibold tabular-nums">{remaining}</span>
        <span className="text-muted-foreground text-[11px]"> / {b.allocated}</span>
      </button>
    )
  }

  const activeUsers = users.filter((u) => u.status === 'active')
  const visibleLeaveTypes = leaveTypes.filter((type) => type.is_active)

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div className="flex items-center gap-2">
            <label htmlFor="bal-year" className="text-[12px] font-medium text-muted-foreground">
              Fiscal year
            </label>
            <select
              id="bal-year"
              className="h-8 rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={year}
              disabled={isPending}
              onChange={(e) => changeYear(Number(e.target.value))}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {formatFiscalYear(y)}
                </option>
              ))}
            </select>
            <span className="text-[12px] text-muted-foreground">
              · click any balance to edit
            </span>
          </div>
          <Button size="sm" variant="outline" disabled={isPending} onClick={() => setConfirmApply(true)}>
            <Wand2 className="h-4 w-4" />
            Apply current quotas
          </Button>
        </div>

        {confirmApply && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-amber-50/70 px-4 py-3 text-[12px] text-amber-900">
            <span>
              Set every active employee&rsquo;s allocation for{' '}
              <strong>FY {formatFiscalYear(year)}</strong> to the current Leave Types quota
              (pro-rated by join date). <strong>Used days are preserved</strong>, but any
              manual per-person edits will be overwritten.
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setConfirmApply(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={isPending} onClick={runApplyQuotas}>
                {isPending ? 'Applying…' : 'Confirm'}
              </Button>
            </div>
          </div>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground bg-muted/40">
              <th className="font-medium px-4 py-3">Employee</th>
              {visibleLeaveTypes.map((type) => (
                <th key={type.key} className="font-medium px-4 py-3">
                  {type.name} (rem/total)
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeUsers.map((u) => (
              <tr key={u.id} className="border-t hover:bg-muted/30">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={u.full_name} size="sm" />
                    <div>
                      <div className="text-[13px] font-medium">{u.full_name}</div>
                      <div className="text-[11px] text-muted-foreground capitalize">
                        {u.role.replace('_', ' ')}
                      </div>
                    </div>
                  </div>
                </td>
                {visibleLeaveTypes.map((type) => (
                  <td key={type.key} className="px-4 py-3">
                    <BalanceCell userId={u.id} type={type.key} />
                  </td>
                ))}
              </tr>
            ))}
            {activeUsers.length === 0 && (
              <tr>
                <td colSpan={Math.max(2, visibleLeaveTypes.length + 1)} className="px-4 py-8 text-center text-muted-foreground text-sm">
                  No active users
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}
