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
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, Sparkles } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getCompoffPlannerData,
  getCompoffPlannerDataForUser,
  requestCompoffPlan,
  requestCompoffPlanForUser,
} from '@/lib/actions/compoff'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

type OnBehalfConfig = {
  users: Array<{ id: string; full_name: string; status: string }>
}

interface Props {
  trigger?: React.ReactNode
  onBehalf?: OnBehalfConfig
}

type CompoffType = 'compoff_leave' | 'compoff_wfh'
type SelectedDay = { date: string; type: CompoffType; half_day: boolean }
type PlannerData = Awaited<ReturnType<typeof getCompoffPlannerData>>

const DAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const TYPE_PILL: Record<CompoffType, string> = {
  compoff_leave: 'bg-amber-100 text-amber-800 ring-amber-200',
  compoff_wfh: 'bg-cyan-100 text-cyan-800 ring-cyan-200',
}
const TYPE_DEFAULT_NAME: Record<CompoffType, string> = {
  compoff_leave: 'Comp-off Leave',
  compoff_wfh: 'Comp-off WFH',
}

function todayIso() {
  return format(new Date(), 'yyyy-MM-dd')
}

export function CompoffRequestDialog({ trigger, onBehalf }: Props) {
  const router = useRouter()
  const { pushToast } = useStore()
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<PlannerData | null>(null)
  const [loading, setLoading] = useState(false)
  const [cursor, setCursor] = useState(new Date())
  const [mode, setMode] = useState<CompoffType>('compoff_leave')
  const [selectedDays, setSelectedDays] = useState<SelectedDay[]>([])
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState(false)
  const reasonRef = useRef<HTMLTextAreaElement>(null)
  const [targetUserId, setTargetUserId] = useState('')
  const [isPending, startTransition] = useTransition()
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

  // HR mode: reload when the chosen employee changes.
  useEffect(() => {
    if (!onBehalf) return
    setData(null)
    setSelectedDays([])
    setNotice(null)
  }, [targetUserId, onBehalf])

  useEffect(() => {
    if (!open || data || loading) return
    if (onBehalf && !targetUserId) return
    setLoading(true)
    const request = onBehalf
      ? getCompoffPlannerDataForUser(targetUserId)
      : getCompoffPlannerData()
    request
      .then(setData)
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Failed to load comp-off planner'
        pushToast({ title: 'Error', body: msg, variant: 'error' })
      })
      .finally(() => setLoading(false))
  }, [open, data, loading, pushToast, onBehalf, targetUserId])

  function reset() {
    setSelectedDays([])
    setReason('')
    setReasonError(false)
    setMode('compoff_leave')
    setCursor(new Date())
    setNotice(null)
    setData(null)
    setTargetUserId('')
  }

  function handleOpenChange(v: boolean) {
    setOpen(v)
    if (!v) reset()
  }

  const offDays = useMemo(() => {
    const codes = (data?.primaryTeam?.off_days ?? 'SUN')
      .split(',')
      .map((d) => d.trim().toUpperCase())
      .filter(Boolean)
    return new Set(codes)
  }, [data?.primaryTeam?.off_days])

  const holidayByDate = useMemo(() => {
    const m = new Map<string, string>()
    for (const h of data?.holidays ?? []) m.set(h.date, h.name)
    return m
  }, [data?.holidays])

  const requestedDates = useMemo(
    () => new Set((data?.existingGrants ?? []).map((g) => g.work_date)),
    [data?.existingGrants]
  )

  const selectedByDate = useMemo(() => {
    const m = new Map<string, SelectedDay>()
    for (const d of selectedDays) m.set(d.date, d)
    return m
  }, [selectedDays])

  const compoffTypes: { key: CompoffType; name: string }[] = useMemo(() => {
    const fromData = (data?.compoffTypes ?? [])
      .filter((t) => t.key === 'compoff_leave' || t.key === 'compoff_wfh')
      .map((t) => ({ key: t.key as CompoffType, name: t.name }))
    if (fromData.length > 0) return fromData
    return [
      { key: 'compoff_leave', name: TYPE_DEFAULT_NAME.compoff_leave },
      { key: 'compoff_wfh', name: TYPE_DEFAULT_NAME.compoff_wfh },
    ]
  }, [data?.compoffTypes])

  const gridStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 })
  const gridEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 })
  const days = useMemo(() => {
    const out: Date[] = []
    let d = gridStart
    while (d <= gridEnd) {
      out.push(d)
      d = addDays(d, 1)
    }
    return out
  }, [gridStart, gridEnd])

  function toggleDay(date: Date) {
    const iso = format(date, 'yyyy-MM-dd')
    if (selectedByDate.has(iso)) {
      setSelectedDays((prev) => prev.filter((d) => d.date !== iso))
      return
    }
    if (iso > todayIso()) {
      showNotice('Comp-off is for work already done — you can only pick past days or today.')
      return
    }
    if (requestedDates.has(iso)) {
      showNotice('You already have a comp-off request for this day.')
      return
    }
    setSelectedDays((prev) => [...prev, { date: iso, type: mode, half_day: false }])
  }

  function setHalf(date: string, half: boolean) {
    setSelectedDays((prev) => prev.map((d) => (d.date === date ? { ...d, half_day: half } : d)))
  }

  const total = selectedDays.reduce((s, d) => s + (d.half_day ? 0.5 : 1), 0)
  // Reason is required, but we keep the button enabled so a click can explain
  // why nothing happens (instead of a silently-dead button).
  const canSubmit =
    selectedDays.length > 0 &&
    !isPending &&
    (!onBehalf || Boolean(targetUserId))

  function handleSubmit() {
    if (!canSubmit) return
    if (reason.trim().length === 0) {
      setReasonError(true)
      reasonRef.current?.focus()
      return
    }
    setReasonError(false)
    const days = selectedDays.map((d) => ({ date: d.date, type: d.type, half_day: d.half_day }))
    startTransition(async () => {
      try {
        const result = onBehalf
          ? await requestCompoffPlanForUser({ user_id: targetUserId, days, reason: reason.trim() })
          : await requestCompoffPlan({ days, reason: reason.trim() })
        pushToast({
          title: onBehalf
            ? `Comp-off added for ${result.count} day(s)`
            : `Comp-off requested for ${result.count} day(s)`,
          variant: 'success',
        })
        setOpen(false)
        reset()
        router.refresh()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to submit comp-off'
        pushToast({ title: 'Error', body: msg, variant: 'error' })
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <Sparkles className="h-4 w-4" />
            Request comp-off
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-x-hidden overflow-y-auto p-3 sm:p-6">
        <DialogHeader>
          <DialogTitle>{onBehalf ? 'Add comp-off for an employee' : 'Request Comp-off'}</DialogTitle>
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
          </div>
        )}

        {onBehalf && !targetUserId ? (
          <div className="flex min-h-[380px] items-center justify-center text-sm text-muted-foreground">
            Select an employee to open their calendar.
          </div>
        ) : loading || !data ? (
          <div className="flex min-h-[380px] items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading calendar…
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 space-y-4">
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setCursor(subMonths(cursor, 1))}>
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
                    disabled={isSameMonth(cursor, new Date()) || cursor > new Date()}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setCursor(new Date())}>
                    Today
                  </Button>
                </div>

                <div className="flex w-full min-w-0 gap-1 overflow-x-auto rounded-lg border bg-background p-1 sm:w-auto">
                  {compoffTypes.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setMode(t.key)}
                      className={cn(
                        'shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                        mode === t.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-[12px] text-muted-foreground">
                Pick the day(s) you worked (any past day). Each day earns 1 comp-off, or 0.5 for a half day.
              </p>

              <div className="rounded-xl border">
                <div className="grid grid-cols-7 border-b">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                    <div key={d} className="border-r py-2 text-center text-[11px] font-semibold uppercase text-muted-foreground last:border-r-0">
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {days.map((day) => {
                    const iso = format(day, 'yyyy-MM-dd')
                    const inMonth = isSameMonth(day, cursor)
                    const isToday = isSameDay(day, new Date())
                    const isFuture = iso > todayIso()
                    const isOff = offDays.has(DAY_CODES[day.getDay()])
                    const holiday = holidayByDate.get(iso)
                    const selected = selectedByDate.get(iso)
                    const requested = requestedDates.has(iso)
                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => toggleDay(day)}
                        disabled={isFuture || requested}
                        className={cn(
                          'min-h-[58px] border-r border-b p-1 text-left text-xs transition-colors last:border-r-0 hover:bg-muted/40 sm:min-h-[92px] sm:p-2',
                          !inMonth && 'bg-muted/10 opacity-45',
                          isOff && 'bg-muted/40',
                          (isFuture || requested) && 'cursor-not-allowed opacity-50',
                          isToday && 'ring-2 ring-primary ring-inset',
                          selected && TYPE_PILL[selected.type]
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className={cn('text-[13px] font-semibold sm:text-xs', isToday && 'text-primary')}>
                            {format(day, 'd')}
                          </span>
                          {selected?.half_day && <span className="text-[9px] font-semibold">½</span>}
                        </div>
                        <div className="mt-1 hidden space-y-0.5 sm:block">
                          {holiday && (
                            <div className="truncate rounded bg-rose-50 px-1 py-0.5 text-[10px] font-medium text-rose-700 ring-1 ring-rose-100">
                              {holiday}
                            </div>
                          )}
                          {requested && (
                            <div className="rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-600">
                              Requested
                            </div>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <aside className="min-w-0 space-y-4">
              {notice && (
                <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-900">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{notice}</span>
                </div>
              )}

              <div className="rounded-xl border p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Selected</div>
                  <div className="text-[12px] text-muted-foreground">{total} day(s)</div>
                </div>
                <div className="mt-3 max-h-48 space-y-2 overflow-y-auto pr-1">
                  {selectedDays.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Click the days you worked on the calendar.</p>
                  ) : (
                    selectedDays
                      .slice()
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .map((d) => (
                        <div key={d.date} className="rounded-lg border p-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium">{format(parseISO(d.date), 'EEE, MMM d')}</span>
                            <span className={cn('rounded px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset', TYPE_PILL[d.type])}>
                              {compoffTypes.find((t) => t.key === d.type)?.name ?? TYPE_DEFAULT_NAME[d.type]}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setHalf(d.date, !d.half_day)}
                            className={cn(
                              'mt-2 rounded-md border px-2 py-0.5 text-[10px] font-semibold transition-colors',
                              d.half_day ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
                            )}
                          >
                            Half day
                          </button>
                        </div>
                      ))
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="compoff-reason">
                  Reason <span className="text-rose-500">*</span>
                </Label>
                <textarea
                  id="compoff-reason"
                  ref={reasonRef}
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value)
                    if (reasonError && e.target.value.trim().length > 0) setReasonError(false)
                  }}
                  rows={3}
                  aria-invalid={reasonError}
                  placeholder="Why did you work these days?"
                  className={cn(
                    'flex min-h-[72px] w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2',
                    reasonError
                      ? 'border-rose-400 focus-visible:ring-rose-400'
                      : 'border-input focus-visible:ring-ring'
                  )}
                />
                {reasonError && (
                  <p className="text-[12px] font-medium text-rose-600">
                    A reason is required before you can request comp-off.
                  </p>
                )}
              </div>
            </aside>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={handleSubmit}>
            {isPending
              ? 'Submitting…'
              : `${onBehalf ? 'Add' : 'Request'} ${total} comp-off day(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
