'use client'

import { useMemo, useState } from 'react'
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
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Avatar } from '@/components/ui/avatar'
import { useCapabilities } from '@/hooks/use-capabilities'
import { cn } from '@/lib/utils'
import type { UserWithMembership } from '@/lib/queries/users'
import type { TeamWithMembers } from '@/lib/queries/teams'
import type { LeaveWithUser } from '@/lib/queries/leaves'
import type { Tables } from '@/lib/supabase/database.types'

const TYPE_PILL: Record<string, string> = {
  wfh: 'bg-blue-100 text-blue-800',
  leave: 'bg-orange-100 text-orange-800',
  compoff_wfh: 'bg-cyan-100 text-cyan-800',
  compoff_leave: 'bg-amber-100 text-amber-800',
}

const TYPE_LABEL: Record<string, string> = {
  wfh: 'WFH',
  leave: 'Leave',
  compoff_wfh: 'C-WFH',
  compoff_leave: 'C-Leave',
}

interface Props {
  currentUser: Tables<'users'>
  users: UserWithMembership[]
  teams: TeamWithMembers[]
  holidays: Tables<'holidays'>[]
  allLeaves: LeaveWithUser[]
}

export function CalendarClient({ currentUser, users, teams, holidays, allLeaves }: Props) {
  const { can } = useCapabilities()
  const [cursor, setCursor] = useState(new Date())
  const [selected, setSelected] = useState<string | null>(null)

  // Determine my teams + primary
  const me = users.find((u) => u.id === currentUser.id)
  const myMemberships = me?.memberships ?? []
  const primaryTeamId =
    myMemberships.find((m) => m.is_primary)?.team_id ?? myMemberships[0]?.team_id ?? null

  // Members by team
  const membersByTeam = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const u of users) {
      for (const mb of u.memberships) {
        if (!m[mb.team_id]) m[mb.team_id] = []
        m[mb.team_id].push(u.id)
      }
    }
    return m
  }, [users])

  // Default scope based on role
  const defaultScope = can.isHROrAbove ? 'all' : primaryTeamId ?? 'me'
  const [scope, setScope] = useState<string>(defaultScope)

  // Filter leaves by scope
  const filteredLeaves = useMemo(() => {
    if (scope === 'me') return allLeaves.filter((l) => l.user_id === currentUser.id)
    if (scope === 'all') return allLeaves
    const ids = membersByTeam[scope] ?? []
    return allLeaves.filter((l) => ids.includes(l.user_id))
  }, [allLeaves, scope, currentUser.id, membersByTeam])

  // Holidays by date
  const holidayByDate = useMemo(() => {
    const m: Record<string, string> = {}
    for (const h of holidays) m[h.date] = h.name
    return m
  }, [holidays])

  // Calendar grid
  const monthStart = startOfMonth(cursor)
  const monthEnd = endOfMonth(cursor)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })

  const days = useMemo(() => {
    const out: Date[] = []
    let d = gridStart
    while (d <= gridEnd) {
      out.push(d)
      d = addDays(d, 1)
    }
    return out
  }, [gridStart.toISOString(), gridEnd.toISOString()])

  function leavesOn(d: Date): LeaveWithUser[] {
    const iso = format(d, 'yyyy-MM-dd')
    return filteredLeaves.filter(
      (l) => l.start_date <= iso && l.end_date >= iso
    )
  }

  function isWeekendDay(d: Date) {
    const day = d.getDay()
    return day === 0 || day === 6
  }

  const today = new Date()
  const selectedDate = selected ? parseISO(selected) : null
  const selectedLeaves = selected ? leavesOn(parseISO(selected)) : []

  // Build scope options
  const scopeOptions: { value: string; label: string }[] = [
    { value: 'me', label: 'Just me' },
    ...myMemberships.map((m) => {
      const team = teams.find((t) => t.id === m.team_id)
      return {
        value: m.team_id,
        label: `My team: ${team?.name ?? m.team_id}${m.is_primary ? ' (primary)' : ''}`,
      }
    }),
    ...(can.isHROrAbove ? [{ value: 'all', label: 'All organization' }] : []),
  ]

  return (
    <>
      <Topbar title="Calendar" subtitle="Leaves and holidays at a glance" />
      <div className="px-5 lg:px-8 py-5 space-y-4">
        {/* Header bar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCursor(subMonths(cursor, 1))}
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-[14px] font-semibold w-36 text-center">
              {format(cursor, 'MMMM yyyy')}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCursor(addMonths(cursor, 1))}
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCursor(new Date())}
            >
              Today
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {(['wfh', 'leave', 'compoff_wfh', 'compoff_leave'] as const).map((t) => (
                <span key={t} className={cn('rounded px-1.5 py-0.5 font-medium', TYPE_PILL[t])}>
                  {TYPE_LABEL[t]}
                </span>
              ))}
              <span className="rounded px-1.5 py-0.5 font-medium bg-rose-100 text-rose-800">
                Holiday
              </span>
            </div>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Scope" />
              </SelectTrigger>
              <SelectContent>
                {scopeOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Calendar grid */}
        <Card>
          <CardContent className="p-0">
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                <div
                  key={d}
                  className="text-center text-[11px] uppercase tracking-wider text-muted-foreground font-semibold py-2 border-r last:border-r-0"
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Days */}
            <div className="grid grid-cols-7">
              {days.map((d, i) => {
                const iso = format(d, 'yyyy-MM-dd')
                const leaves = leavesOn(d)
                const holiday = holidayByDate[iso]
                const inMonth = isSameMonth(d, cursor)
                const isToday = isSameDay(d, today)
                const wkend = isWeekendDay(d)
                const isSelected = selected === iso

                return (
                  <button
                    key={i}
                    onClick={() => setSelected(iso)}
                    className={cn(
                      'relative min-h-[100px] border-r border-b last:border-r-0 p-1.5 text-left text-xs transition-colors hover:bg-muted/40 overflow-hidden',
                      !inMonth && 'opacity-40 bg-muted/10',
                      wkend && 'bg-muted/30',
                      isToday && 'ring-2 ring-violet-500 ring-inset',
                      isSelected && 'bg-violet-50'
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={cn('text-[11px] font-semibold', isToday && 'text-violet-700')}>
                        {format(d, 'd')}
                      </span>
                      {leaves.length > 0 && (
                        <span className="text-[9px] text-muted-foreground">{leaves.length}</span>
                      )}
                    </div>

                    {holiday && (
                      <div className="rounded bg-rose-100 text-rose-800 text-[9.5px] px-1 py-0.5 mb-1 truncate font-medium">
                        🏛 {holiday}
                      </div>
                    )}

                    <div className="space-y-0.5">
                      {leaves.slice(0, 3).map((l) => {
                        const isStartDay = l.start_date === iso
                        const isEndDay = l.end_date === iso
                        const halfStart = isStartDay && l.half_day_start
                        const halfEnd = isEndDay && l.half_day_end
                        const isHalf = halfStart || halfEnd
                        return (
                          <div
                            key={l.id}
                            className={cn(
                              'rounded px-1 py-0.5 text-[9.5px] font-medium truncate',
                              TYPE_PILL[l.type],
                              isHalf && 'opacity-70 italic'
                            )}
                            title={`${l.user_full_name} — ${TYPE_LABEL[l.type]}${isHalf ? ' (½)' : ''}`}
                          >
                            {isHalf ? '½ ' : ''}
                            {l.user_full_name.split(' ')[0]}
                          </div>
                        )
                      })}
                      {leaves.length > 3 && (
                        <div className="text-[9.5px] text-muted-foreground font-medium">
                          +{leaves.length - 3} more
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Selected day detail */}
        {selectedDate && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[14px] font-semibold">
                  {format(selectedDate, 'EEEE, MMM d, yyyy')}
                  {holidayByDate[selected!] && (
                    <span className="ml-2 inline-block rounded bg-rose-100 text-rose-800 text-[11px] px-2 py-0.5 font-medium">
                      🏛 {holidayByDate[selected!]}
                    </span>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                  Close
                </Button>
              </div>
              {selectedLeaves.length === 0 ? (
                <div className="text-[12.5px] text-muted-foreground">
                  No leaves on this day in the current scope.
                </div>
              ) : (
                <ul className="divide-y">
                  {selectedLeaves.map((l) => (
                    <li key={l.id} className="flex items-center gap-3 py-2">
                      <Avatar name={l.user_full_name} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium truncate">{l.user_full_name}</div>
                        <div className="text-[11.5px] text-muted-foreground truncate">
                          {l.start_date} → {l.end_date}
                          {l.reason ? ` · ${l.reason}` : ''}
                        </div>
                      </div>
                      <span className={cn('rounded px-1.5 py-0.5 text-[10.5px] font-medium', TYPE_PILL[l.type])}>
                        {TYPE_LABEL[l.type]}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  )
}
