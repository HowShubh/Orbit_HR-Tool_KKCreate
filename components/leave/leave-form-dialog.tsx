'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Home,
  Loader2,
  Plus,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  createMyLeavePlan,
  createLeavePlanForUser,
  getMyLeavePlannerData,
  getLeavePlannerDataForUser,
} from '@/lib/actions/leaves'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import {
  isAwayCategory,
  isWfhCategory,
  leaveTypeCategory,
  leaveTypeLabel,
  type LeaveTypeCategory,
} from '@/lib/leave-types'

/** When set, the dialog runs in HR "add for an employee" mode. */
type OnBehalfConfig = {
  users: Array<{ id: string; full_name: string; status: string }>
}

interface Props {
  trigger?: React.ReactNode
  onBehalf?: OnBehalfConfig
}

type PlannerData = Awaited<ReturnType<typeof getMyLeavePlannerData>>
type PlanType = string
type HalfPosition = 'first_half' | 'second_half'
type SelectedDay = {
  date: string
  type: PlanType
  half_day?: boolean
  half_day_position?: HalfPosition
}

const DAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const

const TYPE_PILL: Record<string, string> = {
  wfh: 'bg-blue-50 text-blue-700 ring-blue-100',
  leave: 'bg-orange-50 text-orange-700 ring-orange-100',
  compoff_wfh: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
  compoff_leave: 'bg-amber-50 text-amber-700 ring-amber-100',
}

const CATEGORY_PILL: Record<LeaveTypeCategory, string> = {
  leave: 'bg-orange-50 text-orange-700 ring-orange-100',
  wfh: 'bg-blue-50 text-blue-700 ring-blue-100',
  compoff_leave: 'bg-amber-50 text-amber-700 ring-amber-100',
  compoff_wfh: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
}

const CATEGORY_BG: Record<LeaveTypeCategory, string> = {
  leave: 'bg-orange-50',
  wfh: 'bg-blue-50',
  compoff_leave: 'bg-amber-50',
  compoff_wfh: 'bg-cyan-50',
}

function todayIso() {
  return format(new Date(), 'yyyy-MM-dd')
}

function dayCode(date: Date) {
  return DAY_CODES[date.getDay()]
}

function parseWfoPattern(pattern?: string | null) {
  return new Set(
    (pattern ?? 'MON,TUE,WED,THU,FRI,SAT')
      .split(',')
      .map((day) => day.trim().toUpperCase())
      .filter(Boolean)
  )
}

// Off days from the team's `off_days`; falls back to Sunday-only when a user
// has no team configured.
function parseOffDays(pattern?: string | null) {
  const codes = (pattern ?? '')
    .split(',')
    .map((day) => day.trim().toUpperCase())
    .filter(Boolean)
  return new Set(codes.length ? codes : ['SUN'])
}

