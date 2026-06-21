'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Save, Info } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { createLeaveType, updateLeaveType } from '@/lib/actions/leave-types'
import { slugifyLeaveTypeKey, type LeaveTypePolicy } from '@/lib/leave-types'
import { useStore } from '@/lib/store'
import type { UserWithMembership } from '@/lib/queries/users'

type Category = LeaveTypePolicy['category']
type EligibilityMode = LeaveTypePolicy['eligibility_mode']

const CATEGORY_LABEL: Record<Category, string> = {
  leave: 'Leave',
  wfh: 'WFH',
  compoff_leave: 'Comp-off Leave',
  compoff_wfh: 'Comp-off WFH',
}

type FormState = {
  key: string
  name: string
  category: Category
  annual_quota: string
  monthly_quota: string
  eligibility_mode: EligibilityMode
  eligible_user_ids: string[]
  is_active: boolean
}

const BLANK_FORM: FormState = {
  key: '',
  name: '',
  category: 'leave',
  annual_quota: '0',
  monthly_quota: '',
  eligibility_mode: 'all',
  eligible_user_ids: [],
  is_active: true,
}

function formFromPolicy(policy: LeaveTypePolicy): FormState {
  return {
    key: policy.key,
    name: policy.name,
    category: policy.category,
    annual_quota: String(policy.annual_quota ?? 0),
    monthly_quota: policy.monthly_quota == null ? '' : String(policy.monthly_quota),
    eligibility_mode: policy.eligibility_mode,
    eligible_user_ids: policy.eligible_user_ids ?? [],
    is_active: policy.is_active,
  }
}

