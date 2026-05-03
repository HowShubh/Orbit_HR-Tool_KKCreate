'use client'

import { format, parseISO, differenceInDays } from 'date-fns'
import { Plus, Sparkles, CalendarDays, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { LeaveFormDialog } from '@/components/leave/leave-form-dialog'
import { CompoffRequestDialog } from '@/components/leave/compoff-request-dialog'
import { cn } from '@/lib/utils'
import type { AppUser } from '@/lib/auth/get-current-user'
import type { DashboardData } from '@/lib/queries/dashboard'
import type { Tables } from '@/lib/supabase/database.types'

const LEAVE_TYPE_LABELS: Record<string, string> = {
  wfh: 'WFH',
  leave: 'Leave',
  compoff_wfh: 'Comp-off WFH',
  compoff_leave: 'Comp-off Leave',
}

const LEAVE_TYPE_PILL: Record<string, string> = {
  wfh: 'bg-blue-50 text-blue-700 ring-blue-100',
  leave: 'bg-orange-50 text-orange-700 ring-orange-100',
  compoff_wfh: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
  compoff_leave: 'bg-amber-50 text-amber-700 ring-amber-100',
}

type LeaveTypePill = keyof typeof LEAVE_TYPE_PILL

function TypePill({ type }: { type: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
        LEAVE_TYPE_PILL[type as LeaveTypePill] ?? 'bg-muted text-muted-foreground ring-border'
      )}
    >
      {LEAVE_TYPE_LABELS[type] ?? type}
    </span>
  )
}

function greet() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatDateRange(start: string, end: string) {
  if (start === end) return format(parseISO(start), 'MMM d, yyyy')
  return `${format(parseISO(start), 'MMM d')} – ${format(parseISO(end), 'MMM d, yyyy')}`
}

interface Props {
  currentUser: AppUser
  data: DashboardData
  notifications: Tables<'notifications'>[]
}

export function DashboardClient({ currentUser, data }: Props) {
  const greeting = greet()
  const today = format(new Date(), 'EEEE, MMM d')
  const role = currentUser.role

  const subtitle =
    role === 'employee'
      ? "Here's what's happening with your work this week."
      : role === 'team_lead'
      ? "Here's how your team is doing today."
      : "Here's what's happening across the organization today."

  const isHROrAbove = role === 'hr' || role === 'founder'
  const isTeamLead = role === 'team_lead' || isHROrAbove

  return (
    <>
      <Topbar
        title={`${greeting}, ${currentUser.full_name.split(' ')[0]} 👋`}
        subtitle={subtitle}
      />

      <div className="px-5 lg:px-8 py-5 space-y-5">
        {/* Action bar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[13px] text-muted-foreground">
            <span className="font-semibold text-foreground">{today}</span> · FY 2026–27
          </div>
          <div className="flex items-center gap-2">
            <CompoffRequestDialog
              trigger={
                <Button variant="outline" size="sm">
                  <Sparkles className="h-4 w-4" />
                  Request comp-off
                </Button>
              }
            />
            <LeaveFormDialog
              trigger={
                <Button size="sm">
                  <Plus className="h-4 w-4" />
                  Apply for leave
                </Button>
              }
            />
          </div>
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Who's out today */}
          <WhosOutTodayCard leaves={data.leavesToday} />

          {/* My balances */}
          <MyBalancesCard balances={data.myBalances} compoffBalances={data.myCompoffBalance} />

          {/* Upcoming holidays */}
          <HolidaysCard holidays={data.upcomingHolidays} />

          {/* Upcoming (mine) */}
          <UpcomingMineCard leaves={data.upcomingMine} />

          {/* Upcoming (team) — only show when has team data */}
          {isTeamLead && (
            <UpcomingTeamCard leaves={data.upcomingTeam} />
          )}

          {/* Pending approvals */}
          {data.pendingApprovalsForMe.length > 0 && (
            <PendingApprovalsCard count={data.pendingApprovalsForMe.length} />
          )}
        </div>
      </div>
    </>
  )
}