function formatDays(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function balanceFor(data: PlannerData | null, type: string) {
  const balance = data?.balances.find((item) => item.type === type)
  const allocated = Number(balance?.allocated ?? 0)
  const used = Number(balance?.used ?? 0)
  return {
    allocated,
    used,
    remaining: Math.max(0, allocated - used),
  }
}

function policyCategory(data: PlannerData | null, type: string): LeaveTypeCategory {
  return leaveTypeCategory(type, data?.allLeaveTypes)
}

function labelFor(data: PlannerData | null, type: string) {
  return leaveTypeLabel(type, data?.allLeaveTypes)
}

function pillFor(data: PlannerData | null, type: string) {
  return TYPE_PILL[type] ?? CATEGORY_PILL[policyCategory(data, type)]
}

function buildAllocation(data: PlannerData | null, selectedDays: SelectedDay[]) {
  const available = new Map<string, number>()
  for (const balance of data?.balances ?? []) {
    // Reserve already-pending days so they can't be re-spent by a new request.
    const pending = data?.pending?.[balance.type] ?? 0
    available.set(balance.type, Number(balance.allocated ?? 0) - Number(balance.used ?? 0) - pending)
  }

  const used = new Map<string, number>()
  const deduct = (type: string, amount: number) => {
    available.set(type, (available.get(type) ?? 0) - amount)
    used.set(type, (used.get(type) ?? 0) + amount)
  }

  for (const day of selectedDays.sort((a, b) => a.date.localeCompare(b.date))) {
    deduct(day.type, day.half_day ? 0.5 : 1)
  }

  const shortages = Array.from(available.entries()).filter(([, remaining]) => remaining < 0)
  return { available, used, shortages }
}

export function LeaveFormDialog({ trigger, onBehalf }: Props) {
  const router = useRouter()
  const { pushToast } = useStore()
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<PlannerData | null>(null)
  const [loading, setLoading] = useState(false)
  const [cursor, setCursor] = useState(new Date())
  const [mode, setMode] = useState<PlanType>('leave')
  const [selectedDays, setSelectedDays] = useState<SelectedDay[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()
  // HR "add for an employee" mode: which employee the plan is for.
  const [targetUserId, setTargetUserId] = useState('')
  // Inline feedback shown in the right panel (auto-dismisses) when a day can't be picked.
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showNotice(message: string) {
    setNotice(message)
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 4500)
  }

  useEffect(() => () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
  }, [])

  // In HR mode, reload the calendar whenever the chosen employee changes.
  useEffect(() => {
    if (!onBehalf) return
    setData(null)
    setSelectedDays([])
    setSelectedDate(null)
    setNotice(null)
  }, [targetUserId, onBehalf])

  useEffect(() => {
    if (!open || data || loading) return
    if (onBehalf && !targetUserId) return // wait for an employee to be picked
    setLoading(true)
    const request = onBehalf
      ? getLeavePlannerDataForUser(targetUserId)
      : getMyLeavePlannerData()
    request
      .then(setData)
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Failed to load leave planner'
        pushToast({ title: 'Error', body: msg, variant: 'error' })
      })
      .finally(() => setLoading(false))
  }, [data, loading, open, pushToast, onBehalf, targetUserId])

  useEffect(() => {
    if (!data || data.leaveTypes.length === 0) return
    if (!data.leaveTypes.some((type) => type.key === mode)) {
      setMode(data.leaveTypes[0].key)
    }
  }, [data, mode])

  function reset() {
    setSelectedDays([])
    setSelectedDate(null)
    setReason('')
    setMode('leave')
    setCursor(new Date())
    setNotice(null)
    setTargetUserId('')
    setData(null)
  }

  function handleOpenChange(value: boolean) {
    setOpen(value)
    if (!value) reset()
  }

  const wfoDays = useMemo(
    () => parseWfoPattern(data?.primaryTeam?.wfo_pattern),
    [data?.primaryTeam?.wfo_pattern]
  )

  const offDays = useMemo(
    () => parseOffDays(data?.primaryTeam?.off_days),
    [data?.primaryTeam?.off_days]
  )

  const holidayByDate = useMemo(() => {
    const map = new Map<string, string>()
    for (const holiday of data?.holidays ?? []) map.set(holiday.date, holiday.name)
    return map
  }, [data?.holidays])

  const selectedByDate = useMemo(() => {
    const map = new Map<string, PlanType>()
    for (const item of selectedDays) map.set(item.date, item.type)
    return map
  }, [selectedDays])

  const monthStart = startOfMonth(cursor)
  const monthEnd = endOfMonth(cursor)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days = useMemo(() => {
    const out: Date[] = []
    let day = gridStart
    while (day <= gridEnd) {
      out.push(day)
      day = addDays(day, 1)
    }
    return out
  }, [gridStart, gridEnd])

  const allocation = useMemo(
    () => buildAllocation(data, [...selectedDays]),
    [data, selectedDays]
  )
  const shortageLabels = allocation.shortages.map(([type]) => labelFor(data, type))
  // HR mode lets balance go negative and requires an employee to be picked.
  const futureSelected = onBehalf
    ? selectedDays.some((d) => d.date > todayIso())
    : false
  const canSubmit =
    selectedDays.length > 0 &&
    (data?.leaveTypes.length ?? 0) > 0 &&
    !isPending &&
    (onBehalf ? Boolean(targetUserId) : shortageLabels.length === 0)

  function leavesOn(dateIso: string) {
    return (data?.leaves ?? []).filter(
      (leave) => leave.start_date <= dateIso && leave.end_date >= dateIso
    )
  }

  function validateDate(date: Date, type: PlanType) {
    const iso = format(date, 'yyyy-MM-dd')
    const nice = format(date, 'EEE, MMM d')
    if (!onBehalf && iso < todayIso()) return `${nice} is in the past. You can only apply for today or later.`
    if (offDays.has(dayCode(date))) return `${nice} is a weekly off for your team, not a working day.`
    const holiday = holidayByDate.get(iso)
    if (holiday) return `${nice} is a holiday (${holiday}).`
    if (isWfhCategory(policyCategory(data, type)) && !wfoDays.has(dayCode(date))) {
      return `You already work from home on ${format(date, 'EEEE')}s. WFH requests are only for your office days.`
    }
    const ownOverlap = leavesOn(iso).find((leave) => leave.user_id === data?.currentUserId)
    if (ownOverlap) {
      return `You already have a ${ownOverlap.type_name ?? labelFor(data, ownOverlap.type)} request on ${nice}.`
    }
    return null
  }

  function toggleDay(date: Date) {
    const iso = format(date, 'yyyy-MM-dd')
    setSelectedDate(iso)
    const existing = selectedByDate.get(iso)
    if (existing === mode) {
      setSelectedDays((prev) => prev.filter((item) => item.date !== iso))
      return
    }

    const error = validateDate(date, mode)
    if (error) {
      showNotice(error)
      return
    }

    setNotice(null)
    setSelectedDays((prev) => [
      ...prev.filter((item) => item.date !== iso),
      { date: iso, type: mode },
    ])
  }

  function toggleHalfDay(date: string) {
    setSelectedDays((prev) =>
      prev.map((item) =>
        item.date === date
          ? {
              ...item,
              half_day: !item.half_day,
              half_day_position: !item.half_day ? item.half_day_position ?? 'first_half' : undefined,
            }
          : item
      )
    )
  }

  function setHalfPosition(date: string, position: HalfPosition) {
    setSelectedDays((prev) =>
      prev.map((item) => (item.date === date ? { ...item, half_day_position: position } : item))
    )
  }

  function selectedDayWarnings() {
    return selectedDays
      .map((day) => {
        const teamLeaves = leavesOn(day.date).filter((leave) => leave.user_id !== data?.currentUserId)
        const away = teamLeaves.filter((leave) => isAwayCategory(leave.type_category ?? policyCategory(data, leave.type)))
        const wfh = teamLeaves.filter((leave) => isWfhCategory(leave.type_category ?? policyCategory(data, leave.type)))
        if (away.length === 0 && wfh.length === 0) return null
        return {
          date: day.date,
          away,
          wfh,
        }
      })
      .filter(Boolean) as Array<{
      date: string
      away: PlannerData['leaves']
      wfh: PlannerData['leaves']
    }>
  }

  function handleSubmit() {
    if (!canSubmit) return
    const days = selectedDays
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((day) => ({
        date: day.date,
        type: day.type,
        half_day: day.half_day ?? false,
        half_day_position: day.half_day ? day.half_day_position ?? 'first_half' : null,
      }))
    startTransition(async () => {
      try {
        if (onBehalf) {
          await createLeavePlanForUser({ user_id: targetUserId, days, reason: reason.trim() || null })
          pushToast({
            title: 'Leave added',
            body: 'The employee and their manager have been notified.',
            variant: 'success',
          })
        } else {
          await createMyLeavePlan({ days, reason: reason.trim() || null })
          pushToast({
            title: 'Leave request submitted',
            body: 'Your manager will review the complete plan.',
            variant: 'success',
          })
        }
        setOpen(false)
        reset()
        router.refresh()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to submit request'
        pushToast({ title: 'Error', body: msg, variant: 'error' })
      }
    })
  }

  const selectedDateLeaves = selectedDate ? leavesOn(selectedDate) : []
  const warnings = selectedDayWarnings()
  const selectableKeys = new Set(data?.leaveTypes.map((type) => type.key) ?? [])
  const balanceTypes = (data?.allLeaveTypes ?? [])
    .filter(
      (type) =>
        type.is_active &&
        (selectableKeys.has(type.key) ||
          type.category === 'compoff_leave' ||
          type.category === 'compoff_wfh' ||
          data?.balances.some((balance) => balance.type === type.key))
    )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus className="h-4 w-4" />
            Apply for leave
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-x-hidden overflow-y-auto p-3 sm:p-6">
        <DialogHeader>
          <DialogTitle>{onBehalf ? 'Add leave for an employee' : 'Apply Leave / WFH'}</DialogTitle>
        </DialogHeader>

        {onBehalf && (
          <div className="space-y-1.5">
            <Label>Employee</Label>
            <Select value={targetUserId} onValueChange={setTargetUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select an employee…" />
              </SelectTrigger>
              <SelectContent>
                {onBehalf.users
                  .filter((u) => u.status === 'active')
                  .map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {futureSelected && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
                Heads up: you&apos;re adding a future-dated leave (after today), not just backdating.
              </div>
            )}
          </div>
        )}

        {onBehalf && !targetUserId ? (
          <div className="flex min-h-[420px] items-center justify-center text-sm text-muted-foreground">
            Select an employee to open their calendar.
          </div>
        ) : loading || !data ? (
          <div className="flex min-h-[420px] items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading calendar planner...
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
            <div className="min-w-0 space-y-4">
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCursor(subMonths(cursor, 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="flex-1 text-center text-sm font-semibold sm:w-36 sm:flex-none">
                    {format(cursor, 'MMMM yyyy')}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCursor(addMonths(cursor, 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setCursor(new Date())}>
                    Today
                  </Button>
                </div>

                <div className="flex w-full min-w-0 gap-1 overflow-x-auto rounded-lg border bg-background p-1 sm:w-auto">
                  {data.leaveTypes.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setMode(item.key)}
                      className={cn(
                        'shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                        mode === item.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              </div>

              {data.leaveTypes.length === 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  No active leave or WFH policy is available for your profile. Ask HR to update your eligibility.
                </div>
              )}

              <div className="rounded-xl border">
                <div className="grid grid-cols-7 border-b">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((item) => (
                    <div
                      key={item}
                      className="border-r py-2 text-center text-[11px] font-semibold uppercase text-muted-foreground last:border-r-0"
                    >
                      {item}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7">
                  {days.map((day) => {
                    const iso = format(day, 'yyyy-MM-dd')
                    const inMonth = isSameMonth(day, cursor)
                    const isToday = isSameDay(day, new Date())
                    const isOffDay = offDays.has(dayCode(day))
                    const holiday = holidayByDate.get(iso)
                    const isOwnWfhDay = !isOffDay && !holiday && !wfoDays.has(dayCode(day))
                    const selectedType = selectedByDate.get(iso)
                    const teamLeaves = leavesOn(iso).filter((leave) => leave.user_id !== data.currentUserId)
                    const teamAway = teamLeaves.filter((leave) =>
                      isAwayCategory(leave.type_category ?? policyCategory(data, leave.type))
                    )
                    const selectedCategory = selectedType ? policyCategory(data, selectedType) : null

                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => toggleDay(day)}
                        className={cn(
                          'min-h-[60px] border-r border-b p-1 text-left text-xs transition-colors hover:bg-muted/40 sm:min-h-[112px] sm:p-2',
                          !inMonth && 'bg-muted/10 opacity-45',
                          isOffDay && 'bg-muted/40',
                          isToday && 'ring-2 ring-primary ring-inset',
                          selectedCategory && CATEGORY_BG[selectedCategory]
                        )}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span className={cn('text-[13px] font-semibold sm:text-xs', isToday && 'text-primary')}>
                            {format(day, 'd')}
                          </span>
                          {/* Full pill on >= sm */}
                          {selectedType && (
                            <span className={cn('hidden rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset sm:inline-block', pillFor(data, selectedType))}>
                              {labelFor(data, selectedType)}
                            </span>
                          )}
                        </div>

                        {/* Compact dot indicators on mobile */}
                        <div className="mt-1 flex flex-wrap items-center gap-1 sm:hidden">
                          {selectedType && (
                            <span className={cn('h-2 w-2 rounded-full ring-1 ring-inset', pillFor(data, selectedType))} aria-label={labelFor(data, selectedType)} />
                          )}
                          {holiday && <span className="h-2 w-2 rounded-full bg-rose-400" aria-label="Holiday" />}
                          {isOwnWfhDay && <Home className="h-3 w-3 text-blue-400" aria-label="Your WFH day" />}
                          {teamAway.length > 0 && <span className="h-2 w-2 rounded-full bg-amber-400" aria-label="Team away" />}
                        </div>

                        {/* Rich markers on >= sm */}
                        <div className="mt-1 hidden space-y-1 sm:block">
                          {holiday && (
                            <div className="truncate rounded bg-rose-50 px-1 py-0.5 text-[10px] font-medium text-rose-700 ring-1 ring-rose-100">
                              {holiday}
                            </div>
                          )}
                          {isOffDay && (
                            <div className="rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-600">
                              Weekly off
                            </div>
                          )}
                          {isOwnWfhDay && (
                            <Home className="h-3.5 w-3.5 text-blue-500" aria-label="Your WFH day" />
                          )}
                          {teamAway.length > 0 && (
                            <div className="truncate rounded bg-amber-50 px-1 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-amber-100">
                              {teamAway.length} team away
                            </div>
                          )}
                          {teamLeaves.slice(0, 2).map((leave) => (
                            <div
                              key={leave.id}
                              className={cn('truncate rounded px-1 py-0.5 text-[10px] font-medium ring-1 ring-inset', pillFor(data, leave.type))}
                              title={`${leave.user_full_name} - ${leave.type_name ?? labelFor(data, leave.type)}`}
                            >
                              {leave.user_full_name.split(' ')[0]}: {leave.type_name ?? labelFor(data, leave.type)}
                            </div>
                          ))}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <aside className="min-w-0 space-y-4">
              {notice && (
                <div
                  role="status"
                  className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-900"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{notice}</span>
                </div>
              )}
              <div className="rounded-xl border p-4">
                <div className="text-sm font-semibold">Balances</div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {balanceTypes.map((type) => {
                    const balance = balanceFor(data, type.key)
                    const used = allocation.used.get(type.key) ?? 0
                    const pending = data?.pending?.[type.key] ?? 0
                    const remainingAfterRequest = allocation.available.get(type.key) ?? balance.remaining
                    return (
                      <div key={type.key} className="rounded-lg border p-3">
                        <div className="text-[11px] font-medium text-muted-foreground">
                          {type.name}
                        </div>
                        <div className="mt-1 text-lg font-semibold tabular-nums">
                          {formatDays(remainingAfterRequest)}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {used > 0 ? `-${formatDays(used)} in this request` : `of ${formatDays(balance.allocated)}`}
                        </div>
                        {pending > 0 && (
                          <div className="text-[10px] font-medium text-amber-600">
                            {formatDays(pending)} pending approval
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                {shortageLabels.length > 0 && (
                  <div className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-700 ring-1 ring-rose-100">
                    Selected days exceed available {shortageLabels.join(', ')} balance.
                  </div>
                )}
              </div>

              <div className="rounded-xl border p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Selected Plan</div>
                  <Badge variant="muted">{selectedDays.length}</Badge>
                </div>
                <div className="mt-3 max-h-44 space-y-2 overflow-y-auto pr-1">
                  {selectedDays.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Choose a request type, then click working days in the calendar.
                    </p>
                  ) : (
                    selectedDays
                      .slice()
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .map((day) => (
                        <div key={day.date} className="rounded-lg border p-2">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="text-xs font-medium">
                                {format(parseISO(day.date), 'EEE, MMM d')}
                                {day.half_day && (
                                  <span className="ml-1 text-[10px] font-semibold text-primary">· ½ day</span>
                                )}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {data.primaryTeam?.name ?? 'No primary team'}
                              </div>
                            </div>
                            <span className={cn('rounded px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset', pillFor(data, day.type))}>
                              {labelFor(data, day.type)}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleHalfDay(day.date)}
                              className={cn(
                                'rounded-md border px-2 py-0.5 text-[10px] font-semibold transition-colors',
                                day.half_day
                                  ? 'border-primary bg-primary/10 text-primary'
                                  : 'text-muted-foreground hover:text-foreground'
                              )}
                            >
                              Half day
                            </button>
                            {day.half_day && (
                              <div className="flex rounded-md border p-0.5">
                                {(['first_half', 'second_half'] as const).map((pos) => (
                                  <button
                                    key={pos}
                                    type="button"
                                    onClick={() => setHalfPosition(day.date, pos)}
                                    className={cn(
                                      'rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
                                      (day.half_day_position ?? 'first_half') === pos
                                        ? 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:text-foreground'
                                    )}
                                  >
                                    {pos === 'first_half' ? '1st half' : '2nd half'}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>

              {warnings.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                    <AlertTriangle className="h-4 w-4" />
                    Team warnings
                  </div>
                  <div className="mt-3 space-y-2">
                    {warnings.slice(0, 4).map((warning) => (
                      <div key={warning.date} className="text-xs text-amber-800">
                        <span className="font-semibold">{format(parseISO(warning.date), 'MMM d')}:</span>{' '}
                        {warning.away.length} away, {warning.wfh.length} WFH.
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedDate && (
                <div className="rounded-xl border p-4">
                  <div className="text-sm font-semibold">
                    {format(parseISO(selectedDate), 'EEE, MMM d')}
                  </div>
                  <div className="mt-3 space-y-2">
                    {selectedDateLeaves.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No team leave or WFH entries.</p>
                    ) : (
                      selectedDateLeaves.map((leave) => (
                        <div key={leave.id} className="flex items-center gap-2">
                          <Avatar name={leave.user_full_name} size="sm" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-medium">{leave.user_full_name}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {leave.type_name ?? labelFor(data, leave.type)}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Reason</label>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={3}
                  placeholder="Add a note for your approver..."
                  className="flex min-h-[84px] w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </aside>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={handleSubmit}>
            {isPending ? 'Submitting...' : onBehalf ? 'Add leave' : 'Submit request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
