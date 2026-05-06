'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
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
import {
  createMyLeavePlan,
  getMyLeavePlannerData,
} from '@/lib/actions/leaves'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

interface Props {
  trigger?: React.ReactNode
}

type PlannerData = Awaited<ReturnType<typeof getMyLeavePlannerData>>
type PlanType = 'leave' | 'wfh'
type SelectedDay = {
  date: string
  type: PlanType
}

const DAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const

const TYPE_PILL: Record<string, string> = {
  wfh: 'bg-blue-50 text-blue-700 ring-blue-100',
  leave: 'bg-orange-50 text-orange-700 ring-orange-100',
  compoff_wfh: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
  compoff_leave: 'bg-amber-50 text-amber-700 ring-amber-100',
}

const TYPE_LABEL: Record<string, string> = {
  wfh: 'WFH',
  leave: 'Leave',
  compoff_wfh: 'Comp-off WFH',
  compoff_leave: 'Comp-off Leave',
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

function buildAllocation(data: PlannerData | null, selectedDays: SelectedDay[]) {
  const available = {
    compoff_leave: balanceFor(data, 'compoff_leave').remaining,
    leave: balanceFor(data, 'leave').remaining,
    compoff_wfh: balanceFor(data, 'compoff_wfh').remaining,
    wfh: balanceFor(data, 'wfh').remaining,
  }

  const used = {
    compoff_leave: 0,
    leave: 0,
    compoff_wfh: 0,
    wfh: 0,
  }

  for (const day of selectedDays.sort((a, b) => a.date.localeCompare(b.date))) {
    if (day.type === 'leave') {
      if (available.compoff_leave > 0) {
        available.compoff_leave -= 1
        used.compoff_leave += 1
      } else {
        available.leave -= 1
        used.leave += 1
      }
    } else if (available.compoff_wfh > 0) {
      available.compoff_wfh -= 1
      used.compoff_wfh += 1
    } else {
      available.wfh -= 1
      used.wfh += 1
    }
  }

  return { available, used }
}

export function LeaveFormDialog({ trigger }: Props) {
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

  useEffect(() => {
    if (!open || data || loading) return
    setLoading(true)
    getMyLeavePlannerData()
      .then(setData)
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Failed to load leave planner'
        pushToast({ title: 'Error', body: msg, variant: 'error' })
      })
      .finally(() => setLoading(false))
  }, [data, loading, open, pushToast])

  function reset() {
    setSelectedDays([])
    setSelectedDate(null)
    setReason('')
    setMode('leave')
    setCursor(new Date())
  }

  function handleOpenChange(value: boolean) {
    setOpen(value)
    if (!value) reset()
  }

  const wfoDays = useMemo(
    () => parseWfoPattern(data?.primaryTeam?.wfo_pattern),
    [data?.primaryTeam?.wfo_pattern]
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
  const insufficientLeave = allocation.available.leave < 0
  const insufficientWfh = allocation.available.wfh < 0
  const canSubmit =
    selectedDays.length > 0 && !insufficientLeave && !insufficientWfh && !isPending

  function leavesOn(dateIso: string) {
    return (data?.leaves ?? []).filter(
      (leave) => leave.start_date <= dateIso && leave.end_date >= dateIso
    )
  }

  function validateDate(date: Date, type: PlanType) {
    const iso = format(date, 'yyyy-MM-dd')
    if (iso < todayIso()) return `${iso} is in the past.`
    if (dayCode(date) === 'SUN') return `${iso} is Sunday!`
    if (holidayByDate.has(iso)) return `${iso} is a Holiday!`
    if (type === 'wfh' && !wfoDays.has(dayCode(date))) {
      return `${iso} is a WFH day for YOU!`
    }
    const ownOverlap = leavesOn(iso).find((leave) => leave.user_id === data?.currentUserId)
    if (ownOverlap) {
      return `${iso} already has your ${TYPE_LABEL[ownOverlap.type] ?? ownOverlap.type} request.`
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
      pushToast({ title: 'Cannot select date', body: error, variant: 'error' })
      return
    }

    setSelectedDays((prev) => [
      ...prev.filter((item) => item.date !== iso),
      { date: iso, type: mode },
    ])
  }

  function selectedDayWarnings() {
    return selectedDays
      .map((day) => {
        const teamLeaves = leavesOn(day.date).filter((leave) => leave.user_id !== data?.currentUserId)
        const away = teamLeaves.filter((leave) => leave.type === 'leave' || leave.type === 'compoff_leave')
        const wfh = teamLeaves.filter((leave) => leave.type === 'wfh' || leave.type === 'compoff_wfh')
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
    startTransition(async () => {
      try {
        await createMyLeavePlan({
          days: selectedDays
            .slice()
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((day) => ({ date: day.date, type: day.type })),
          reason: reason.trim() || null,
        })
        pushToast({
          title: 'Leave request submitted',
          body: 'Your manager will review the complete plan.',
          variant: 'success',
        })
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
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Apply Leave / WFH</DialogTitle>
        </DialogHeader>

        {loading || !data ? (
          <div className="flex min-h-[420px] items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading calendar planner...
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCursor(subMonths(cursor, 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="w-36 text-center text-sm font-semibold">
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

                <div className="flex rounded-lg border bg-background p-1">
                  {(['leave', 'wfh'] as const).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setMode(item)}
                      className={cn(
                        'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                        mode === item ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {TYPE_LABEL[item]}
                    </button>
                  ))}
                </div>
              </div>

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
                    const isSundayDay = dayCode(day) === 'SUN'
                    const holiday = holidayByDate.get(iso)
                    const isOwnWfhDay = !isSundayDay && !holiday && !wfoDays.has(dayCode(day))
                    const selectedType = selectedByDate.get(iso)
                    const teamLeaves = leavesOn(iso).filter((leave) => leave.user_id !== data.currentUserId)
                    const teamAway = teamLeaves.filter((leave) => leave.type === 'leave' || leave.type === 'compoff_leave')

                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => toggleDay(day)}
                        className={cn(
                          'min-h-[112px] border-r border-b p-2 text-left text-xs transition-colors hover:bg-muted/40',
                          !inMonth && 'bg-muted/10 opacity-45',
                          isSundayDay && 'bg-muted/40',
                          isToday && 'ring-2 ring-primary ring-inset',
                          selectedType === 'leave' && 'bg-orange-50',
                          selectedType === 'wfh' && 'bg-blue-50'
                        )}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span className={cn('font-semibold', isToday && 'text-primary')}>
                            {format(day, 'd')}
                          </span>
                          {selectedType && (
                            <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset', TYPE_PILL[selectedType])}>
                              {TYPE_LABEL[selectedType]}
                            </span>
                          )}
                        </div>

                        <div className="mt-1 space-y-1">
                          {holiday && (
                            <div className="truncate rounded bg-rose-50 px-1 py-0.5 text-[10px] font-medium text-rose-700 ring-1 ring-rose-100">
                              {holiday}
                            </div>
                          )}
                          {isSundayDay && (
                            <div className="rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-600">
                              Sunday
                            </div>
                          )}
                          {isOwnWfhDay && (
                            <div className="flex items-center gap-1 rounded bg-blue-50 px-1 py-0.5 text-[10px] font-medium text-blue-700 ring-1 ring-blue-100">
                              <Home className="h-3 w-3" />
                              Your WFH day
                            </div>
                          )}
                          {teamAway.length > 0 && (
                            <div className="truncate rounded bg-amber-50 px-1 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-amber-100">
                              {teamAway.length} team away
                            </div>
                          )}
                          {teamLeaves.slice(0, 2).map((leave) => (
                            <div
                              key={leave.id}
                              className={cn('truncate rounded px-1 py-0.5 text-[10px] font-medium ring-1 ring-inset', TYPE_PILL[leave.type])}
                              title={`${leave.user_full_name} - ${TYPE_LABEL[leave.type] ?? leave.type}`}
                            >
                              {leave.user_full_name.split(' ')[0]}: {TYPE_LABEL[leave.type] ?? leave.type}
                            </div>
                          ))}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-xl border p-4">
                <div className="text-sm font-semibold">Balances</div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {(['compoff_leave', 'leave', 'compoff_wfh', 'wfh'] as const).map((type) => {
                    const balance = balanceFor(data, type)
                    const used = allocation.used[type]
                    return (
                      <div key={type} className="rounded-lg border p-3">
                        <div className="text-[11px] font-medium text-muted-foreground">
                          {TYPE_LABEL[type]}
                        </div>
                        <div className="mt-1 text-lg font-semibold tabular-nums">
                          {formatDays(balance.remaining - used)}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {used > 0 ? `-${formatDays(used)} in this request` : `of ${formatDays(balance.allocated)}`}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {(insufficientLeave || insufficientWfh) && (
                  <div className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-700 ring-1 ring-rose-100">
                    Selected days exceed available {insufficientLeave ? 'leave' : 'WFH'} balance.
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
                      Choose Leave or WFH, then click working days in the calendar.
                    </p>
                  ) : (
                    selectedDays
                      .slice()
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .map((day) => (
                        <div key={day.date} className="flex items-center justify-between gap-2 rounded-lg border p-2">
                          <div>
                            <div className="text-xs font-medium">
                              {format(parseISO(day.date), 'EEE, MMM d')}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {data.primaryTeam?.name ?? 'No primary team'}
                            </div>
                          </div>
                          <span className={cn('rounded px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset', TYPE_PILL[day.type])}>
                            {TYPE_LABEL[day.type]}
                          </span>
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
                              {TYPE_LABEL[leave.type] ?? leave.type}
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
            {isPending ? 'Submitting...' : 'Submit request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
