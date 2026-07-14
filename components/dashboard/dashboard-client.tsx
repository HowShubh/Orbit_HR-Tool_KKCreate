'use client'

import { type ComponentType, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addDays, format, parseISO, startOfWeek } from 'date-fns'
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
import { ApprovalQueueClient } from '@/components/approvals/approval-queue-client'
import { decideCompoff } from '@/lib/actions/compoff'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { currentFiscalYearStart, formatFiscalYear } from '@/lib/date'
import type { AppUser } from '@/lib/auth/get-current-user'
import type { DashboardData } from '@/lib/queries/dashboard'

const FISCAL_YEAR_LABEL = formatFiscalYear(currentFiscalYearStart())

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

function TypePill({ type, label }: { type: string; label?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
        LEAVE_TYPE_PILL[type as LeaveTypePill] ?? 'bg-muted text-muted-foreground ring-border'
      )}
    >
      {label ?? LEAVE_TYPE_LABELS[type] ?? type}
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

// Off (weekly-off) days from the team's `off_days`; falls back to Sunday-only
// when a user has no team. A weekday that is neither office nor off is WFH.
function parseOffDays(pattern?: string | null) {
  const codes = (pattern ?? '')
    .split(',')
    .map((day) => day.trim().toUpperCase())
    .filter(Boolean)
  return new Set(codes.length ? codes : ['SUN'])
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

  // Every role gets the rich personal dashboard. Team leads also see their
  // team's upcoming leaves; HR and founders additionally get the org-wide
  // Daily Org Overview (next 30 days) and an org-scoped leaves view.
  return (
    <PersonalDashboard
      currentUser={currentUser}
      data={data}
      greeting={greeting}
      todayLabel={today}
    />
  )
}