export function LeaveTypesTab({
  leaveTypes,
  users,
}: {
  leaveTypes: LeaveTypePolicy[]
  users: UserWithMembership[]
}) {
  const router = useRouter()
  const { pushToast } = useStore()
  const [isPending, startTransition] = useTransition()
  const [editingKey, setEditingKey] = useState<string | null>(leaveTypes[0]?.key ?? null)
  const editingPolicy = useMemo(
    () => leaveTypes.find((type) => type.key === editingKey) ?? null,
    [editingKey, leaveTypes]
  )
  const [form, setForm] = useState<FormState>(
    editingPolicy ? formFromPolicy(editingPolicy) : BLANK_FORM
  )
  const [keyTouched, setKeyTouched] = useState(false)

  const activeUsers = users
    .filter((user) => user.status === 'active')
    .sort((a, b) => a.full_name.localeCompare(b.full_name))

  function selectPolicy(policy: LeaveTypePolicy) {
    setEditingKey(policy.key)
    setForm(formFromPolicy(policy))
    setKeyTouched(true)
  }

  function startNew() {
    setEditingKey(null)
    setForm(BLANK_FORM)
    setKeyTouched(false)
  }

  function setName(name: string) {
    setForm((prev) => ({
      ...prev,
      name,
      key: editingKey || keyTouched ? prev.key : slugifyLeaveTypeKey(name),
    }))
  }

  function toggleUser(userId: string) {
    setForm((prev) => {
      const selected = new Set(prev.eligible_user_ids)
      if (selected.has(userId)) selected.delete(userId)
      else selected.add(userId)
      return { ...prev, eligible_user_ids: Array.from(selected) }
    })
  }

  function save() {
    const annualQuota = Number(form.annual_quota || 0)
    const monthlyQuota = form.monthly_quota.trim() === '' ? null : Number(form.monthly_quota)
    if (!form.name.trim() || !form.key.trim()) {
      pushToast({ title: 'Missing fields', body: 'Name and key are required.', variant: 'error' })
      return
    }
    if (!Number.isFinite(annualQuota) || annualQuota < 0) {
      pushToast({ title: 'Invalid quota', body: 'Annual quota must be zero or more.', variant: 'error' })
      return
    }
    if (monthlyQuota !== null && (!Number.isFinite(monthlyQuota) || monthlyQuota < 0 || monthlyQuota > 31)) {
      pushToast({ title: 'Invalid monthly cap', body: 'Monthly cap must be between 0 and 31, or blank for no cap.', variant: 'error' })
      return
    }

    startTransition(async () => {
      try {
        const payload = {
          key: slugifyLeaveTypeKey(form.key),
          name: form.name.trim(),
          category: form.category,
          annual_quota: annualQuota,
          monthly_quota: monthlyQuota,
          eligibility_mode: form.eligibility_mode,
          eligible_user_ids:
            form.eligibility_mode === 'selected' ? form.eligible_user_ids : [],
          is_active: form.is_active,
        }
        if (editingKey) await updateLeaveType(payload)
        else await createLeaveType(payload)
        pushToast({ title: editingKey ? 'Leave type updated' : 'Leave type created', variant: 'success' })
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save leave type'
        pushToast({ title: 'Error', body: message, variant: 'error' })
      }
    })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b p-4">
            <div>
              <div className="text-sm font-semibold">Leave policies</div>
              <div className="text-xs text-muted-foreground">
                Type keys are stored on leave requests; categories drive workflow behavior.
              </div>
            </div>
            <Button size="sm" onClick={startNew}>
              <Plus className="h-4 w-4" />
              New type
            </Button>
          </div>
          <div className="flex items-start gap-2 border-b bg-blue-50/60 px-4 py-3 text-[12px] text-blue-900">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Quota is the <strong>default for new joiners</strong> (pro-rated by join
              date) and the annual reset. It does <strong>not</strong> change the
              balances of people who already have one — to adjust someone&rsquo;s current
              balance, edit it in the <strong>Balances</strong> tab.
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Quota</th>
                  <th className="px-4 py-3 font-medium">Monthly cap</th>
                  <th className="px-4 py-3 font-medium">Eligibility</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {leaveTypes.map((type) => (
                  <tr
                    key={type.key}
                    className="cursor-pointer border-t hover:bg-muted/30"
                    onClick={() => selectPolicy(type)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{type.name}</div>
                      <div className="text-[11px] text-muted-foreground">{type.key}</div>
                    </td>
                    <td className="px-4 py-3">{CATEGORY_LABEL[type.category]}</td>
                    <td className="px-4 py-3 tabular-nums">{type.annual_quota}</td>
                    <td className="px-4 py-3 tabular-nums">{type.monthly_quota ?? '—'}</td>
                    <td className="px-4 py-3">
                      {type.eligibility_mode === 'all'
                        ? 'All employees'
                        : `${type.eligible_user_ids?.length ?? 0} selected`}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <Badge variant={type.is_active ? 'success' : 'muted'}>
                          {type.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        {type.is_system && <Badge variant="muted">System</Badge>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <div className="text-sm font-semibold">
              {editingKey ? 'Edit leave type' : 'New leave type'}
            </div>
            <div className="text-xs text-muted-foreground">
              Use selected eligibility for policies like Period Leave.
            </div>
          </div>

          <div className="grid gap-3">
            <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
              Name
              <Input value={form.name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
              Key
              <Input
                value={form.key}
                disabled={!!editingKey}
                onChange={(event) => {
                  setKeyTouched(true)
                  setForm((prev) => ({ ...prev, key: event.target.value }))
                }}
              />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
              Category
              <Select
                value={form.category}
                onValueChange={(value) => setForm((prev) => ({ ...prev, category: value as Category }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="leave">Leave</SelectItem>
                  <SelectItem value="wfh">WFH</SelectItem>
                  <SelectItem value="compoff_leave">Comp-off Leave</SelectItem>
                  <SelectItem value="compoff_wfh">Comp-off WFH</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
              Annual quota
              <Input
                type="number"
                min="0"
                step="0.5"
                value={form.annual_quota}
                onChange={(event) => setForm((prev) => ({ ...prev, annual_quota: event.target.value }))}
              />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
              Monthly cap
              <Input
                type="number"
                min="0"
                max="31"
                step="0.5"
                placeholder="Blank = no monthly cap"
                value={form.monthly_quota}
                onChange={(event) => setForm((prev) => ({ ...prev, monthly_quota: event.target.value }))}
              />
            </label>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-xs font-medium">Active</div>
              <div className="text-[11px] text-muted-foreground">Inactive types cannot be requested.</div>
            </div>
            <Switch
              checked={form.is_active}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, is_active: checked }))}
            />
          </div>

          <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
            Eligibility
            <Select
              value={form.eligibility_mode}
              onValueChange={(value) =>
                setForm((prev) => ({ ...prev, eligibility_mode: value as EligibilityMode }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All employees</SelectItem>
                <SelectItem value="selected">Selected employees</SelectItem>
              </SelectContent>
            </Select>
          </label>

          {form.eligibility_mode === 'selected' && (
            <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border p-2">
              {activeUsers.map((user) => (
                <label
                  key={user.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40"
                >
                  <input
                    type="checkbox"
                    checked={form.eligible_user_ids.includes(user.id)}
                    onChange={() => toggleUser(user.id)}
                  />
                  <Avatar name={user.full_name} size="sm" />
                  <span className="text-xs font-medium">{user.full_name}</span>
                </label>
              ))}
            </div>
          )}

          <Button onClick={save} disabled={isPending}>
            <Save className="h-4 w-4" />
            {isPending ? 'Saving...' : 'Save leave type'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