function WhosOutTodayCard({ leaves }: { leaves: DashboardData['leavesToday'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Who's Out Today</CardTitle>
        {leaves.length > 0 && (
          <Badge variant="warning">{leaves.length}</Badge>
        )}
      </CardHeader>
      <CardContent>
        {leaves.length === 0 ? (
          <p className="text-sm text-muted-foreground">Everyone is in today 🎉</p>
        ) : (
          <div className="space-y-3">
            {leaves.slice(0, 6).map((leave) => (
              <div key={leave.id} className="flex items-center gap-3">
                <Avatar name={leave.user_full_name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-medium truncate">{leave.user_full_name}</div>
                </div>
                <TypePill type={leave.type} />
              </div>
            ))}
            {leaves.length > 6 && (
              <p className="text-[12px] text-muted-foreground">+{leaves.length - 6} more</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function MyBalancesCard({
  balances,
  compoffBalances,
}: {
  balances: DashboardData['myBalances']
  compoffBalances: DashboardData['myCompoffBalance']
}) {
  const allBalances = [...balances, ...compoffBalances]
  const types = ['leave', 'wfh', 'compoff_leave', 'compoff_wfh'] as const

  return (
    <Card>
      <CardHeader>
        <CardTitle>My Balances</CardTitle>
        <Link href="/leaves" className="text-[12px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
          View all <ChevronRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {types.map((type) => {
            const bal = allBalances.find((b) => b.type === type)
            const allocated = bal?.allocated ?? 0
            const used = bal?.used ?? 0
            const remaining = Math.max(0, allocated - used)
            const pct = allocated > 0 ? Math.min(100, (remaining / allocated) * 100) : 0

            return (
              <div key={type} className="rounded-lg border border-border/60 p-3">
                <div className="text-[11px] font-medium text-muted-foreground truncate">
                  {LEAVE_TYPE_LABELS[type]}
                </div>
                <div className="mt-1 text-[20px] font-semibold tabular-nums">
                  {Number.isInteger(remaining) ? remaining : remaining.toFixed(1)}
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  of {Number.isInteger(allocated) ? allocated : allocated.toFixed(1)} days
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function UpcomingMineCard({ leaves }: { leaves: DashboardData['upcomingMine'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>My Upcoming Leaves</CardTitle>
        <Link href="/leaves" className="text-[12px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
          All <ChevronRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent>
        {leaves.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming leaves in the next 60 days.</p>
        ) : (
          <div className="space-y-3">
            {leaves.slice(0, 5).map((leave) => (
              <div key={leave.id} className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium">
                    {formatDateRange(leave.start_date, leave.end_date)}
                  </div>
                  <div className="text-[11.5px] text-muted-foreground">
                    {leave.days_deducted} day{leave.days_deducted !== 1 ? 's' : ''}
                  </div>
                </div>
                <TypePill type={leave.type} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function UpcomingTeamCard({ leaves }: { leaves: DashboardData['upcomingTeam'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Leaves (30 days)</CardTitle>
        {leaves.length > 0 && (
          <Badge variant="muted">{leaves.length}</Badge>
        )}
      </CardHeader>
      <CardContent>
        {leaves.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming team leaves.</p>
        ) : (
          <div className="space-y-3">
            {leaves.slice(0, 6).map((leave) => (
              <div key={leave.id} className="flex items-center gap-3">
                <Avatar name={leave.user_full_name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-medium truncate">{leave.user_full_name}</div>
                  <div className="text-[11.5px] text-muted-foreground">
                    {formatDateRange(leave.start_date, leave.end_date)}
                  </div>
                </div>
                <TypePill type={leave.type} />
              </div>
            ))}
            {leaves.length > 6 && (
              <p className="text-[12px] text-muted-foreground">+{leaves.length - 6} more</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function HolidaysCard({ holidays }: { holidays: DashboardData['upcomingHolidays'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming Holidays</CardTitle>
      </CardHeader>
      <CardContent>
        {holidays.length === 0 ? (
          <p className="text-sm text-muted-foreground">No holidays in the next 30 days.</p>
        ) : (
          <div className="space-y-2.5">
            {holidays.map((h) => {
              const daysAway = differenceInDays(parseISO(h.date), new Date())
              return (
                <div key={h.id} className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg bg-orange-50 text-orange-700">
                    <span className="text-[10px] font-bold uppercase leading-none">
                      {format(parseISO(h.date), 'MMM')}
                    </span>
                    <span className="text-[14px] font-bold leading-none">
                      {format(parseISO(h.date), 'd')}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-medium truncate">{h.name}</div>
                    <div className="text-[11.5px] text-muted-foreground">
                      {daysAway === 0 ? 'Today' : daysAway === 1 ? 'Tomorrow' : `In ${daysAway} days`}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PendingApprovalsCard({ count }: { count: number }) {
  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardHeader>
        <CardTitle className="text-amber-900">Pending Approvals</CardTitle>
        <Badge variant="warning">{count}</Badge>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-amber-800">
          You have {count} compoff request{count !== 1 ? 's' : ''} waiting for your decision.
        </p>
        <Link href="/hr">
          <Button size="sm" variant="outline" className="mt-3 border-amber-300 text-amber-900 hover:bg-amber-100">
            Review in HR Console
          </Button>
        </Link>
      </CardContent>
    </Card>
  )
}