function PersonalDashboard({
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
  // HR (and later founders) see an extra org-wide leaves card; anyone who
  // leads/belongs to a team also gets a "my team" upcoming-leaves card.
  const isOrgWide = currentUser.role === 'hr' || currentUser.role === 'founder'
  const showTeamCard = currentUser.role === 'team_lead' || isOrgWide

  return (
    <>
      <Topbar
        title={`${greeting}, ${currentUser.full_name.split(' ')[0]}`}
        subtitle="Your daily reference for schedule, leave, and team visibility."
      />

      <div className="px-5 lg:px-8 py-5 space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[13px] text-muted-foreground">
            <span className="font-semibold text-foreground">{todayLabel}</span> · FY {FISCAL_YEAR_LABEL}
          </div>
          <Link href="/team" className="text-[12px] text-muted-foreground hover:text-foreground flex items-center gap-1">
            My team <ChevronRight className="h-3 w-3" />
          </Link>
        </div>

        {/* Approvals — shown to anyone who manages someone (regardless of role). */}
        {data.pendingApprovalRequests.length > 0 && (
          <Card className="border-amber-200 bg-amber-50/50">
            <CardHeader>
              <CardTitle className="text-amber-900">Leave Approvals</CardTitle>
              <Badge variant="warning">{data.pendingApprovalRequests.length}</Badge>
            </CardHeader>
            <CardContent>
              <ApprovalQueueClient initialRequests={data.pendingApprovalRequests} />
            </CardContent>
          </Card>
        )}
        {data.pendingApprovalsForMe.length > 0 && (
          <PendingApprovalsCard approvals={data.pendingApprovalsForMe} />
        )}

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
                leaveTypes={data.leaveTypes}
              />
              <EmployeeQuickActionsCard />
            </div>

            {showTeamCard ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <UpcomingMineCard leaves={data.upcomingMine} />
                <UpcomingTeamCard leaves={data.upcomingTeam} />
              </div>
            ) : (
              <UpcomingMineCard leaves={data.upcomingMine} />
            )}

            <DailyTeamOverviewCard data={data} orgWide={isOrgWide} />
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
  const offDays = parseOffDays(team?.off_days)
  const todayCode = DAY_CODE_BY_INDEX[today.getDay()]

  const status = (() => {
    if (leave?.type_category === 'leave' || leave?.type_category === 'compoff_leave') {
      return {
        label: leave.type_name ?? (leave.type === 'compoff_leave' ? 'Comp-off Leave' : 'On Leave'),
        detail: formatDateRange(leave.start_date, leave.end_date),
        icon: CalendarDays,
        className: 'bg-orange-50 text-orange-700 ring-orange-100',
      }
    }
    if (leave?.type_category === 'wfh' || leave?.type_category === 'compoff_wfh') {
      return {
        label: leave.type_name ?? (leave.type === 'compoff_wfh' ? 'Comp-off WFH' : 'Working From Home'),
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
    if (offDays.has(todayCode)) {
      return {
        label: 'Day off',
        detail: 'Weekly off',
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
  const offDays = parseOffDays(team?.off_days)
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
    if (offDays.has(code)) {
      return { label: 'Off', className: 'bg-slate-50 text-slate-600 ring-slate-100' }
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

// Two-line quick-action label: a bold title plus a plain-language nudge.
function QuickActionLabel({ title, hint }: { title: string; hint: string }) {
  return (
    <span className="flex min-w-0 flex-col items-start text-left leading-tight">
      <span className="text-[13px] font-medium">{title}</span>
      <span className="truncate text-[11px] font-normal opacity-70">{hint}</span>
    </span>
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
              <Button className="h-auto w-full justify-start gap-3 py-2.5">
                <Plus className="h-4 w-4 shrink-0" />
                <QuickActionLabel title="Apply Leave" hint="Take leave or work from home" />
              </Button>
            }
          />
          <CompoffRequestDialog
            trigger={
              <Button variant="outline" className="h-auto w-full justify-start gap-3 py-2.5">
                <Sparkles className="h-4 w-4 shrink-0" />
                <QuickActionLabel title="Apply Comp-off" hint="Earn a credit for extra work" />
              </Button>
            }
          />
          <Link href="/calendar" className="block">
            <Button variant="outline" className="h-auto w-full justify-start gap-3 py-2.5">
              <CalendarDays className="h-4 w-4 shrink-0" />
              <QuickActionLabel title="Calendar" hint="See who's away and upcoming holidays" />
            </Button>
          </Link>
          <Link href="/org" className="block">
            <Button variant="outline" className="h-auto w-full justify-start gap-3 py-2.5">
              <Network className="h-4 w-4 shrink-0" />
              <QuickActionLabel title="Org Tree" hint="See who reports to whom" />
            </Button>
          </Link>
          <Link href="/lockup?tab=mine" className="block">
            <Button variant="outline" className="h-auto w-full justify-start gap-3 py-2.5">
              <Laptop className="h-4 w-4 shrink-0" />
              <QuickActionLabel title="Device With Me" hint="Gear checked out to you" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}

function DailyTeamOverviewCard({ data, orgWide = false }: { data: DashboardData; orgWide?: boolean }) {
  // Team view = today, scoped to my team. Org view (HR/founders) = the next 30
  // days across the whole company, so HR can plan ahead.
  const birthdays = orgWide ? data.orgBirthdays30 : data.birthdaysToday
  const anniversaries = orgWide ? data.orgAnniversaries30 : data.workAnniversariesToday

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{orgWide ? 'Daily Org Overview' : 'Daily Team Overview'}</CardTitle>
          <div className="mt-1 text-[12px] text-muted-foreground">
            {orgWide
              ? 'Upcoming Leave, WFH, birthdays, and work anniversaries — next 30 days, company-wide'
              : 'Leave, WFH, birthdays, and work anniversaries for today'}
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
            <TeamLeavesTodayList
              leaves={orgWide ? data.upcomingOrg : data.teamLeavesToday}
              orgWide={orgWide}
            />
          </TabsContent>
          <TabsContent value="birthday" className="mt-4">
            {birthdays.length === 0 ? (
              <EmptyDailyState
                icon={Cake}
                title={orgWide ? 'No birthdays in the next 30 days' : 'No birthdays today'}
                detail={
                  orgWide
                    ? 'Upcoming company birthdays will appear here once a date falls within the next 30 days.'
                    : "Team birthdays appear here when someone's birth date matches today."
                }
              />
            ) : (
              <div className="space-y-3">
                {birthdays.map((item) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <Avatar name={item.full_name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-medium truncate">{item.full_name}</div>
                      <div className="text-[11.5px] text-muted-foreground truncate">
                        {item.designation ?? 'Team member'}
                      </div>
                    </div>
                    <Badge variant="success">🎂 {format(parseISO(item.date_of_birth), 'MMM d')}</Badge>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
          <TabsContent value="anniversary" className="mt-4">
            {anniversaries.length === 0 ? (
              <EmptyDailyState
                icon={BriefcaseBusiness}
                title={orgWide ? 'No work anniversaries in the next 30 days' : 'No work anniversaries today'}
                detail={
                  orgWide
                    ? 'Upcoming work anniversaries will appear here once a joining date falls within the next 30 days.'
                    : 'Team anniversaries will appear here when the joining date matches today.'
                }
              />
            ) : (
              <div className="space-y-3">
                {anniversaries.map((item) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <Avatar name={item.full_name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-medium truncate">{item.full_name}</div>
                      <div className="text-[11.5px] text-muted-foreground truncate">
                        {orgWide
                          ? `${format(parseISO(item.joined_at), 'MMM d')}${item.designation ? ` · ${item.designation}` : ''}`
                          : item.designation ?? 'Team member'}
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

function TeamLeavesTodayList({
  leaves,
  orgWide = false,
}: {
  leaves: DashboardData['teamLeavesToday']
  orgWide?: boolean
}) {
  if (leaves.length === 0) {
    return (
      <EmptyDailyState
        icon={CheckCircleIcon}
        title={orgWide ? 'No upcoming Leave or WFH' : 'No one is away today'}
        detail={
          orgWide
            ? 'No Leave or WFH is scheduled across the company in the next 30 days.'
            : 'Your team has no active Leave or WFH entries today.'
        }
      />
    )
  }

  const shown = orgWide ? leaves.slice(0, 10) : leaves

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {shown.map((leave) => (
          <div key={leave.id} className="flex items-center gap-3 rounded-lg border p-3">
            <Avatar name={leave.user_full_name} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-medium truncate">{leave.user_full_name}</div>
              <div className="text-[11.5px] text-muted-foreground">
                {formatDateRange(leave.start_date, leave.end_date)}
              </div>
            </div>
            <TypePill type={leave.requested_type ?? leave.type} label={leave.type_name} />
          </div>
        ))}
      </div>
      {leaves.length > shown.length && (
        <p className="mt-3 text-[12px] text-muted-foreground">+{leaves.length - shown.length} more</p>
      )}
    </>
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

function MyBalancesCard({
  balances,
  compoffBalances,
  leaveTypes,
}: {
  balances: DashboardData['myBalances']
  compoffBalances: DashboardData['myCompoffBalance']
  leaveTypes: DashboardData['leaveTypes']
}) {
  const allBalances = [...balances, ...compoffBalances]
  const visibleTypes = leaveTypes.filter((type) => type.is_active)

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
          {visibleTypes.map((type) => {
            const bal = allBalances.find((b) => b.type === type.key)
            const allocated = bal?.allocated ?? 0
            const used = bal?.used ?? 0
            // Show the true remaining, even if negative (an over-drawn balance is
            // useful to see). Only the progress bar is clamped to 0-100%.
            const remaining = allocated - used
            const pct = allocated > 0 ? Math.min(100, Math.max(0, (remaining / allocated) * 100)) : 0

            return (
              <div key={type.key} className="rounded-lg border border-border/60 p-3">
                <div className="text-[11px] font-medium text-muted-foreground truncate">
                  {type.name}
                </div>
                <div
                  className={cn(
                    'mt-1 text-[20px] font-semibold tabular-nums',
                    remaining < 0 && 'text-rose-600'
                  )}
                >
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
                <TypePill type={leave.requested_type ?? leave.type} label={leave.type_name} />
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
                <TypePill type={leave.requested_type ?? leave.type} label={leave.type_name} />
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

function PendingApprovalsCard({
  approvals,
}: {
  approvals: DashboardData['pendingApprovalsForMe']
}) {
  const router = useRouter()
  const { pushToast } = useStore()
  const [isPending, startTransition] = useTransition()

  function decide(grantId: string, decision: 'approved' | 'rejected') {
    let reason: string | undefined
    if (decision === 'rejected') {
      const input = window.prompt('Reason for rejection (optional — the employee sees this on Slack):')
      if (input === null) return // cancelled
      reason = input.trim() || undefined
    }
    startTransition(async () => {
      try {
        await decideCompoff(grantId, decision, reason)
        pushToast({
          title: decision === 'approved' ? 'Comp-off approved' : 'Comp-off rejected',
          variant: decision === 'approved' ? 'success' : 'info',
        })
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update comp-off request'
        pushToast({ title: 'Error', body: message, variant: 'error' })
      }
    })
  }

  return (
    <Card className="border-amber-200 bg-amber-50/50 lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-amber-900">Comp-off Approvals</CardTitle>
        <Badge variant="warning">{approvals.length}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {approvals.slice(0, 5).map((approval) => (
          <div
            key={approval.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-white/80 p-3"
          >
            <Avatar name={approval.user_full_name} size="sm" />
            <div className="min-w-[180px] flex-1">
              <div className="text-[13.5px] font-semibold text-foreground">
                {approval.user_full_name}
              </div>
              <div className="text-[11.5px] text-muted-foreground">
                {format(parseISO(approval.work_date), 'MMM d, yyyy')} · {formatDays(approval.amount)} day{approval.amount !== 1 ? 's' : ''}
                {approval.reason ? ` · ${approval.reason}` : ''}
              </div>
            </div>
            <TypePill type={approval.type} />
            <div className="ml-auto flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => decide(approval.id, 'rejected')}
                className="border-rose-200 text-rose-700 hover:bg-rose-50"
              >
                Reject
              </Button>
              <Button
                size="sm"
                disabled={isPending}
                onClick={() => decide(approval.id, 'approved')}
              >
                Approve
              </Button>
            </div>
          </div>
        ))}
        {approvals.length > 5 && (
          <p className="text-[12px] text-amber-800">
            +{approvals.length - 5} more pending comp-off request{approvals.length - 5 !== 1 ? 's' : ''}.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
