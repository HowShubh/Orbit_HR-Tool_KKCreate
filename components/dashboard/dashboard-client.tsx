'use client'

import { useTransition, type ComponentType } from 'react'
import { useRouter } from 'next/navigation'
import { addDays, differenceInDays, format, isWeekend, parseISO, startOfWeek } from 'date-fns'
import {
  BriefcaseBusiness,
  Building2,
  Cake,
  CalendarCheck,
  CalendarDays,
  ChevronRight,
  CheckCircle2,
  Clock3,
  Home,
  Laptop,
  Network,
  Plus,
  Sparkles,
  UsersRound,
} from 'lucide-react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LeaveFormDialog } from '@/components/leave/leave-form-dialog'
import { CompoffRequestDialog } from '@/components/leave/compoff-request-dialog'
import {
  approveLeave,
  approveLeaveDeletion,
  rejectLeave,
  rejectLeaveDeletion,
} from '@/lib/actions/leaves'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import type { AppUser } from '@/lib/auth/get-current-user'
import type { DashboardData } from '@/lib/queries/dashboard'

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

const DAY_CODE_BY_INDEX = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function isoDate(date: Date) {
  return format(date, 'yyyy-MM-dd')
}

function parseWfoPattern(pattern?: string | null) {
  return new Set(
    (pattern ?? '')
      .split(',')
      .map((day) => day.trim().toUpperCase())
      .filter(Boolean)
  )
}

function getPrimaryTeam(data: DashboardData) {
  return (
    data.employeeTeams.find((team) => team.id === data.primaryTeamId) ??
    data.employeeTeams[0] ??
    null
  )
}

function leaveForDate(leaves: DashboardData['upcomingMine'], date: Date, userId?: string) {
  const dateIso = isoDate(date)
  return leaves.find(
    (leave) =>
      (!userId || leave.user_id === userId) &&
      leave.start_date <= dateIso &&
      leave.end_date >= dateIso
  )
}

function formatDays(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

interface Props {
  currentUser: AppUser
  data: DashboardData
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

  if (role === 'employee') {
    return (
      <EmployeeDashboard
        currentUser={currentUser}
        data={data}
        greeting={greeting}
        todayLabel={today}
      />
    )
  }

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
          {data.pendingLeaveApprovalsForMe.length > 0 && (
            <PendingLeaveApprovalsCard leaves={data.pendingLeaveApprovalsForMe} />
          )}
          {data.pendingApprovalsForMe.length > 0 && (
            <PendingApprovalsCard count={data.pendingApprovalsForMe.length} />
          )}
        </div>
      </div>
    </>
  )
}

function EmployeeDashboard({
  currentUser,
  data,
  greeting,
  todayLabel,
}: {
  currentUser: AppUser
  data: DashboardData
  greeting: string
  todayLabel: string
}) {
  const primaryTeam = getPrimaryTeam(data)

  return (
    <>
      <Topbar
        title={`${greeting}, ${currentUser.full_name.split(' ')[0]}`}
        subtitle="Your daily reference for schedule, leave, and team visibility."
      />

      <div className="px-5 lg:px-8 py-5 space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[13px] text-muted-foreground">
            <span className="font-semibold text-foreground">{todayLabel}</span> · FY 2026–27
          </div>
          <Link href="/team" className="text-[12px] text-muted-foreground hover:text-foreground flex items-center gap-1">
            My team <ChevronRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <EmployeeStatusCard
                currentUser={currentUser}
                team={primaryTeam}
                leavesToday={data.leavesToday}
                holidays={data.upcomingHolidays}
              />
              <EmployeeHolidayCard holidays={data.upcomingHolidays} />
            </div>

            <EmployeeScheduleCard
              currentUser={currentUser}
              team={primaryTeam}
              leaves={data.upcomingMine}
              todayLeaves={data.leavesToday}
              holidays={data.weekHolidays}
            />

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5">
              <MyBalancesCard
                balances={data.myBalances}
                compoffBalances={data.myCompoffBalance}
              />
              <EmployeeQuickActionsCard />
            </div>

            <DailyTeamOverviewCard data={data} />
          </div>

          <MyTeamReferenceCard currentUserId={currentUser.id} data={data} />
        </div>
      </div>
    </>
  )
}

