'use client'

import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import type { RosterCell, RosterCellType, LeaveRequestDay } from './leave-request-types'

interface Props {
  applicantId: string
  applicantName: string
  applicantDays: LeaveRequestDay[]   // the request itself, used to mark applicant cells with ✱
  rosterCells: RosterCell[]          // teammates + holidays returned by fetchRosterContext
  dateRange: { start: string; end: string }
  wfoPattern?: string                 // e.g. "MON,TUE,WED,THU,FRI,SAT" — defaults to MON-SAT
}

const DAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const

function dayCode(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return DAY_CODES[new Date(y, m - 1, d).getDay()]
}

function expandDates(start: string, end: string): string[] {
  const out: string[] = []
  let cur = start
  while (cur <= end) {
    out.push(cur)
    const [y, m, d] = cur.split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d))
    dt.setUTCDate(dt.getUTCDate() + 1)
    cur = dt.toISOString().slice(0, 10)
  }
  return out
}

function cellLabel(type: RosterCellType, half: 'first_half' | 'second_half' | null): string {
  const base =
    type === 'leave' || type === 'compoff_leave' ? 'L' :
    type === 'wfh' || type === 'compoff_wfh' ? 'W' :
    type === 'holiday' ? 'H' : ''
  return half ? `½${base}` : base
}

function cellClass(type: RosterCellType): string {
  switch (type) {
    case 'leave':
    case 'compoff_leave':
      return 'bg-orange-100 text-orange-800'
    case 'wfh':
    case 'compoff_wfh':
      return 'bg-blue-100 text-blue-800'
    case 'holiday':
      return 'bg-slate-200 text-slate-700'
    default:
      return ''
  }
}

export function TeamRosterGrid({
  applicantId,
  applicantName,
  applicantDays,
  rosterCells,
  dateRange,
  wfoPattern = 'MON,TUE,WED,THU,FRI,SAT',
}: Props) {
  const workDays = useMemo(() => {
    const allowed = new Set(wfoPattern.split(',').map((s) => s.trim().toUpperCase()))
    return expandDates(dateRange.start, dateRange.end).filter((d) => allowed.has(dayCode(d)))
  }, [dateRange.start, dateRange.end, wfoPattern])

  // index roster: user_id -> date -> cell
  const cellByUserDate = useMemo(() => {
    const map = new Map<string, Map<string, RosterCell>>()
    for (const c of rosterCells) {
      if (c.type === 'holiday') continue
      const inner = map.get(c.user_id) ?? new Map()
      inner.set(c.date, c)
      map.set(c.user_id, inner)
    }
    return map
  }, [rosterCells])

  const holidayDates = useMemo(() => {
    const set = new Set<string>()
    for (const c of rosterCells) if (c.type === 'holiday') set.add(c.date)
    return set
  }, [rosterCells])

  const applicantDayByDate = useMemo(() => {
    const map = new Map<string, LeaveRequestDay>()
    for (const d of applicantDays) map.set(d.date, d)
    return map
  }, [applicantDays])

  // member rows: applicant first, others alphabetical
  const otherUserIds = Array.from(cellByUserDate.keys()).filter((id) => id !== applicantId)
  const otherNames = new Map<string, string>()
  for (const c of rosterCells) {
    if (c.user_id !== applicantId && c.type !== 'holiday') {
      otherNames.set(c.user_id, c.user_full_name)
    }
  }
  otherUserIds.sort((a, b) =>
    (otherNames.get(a) ?? '').localeCompare(otherNames.get(b) ?? '')
  )

  const memberIds = [applicantId, ...otherUserIds]

  // bottom summary: count absent per day
  const absentCounts = workDays.map((date) => {
    let count = 0
    if (applicantDayByDate.has(date)) count += 1
    for (const id of otherUserIds) {
      if (cellByUserDate.get(id)?.has(date)) count += 1
    }
    return count
  })
  const totalMembers = memberIds.length
  const redThreshold = Math.max(2, Math.ceil(totalMembers * 0.3))

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="min-w-full text-sm">
        <thead className="bg-muted/40">
          <tr>
            <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-left text-[11px] font-medium text-muted-foreground">
              Member
            </th>
            {workDays.map((d) => (
              <th
                key={d}
                className={cn(
                  'px-2 py-2 text-center text-[11px] font-medium text-muted-foreground',
                  holidayDates.has(d) && 'bg-slate-200/60'
                )}
              >
                <div>{format(parseISO(d), 'EEE')}</div>
                <div>{format(parseISO(d), 'MMM d')}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {memberIds.map((id) => {
            const name =
              id === applicantId ? applicantName : otherNames.get(id) ?? 'Unknown'
            return (
              <tr
                key={id}
                className={cn(
                  'border-t',
                  id === applicantId && 'bg-orange-50/40'
                )}
              >
                <td className="sticky left-0 z-10 bg-card px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Avatar name={name} size="sm" />
                    <span className="text-[12.5px] font-medium">
                      {name}
                      {id === applicantId && <span className="ml-1 text-orange-600">✱</span>}
                    </span>
                  </div>
                </td>
                {workDays.map((d) => {
                  const cell =
                    id === applicantId
                      ? applicantDayByDate.get(d)
                      : cellByUserDate.get(id)?.get(d)
                  const isHoliday = holidayDates.has(d)
                  if (isHoliday && !cell) {
                    return (
                      <td key={d} className="bg-slate-200/60 px-2 py-2 text-center text-[11px] text-slate-600">
                        H
                      </td>
                    )
                  }
                  if (!cell) {
                    return (
                      <td key={d} className="px-2 py-2 text-center text-[11px] text-muted-foreground">
                        —
                      </td>
                    )
                  }
                  const type = ('type' in cell ? cell.type : 'leave') as RosterCellType
                  const half =
                    ('half_day_position' in cell
                      ? cell.half_day_position
                      : null) as 'first_half' | 'second_half' | null
                  return (
                    <td key={d} className="px-2 py-2 text-center">
                      <span
                        className={cn(
                          'inline-flex h-6 min-w-[26px] items-center justify-center rounded px-1 text-[11px] font-semibold',
                          cellClass(type)
                        )}
                      >
                        {cellLabel(type, half)}
                      </span>
                    </td>
                  )
                })}
              </tr>
            )
          })}
          <tr className="border-t-2 bg-muted/30">
            <td className="sticky left-0 z-10 bg-muted/30 px-3 py-2 text-[11px] font-semibold text-muted-foreground">
              Absent
            </td>
            {absentCounts.map((c, i) => (
              <td
                key={workDays[i]}
                className={cn(
                  'px-2 py-2 text-center text-[12px] font-semibold tabular-nums',
                  c >= redThreshold ? 'text-rose-600' : 'text-muted-foreground'
                )}
              >
                {c}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
