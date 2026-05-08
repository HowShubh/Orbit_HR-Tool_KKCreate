'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Save } from 'lucide-react'
import { upsertBalance } from '@/lib/actions/balances'
import { useStore } from '@/lib/store'
import type { UserWithMembership } from '@/lib/queries/users'
import type { LeaveTypePolicy } from '@/lib/leave-types'
import type { Tables } from '@/lib/supabase/database.types'

interface Props {
  users: UserWithMembership[]
  balances: Tables<'leave_balances'>[]
  compoffBalances: Tables<'leave_balances'>[]
  leaveTypes: LeaveTypePolicy[]
  leaveYear: number
}

type BalanceType = string

interface EditState {
  userId: string
  type: BalanceType
  value: string
}

export function BalancesTab({ users, balances, compoffBalances, leaveTypes, leaveYear }: Props) {
  const { pushToast } = useStore()
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState<EditState | null>(null)

  const allBalances = [...balances, ...compoffBalances]

  function getBalance(userId: string, type: BalanceType) {
    return allBalances.find((b) => b.user_id === userId && b.type === type)
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
    startTransition(async () => {
      try {
        await upsertBalance({
          user_id: userId,
          leave_year:
            policy?.category === 'compoff_leave' || policy?.category === 'compoff_wfh'
              ? 0
              : leaveYear,
          type,
          allocated,
          used: existing?.used ?? 0,
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

  function BalanceCell({
    userId,
    type,
  }: {
    userId: string
    type: BalanceType
  }) {
    const b = getBalance(userId, type)

    if (isEditing(userId, type)) {
      return (
        <div className="flex items-center gap-1">
          <Input
            className="h-7 w-20 text-xs"
            value={editing?.value ?? ''}
            onChange={(e) => setEditing((prev) => prev ? { ...prev, value: e.target.value } : prev)}
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
        <div className="p-4 border-b">
          <div className="text-[13px] text-muted-foreground">
            FY {leaveYear} — click any balance to edit allocation
          </div>
        </div>
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
            {activeUsers.map((u) => {
              return (
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
              )
            })}
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