function EmployeeStatusCard({
  currentUser,
  team,
  leavesToday,
  holidays,
}: {
  currentUser: AppUser
  team: ReturnType<typeof getPrimaryTeam>
  leavesToday: DashboardData['leavesToday']
  holidays: DashboardData['upcomingHolidays']
}) {
  const today = new Date()
  const todayIso = isoDate(today)
  const leave = leavesToday.find((item) => item.user_id === currentUser.id)
  const holiday = holidays.find((item) => item.date === todayIso)
  const wfoDays = parseWfoPattern(team?.wfo_pattern)
  const todayCode = DAY_CODE_BY_INDEX[today.getDay()]

  const status = (() => {
    if (leave?.type === 'leave' || leave?.type === 'compoff_leave') {
      return {
        label: leave.type === 'compoff_leave' ? 'Comp-off Leave' : 'On Leave',
        detail: formatDateRange(leave.start_date, leave.end_date),
        icon: CalendarDays,
        className: 'bg-orange-50 text-orange-700 ring-orange-100',
      }
    }
    if (leave?.type === 'wfh' || leave?.type === 'compoff_wfh') {
      return {
        label: leave.type === 'compoff_wfh' ? 'Comp-off WFH' : 'Working From Home',
        detail: team ? `${team.name} team schedule` : 'Remote work',
        icon: Home,
        className: 'bg-blue-50 text-blue-700 ring-blue-100',
      }
    }
    if (holiday) {
      return {
        label: 'Holiday',
        detail: holiday.name,
        icon: CalendarCheck,
        className: 'bg-rose-50 text-rose-700 ring-rose-100',
      }
    }
    if (isWeekend(today)) {
      return {
        label: 'Weekend',
        detail: 'Non-working day',
        icon: Clock3,
        className: 'bg-slate-50 text-slate-700 ring-slate-100',
      }
    }
    if (wfoDays.has(todayCode)) {
      return {
        label: 'In Office',
        detail: team ? `${team.name} WFO day` : 'Office day',
        icon: Building2,
        className: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
      }
    }
    return {
      label: 'Remote',
      detail: team ? `${team.name} remote day` : 'Remote day',
      icon: Laptop,
      className: 'bg-violet-50 text-violet-700 ring-violet-100',
    }
  })()

  const Icon = status.icon

  return (
    <Card>
      <CardHeader>
        <CardTitle>My Status</CardTitle>
        <Badge variant="muted">{format(today, 'EEE')}</Badge>
      </CardHeader>
      <CardContent>
        <div className={cn('rounded-lg p-4 ring-1 ring-inset', status.className)}>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/80">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[20px] font-semibold leading-tight">{status.label}</div>
              <div className="mt-1 text-[12px] opacity-80">{status.detail}</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function EmployeeHolidayCard({ holidays }: { holidays: DashboardData['upcomingHolidays'] }) {
  const nextHoliday = holidays[0]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming Holiday</CardTitle>
        <Link href="/calendar" className="text-[12px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
          Calendar <ChevronRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent>
        {!nextHoliday ? (
          <p className="text-sm text-muted-foreground">No upcoming holidays in the next 30 days.</p>
        ) : (
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-rose-50 text-rose-700 ring-1 ring-rose-100">
              <span className="text-[11px] font-bold uppercase leading-none">
                {format(parseISO(nextHoliday.date), 'MMM')}
              </span>
              <span className="mt-1 text-[18px] font-bold leading-none">
                {format(parseISO(nextHoliday.date), 'd')}
              </span>
            </div>
            <div className="min-w-0">
              <div className="text-[15px] font-semibold truncate">{nextHoliday.name}</div>
              <div className="mt-1 text-[12px] text-muted-foreground">
                {format(parseISO(nextHoliday.date), 'EEEE, MMM d')}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function EmployeeScheduleCard({
  currentUser,
  team,
  leaves,
  todayLeaves,
  holidays,
}: {
  currentUser: AppUser
  team: ReturnType<typeof getPrimaryTeam>
  leaves: DashboardData['upcomingMine']
  todayLeaves: DashboardData['leavesToday']
  holidays: DashboardData['weekHolidays']
}) {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
  const wfoDays = parseWfoPattern(team?.wfo_pattern)
  const allLeaves = [
    ...todayLeaves.filter((leave) => leave.user_id === currentUser.id),
    ...leaves,
  ]

  function planForDay(date: Date) {
    const dateIso = isoDate(date)
    const holiday = holidays.find((item) => item.date === dateIso)
    const leave = leaveForDate(allLeaves, date, currentUser.id)
    const code = DAY_CODE_BY_INDEX[date.getDay()]

    if (leave) {
      return {
        label: LEAVE_TYPE_LABELS[leave.type] ?? 'Leave',
        className: LEAVE_TYPE_PILL[leave.type] ?? 'bg-muted text-muted-foreground ring-border',
      }
    }
    if (holiday) {
      return { label: 'Holiday', className: 'bg-rose-50 text-rose-700 ring-rose-100' }
    }
    if (isWeekend(date)) {
      return { label: 'Weekend', className: 'bg-slate-50 text-slate-600 ring-slate-100' }
    }
    if (wfoDays.has(code)) {
      return { label: 'Office', className: 'bg-emerald-50 text-emerald-700 ring-emerald-100' }
    }
    return { label: 'Remote', className: 'bg-violet-50 text-violet-700 ring-violet-100' }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>This Week Schedule</CardTitle>
          <div className="mt-1 text-[12px] text-muted-foreground">
            {team ? `${team.name} team` : 'No primary team assigned'}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {days.map((day) => {
            const plan = planForDay(day)
            const isToday = isoDate(day) === isoDate(new Date())
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  'rounded-lg border p-3 min-h-[92px]',
                  isToday ? 'border-primary/40 bg-primary/5' : 'border-border/70'
                )}
              >
                <div className="text-[11px] font-semibold text-muted-foreground uppercase">
                  {format(day, 'EEE')}
                </div>
                <div className="mt-1 text-[18px] font-semibold tabular-nums">
                  {format(day, 'd')}
                </div>
                <span className={cn('mt-3 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset', plan.className)}>
                  {plan.label}
                </span>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function EmployeeQuickActionsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <LeaveFormDialog
            trigger={
              <Button className="w-full justify-start">
                <Plus className="h-4 w-4" />
                Apply Leave
              </Button>
            }
          />
          <CompoffRequestDialog
            trigger={
              <Button variant="outline" className="w-full justify-start">
                <Sparkles className="h-4 w-4" />
                Apply Comp-off
              </Button>
            }
          />
          <Link href="/calendar" className="block">
            <Button variant="outline" className="w-full justify-start">
              <CalendarDays className="h-4 w-4" />
              Calendar
            </Button>
          </Link>
          <Link href="/org" className="block">
            <Button variant="outline" className="w-full justify-start">
              <Network className="h-4 w-4" />
              Org Tree
            </Button>
          </Link>
          <Button variant="outline" className="w-full justify-start" disabled>
            <Laptop className="h-4 w-4" />
            Device With Me
            <span className="ml-auto text-[11px]">V2</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function DailyTeamOverviewCard({ data }: { data: DashboardData }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Daily Team Overview</CardTitle>
          <div className="mt-1 text-[12px] text-muted-foreground">
            Leave, WFH, birthdays, and work anniversaries for today
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="leave" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="leave">Leave/WFH</TabsTrigger>
            <TabsTrigger value="birthday">Birthday</TabsTrigger>
            <TabsTrigger value="anniversary">Anniversary</TabsTrigger>
          </TabsList>
          <TabsContent value="leave" className="mt-4">
            <TeamLeavesTodayList leaves={data.teamLeavesToday} />
          </TabsContent>
          <TabsContent value="birthday" className="mt-4">
            <EmptyDailyState
              icon={Cake}
              title="No birthday data"
              detail="Birth dates are not available in employee profiles yet."
            />
          </TabsContent>
          <TabsContent value="anniversary" className="mt-4">
            {data.workAnniversariesToday.length === 0 ? (
              <EmptyDailyState
                icon={BriefcaseBusiness}
                title="No work anniversaries today"
                detail="Team anniversaries will appear here when the joining date matches today."
              />
            ) : (
              <div className="space-y-3">
                {data.workAnniversariesToday.map((item) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <Avatar name={item.full_name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-medium truncate">{item.full_name}</div>
                      <div className="text-[11.5px] text-muted-foreground truncate">
                        {item.designation ?? 'Team member'}
                      </div>
                    </div>
                    <Badge variant="success">{item.years} yr</Badge>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

function TeamLeavesTodayList({ leaves }: { leaves: DashboardData['teamLeavesToday'] }) {
  if (leaves.length === 0) {
    return (
      <EmptyDailyState
        icon={CheckCircleIcon}
        title="No one is away today"
        detail="Your team has no active Leave or WFH entries today."
      />
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {leaves.map((leave) => (
        <div key={leave.id} className="flex items-center gap-3 rounded-lg border p-3">
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
    </div>
  )
}

function CheckCircleIcon({ className }: { className?: string }) {
  return <CheckCircle2 className={className} />
}

function EmptyDailyState({
  icon: Icon,
  title,
  detail,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  detail: string
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-dashed p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-1 text-[12px] text-muted-foreground">{detail}</div>
      </div>
    </div>
  )
}

function MyTeamReferenceCard({
  currentUserId,
  data,
}: {
  currentUserId: string
  data: DashboardData
}) {
  const team = getPrimaryTeam(data)

  return (
    <Card className="xl:sticky xl:top-5">
      <CardHeader>
        <div>
          <CardTitle>My Team</CardTitle>
          <div className="mt-1 text-[12px] text-muted-foreground">
            {team ? team.name : 'No team assigned'}
          </div>
        </div>
        <UsersRound className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {!team ? (
          <p className="text-sm text-muted-foreground">
            Ask HR to assign your primary team.
          </p>
        ) : (
          <div className="space-y-5">
            <div>
              <div className="text-[11px] font-semibold uppercase text-muted-foreground">
                Team Lead
              </div>
              <div className="mt-2 rounded-lg border p-3 text-sm">
                {team.team_lead_name ?? 'Not assigned'}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-semibold uppercase text-muted-foreground">
                  Team Members
                </div>
                <Badge variant="muted">{team.members.length}</Badge>
              </div>
              <div className="mt-2 space-y-3">
                {team.members.slice(0, 10).map((member) => (
                  <div key={member.id} className="flex items-center gap-3">
                    <Avatar name={member.full_name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium truncate">
                        {member.full_name}
                        {member.id === currentUserId && (
                          <span className="ml-1 text-[11px] text-muted-foreground">(You)</span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {member.designation ?? member.role.replace('_', ' ')}
                      </div>
                    </div>
                  </div>
                ))}
                {team.members.length > 10 && (
                  <div className="text-[12px] text-muted-foreground">
                    +{team.members.length - 10} more
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
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
                  {formatDays(remaining)}
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  of {formatDays(allocated)} days
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

function PendingLeaveApprovalsCard({
  leaves,
}: {
  leaves: DashboardData['pendingLeaveApprovalsForMe']
}) {
  const router = useRouter()
  const { pushToast } = useStore()
  const [isPending, startTransition] = useTransition()

  function decide(
    leave: DashboardData['pendingLeaveApprovalsForMe'][number],
    decision: 'approve' | 'reject'
  ) {
    startTransition(async () => {
      try {
        const isDeletionRequest = leave.status === 'delete_requested'
        if (decision === 'approve' && isDeletionRequest) {
          await approveLeaveDeletion(leave.id)
          pushToast({ title: 'Leave deletion approved', variant: 'success' })
        } else if (decision === 'reject' && isDeletionRequest) {
          await rejectLeaveDeletion(leave.id)
          pushToast({ title: 'Leave deletion rejected', variant: 'info' })
        } else if (decision === 'approve') {
          await approveLeave(leave.id)
          pushToast({ title: 'Leave approved', variant: 'success' })
        } else {
          await rejectLeave(leave.id)
          pushToast({ title: 'Leave rejected', variant: 'info' })
        }
        router.refresh()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to update leave'
        pushToast({ title: 'Error', body: msg, variant: 'error' })
      }
    })
  }

  const groups = Array.from(
    leaves.reduce((map, leave) => {
      const key = leave.request_id ?? leave.id
      const group = map.get(key)
      if (group) {
        group.leaves.push(leave)
      } else {
        map.set(key, { id: key, leaves: [leave] })
      }
      return map
    }, new Map<string, { id: string; leaves: DashboardData['pendingLeaveApprovalsForMe'] }>())
  ).map(([, group]) => ({
    ...group,
    leaves: group.leaves.sort((a, b) => a.start_date.localeCompare(b.start_date)),
  }))

  return (
    <Card className="border-amber-200 bg-amber-50/50 lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-amber-900">Leave Approvals</CardTitle>
        <Badge variant="warning">{groups.length}</Badge>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {groups.slice(0, 4).map((group) => {
            const leave = group.leaves[0]
            const isDeletionRequest = leave.status === 'delete_requested'
            return (
              <div
                key={group.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-white/70 p-3"
              >
                <Avatar name={leave.user_full_name} size="sm" />
                <div className="min-w-[180px] flex-1">
                  <div className="text-[13.5px] font-semibold text-amber-950">
                    {leave.user_full_name}
                  </div>
                  <div className="mt-0.5 text-[12px] text-amber-800">
                    {isDeletionRequest ? 'Delete approved leave' : 'Approve leave'} ·{' '}
                    {group.leaves.length} day{group.leaves.length !== 1 ? 's' : ''}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {group.leaves.slice(0, 5).map((item) => (
                      <span
                        key={item.id}
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset',
                          LEAVE_TYPE_PILL[item.type] ?? 'bg-muted text-muted-foreground ring-border'
                        )}
                      >
                        {format(parseISO(item.start_date), 'MMM d')}: {LEAVE_TYPE_LABELS[item.type] ?? item.type}
                      </span>
                    ))}
                    {group.leaves.length > 5 && (
                      <span className="text-[10.5px] text-amber-800">
                        +{group.leaves.length - 5} more
                      </span>
                    )}
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={() => decide(leave, 'reject')}
                    className="border-rose-200 text-rose-700 hover:bg-rose-50"
                  >
                    Reject
                  </Button>
                  <Button size="sm" disabled={isPending} onClick={() => decide(leave, 'approve')}>
                    {isDeletionRequest ? 'Approve Delete' : 'Approve'}
                  </Button>
                </div>
              </div>
            )
          })}
          {groups.length > 4 && (
            <p className="text-[12px] text-amber-800">
              +{groups.length - 4} more request{groups.length - 4 !== 1 ? 's' : ''} pending.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function PendingApprovalsCard({ count }: { count: number }) {
  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardHeader>
        <CardTitle className="text-amber-900">Pending Compoff</CardTitle>
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
