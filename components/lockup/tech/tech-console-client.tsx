'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowRightLeft,
  Boxes,
  CalendarClock,
  CheckCircle2,
  Clapperboard,
  Clock,
  Flag,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Wrench,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useStore } from '@/lib/store'
import type {
  ConsoleHoldRow,
  EquipmentItemRow,
  KitRow,
  OverdueGearRow,
  PendingApprovalRow,
  ShootSummary,
  TechConsoleData,
} from '@/lib/queries/lockup'
import {
  approveReservation,
  createLocation,
  createStudio,
  deleteLocation,
  deleteStudio,
  receiveFromRepair,
  rejectReservation,
  renameLocation,
  renameStudio,
  resolveIssue,
} from '@/lib/actions/lockup'
import type { LockupSlackSettings } from '@/lib/slack-lockup'
import { CodeChip, fmtDay, fmtDayTime, fmtShootWindow } from '../item-bits'
import { DashboardTab } from './dashboard-tab'
import { InventoryTable } from './inventory-table'
import { DevicesTable } from './devices-table'
import { OverdueTable } from './overdue-table'
import { HoldsTable } from './holds-table'
import { ShootsTable } from './shoots-table'
import { LockupSlackTab } from './slack-tab'
import { LockupSettingsTab } from './settings-tab'

function StatCard({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: typeof Boxes
  value: number
  label: string
  tone: 'default' | 'blue' | 'red' | 'amber'
}) {
  const toneClass =
    tone === 'blue'
      ? 'text-blue-600'
      : tone === 'red'
        ? 'text-rose-600'
        : tone === 'amber'
          ? 'text-amber-600'
          : 'text-slate-700'
  return (
    <div className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-2.5">
      <Icon className={`h-4 w-4 shrink-0 ${toneClass}`} />
      <span className="text-[17px] font-bold leading-none">{value}</span>
      <span className="min-w-0 truncate text-[12.5px] text-muted-foreground">{label}</span>
    </div>
  )
}

const ACTIVITY_ICONS = {
  checkout: CheckCircle2,
  return: CheckCircle2,
  transfer: ArrowRightLeft,
  repair_sent: Wrench,
  repair_back: Wrench,
  issue_open: Flag,
  issue_resolved: Flag,
  reserved: Clock,
  reservation_cancelled: Trash2,
  reservation_expired: Clock,
  reservation_rejected: AlertTriangle,
} as const

export function TechConsoleClient({
  data,
  items,
  people,
  kits,
  approvals,
  overdue,
  holds,
  shoots,
  qrBaseUrl,
  slackSettings,
  initialTab,
}: {
  data: TechConsoleData
  items: EquipmentItemRow[]
  people: { id: string; full_name: string }[]
  kits: KitRow[]
  approvals: PendingApprovalRow[]
  overdue: OverdueGearRow[]
  holds: ConsoleHoldRow[]
  shoots: ShootSummary[]
  qrBaseUrl: string | null
  slackSettings: LockupSlackSettings
  initialTab?: string
}) {
  const router = useRouter()
  const { pushToast } = useStore()
  const validTabs = [
    'dashboard',
    'inventory',
    'devices',
    'shoots',
    'holds',
    'approvals',
    'overdue',
    'activity',
    'repairs',
    'issues',
    'locations',
    'settings',
    'slack',
  ]
  const liveShootCount = shoots.filter((s) => s.status !== 'done').length
  const [tab, setTab] = useState(
    initialTab && validTabs.includes(initialTab) ? initialTab : 'dashboard'
  )
  const pooledItems = items.filter((i) => i.kind !== 'assigned')
  const deviceItems = items.filter((i) => i.kind === 'assigned')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [newLocation, setNewLocation] = useState('')
  const [newStudio, setNewStudio] = useState('')

  const openIssues = data.issues.filter((i) => i.status === 'open')
  const openRepairs = data.repairs.filter((r) => !r.returned_at)
  const closedRepairs = data.repairs.filter((r) => r.returned_at)

  async function run(id: string, fn: () => Promise<void>, successTitle: string) {
    setBusyId(id)
    try {
      await fn()
      pushToast({ title: successTitle, variant: 'success' })
      router.refresh()
    } catch (err) {
      pushToast({
        title: err instanceof Error ? err.message : 'Action failed',
        variant: 'error',
      })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <PageHeader title="Tech Console" subtitle="Manage inventory, repairs and issues." />
      <div className="px-5 lg:px-8 py-5 space-y-5">
        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={Boxes} value={data.stats.items} label="Items" tone="default" />
          <StatCard icon={Clock} value={data.stats.out_now} label="Out now" tone="blue" />
          <button type="button" onClick={() => setTab('overdue')} className="w-full text-left">
            <StatCard icon={AlertTriangle} value={data.stats.overdue} label="Overdue" tone="red" />
          </button>
          <StatCard icon={Wrench} value={data.stats.in_repair} label="In repair" tone="amber" />
          <button type="button" onClick={() => setTab('holds')} className="w-full text-left">
            <StatCard icon={CalendarClock} value={holds.length} label="On hold" tone="blue" />
          </button>
          <button type="button" onClick={() => setTab('shoots')} className="w-full text-left">
            <StatCard icon={Clapperboard} value={liveShootCount} label="Upcoming shoots" tone="default" />
          </button>
          <button type="button" onClick={() => setTab('approvals')} className="w-full text-left">
            <StatCard
              icon={CheckCircle2}
              value={approvals.length}
              label="Pending approvals"
              tone="amber"
            />
          </button>
          <button type="button" onClick={() => setTab('issues')} className="w-full text-left">
            <StatCard icon={Flag} value={data.stats.open_issues} label="Open issues" tone="red" />
          </button>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="devices">Devices</TabsTrigger>
            <TabsTrigger value="shoots" className="gap-1.5">
              Shoots
              {liveShootCount > 0 && (
                <Badge variant="muted" className="px-1.5 py-0 text-[10px]">
                  {liveShootCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="holds" className="gap-1.5">
              Holds
              {holds.length > 0 && (
                <Badge variant="info" className="px-1.5 py-0 text-[10px]">
                  {holds.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="approvals" className="gap-1.5">
              Approvals
              {approvals.length > 0 && (
                <Badge variant="warning" className="px-1.5 py-0 text-[10px]">
                  {approvals.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="overdue" className="gap-1.5">
              Overdue
              {overdue.length > 0 && (
                <Badge variant="danger" className="px-1.5 py-0 text-[10px]">
                  {overdue.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="repairs" className="gap-1.5">
              Repairs
              {openRepairs.length > 0 && (
                <Badge variant="warning" className="px-1.5 py-0 text-[10px]">
                  {openRepairs.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="issues" className="gap-1.5">
              Issues
              {openIssues.length > 0 && (
                <Badge variant="danger" className="px-1.5 py-0 text-[10px]">
                  {openIssues.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="locations">Places</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="slack">Slack</TabsTrigger>
          </TabsList>

          {/* -------- Dashboard (landing: quick-add + recent activity) -------- */}
          <TabsContent value="dashboard" className="mt-4">
            <DashboardTab data={data} people={people} onNavigate={setTab} />
          </TabsContent>

          {/* -------- Inventory (pooled gear) -------- */}
          <TabsContent value="inventory" className="mt-4">
            <InventoryTable
              items={pooledItems}
              kits={kits}
              locations={data.locations}
              privateByItem={data.privateByItem}
              qrBaseUrl={qrBaseUrl}
            />
          </TabsContent>

          {/* -------- Devices (assigned) -------- */}
          <TabsContent value="devices" className="mt-4">
            <DevicesTable
              devices={deviceItems}
              locations={data.locations}
              privateByItem={data.privateByItem}
              people={people}
            />
          </TabsContent>

          {/* -------- Shoots (oversight, links to detail pages) -------- */}
          <TabsContent value="shoots" className="mt-4">
            <ShootsTable shoots={shoots} />
          </TabsContent>

          {/* -------- Holds (all active + pending reservations) -------- */}
          <TabsContent value="holds" className="mt-4">
            <HoldsTable rows={holds} />
          </TabsContent>

          {/* -------- Approvals (pending flagged-item requests) -------- */}
          <TabsContent value="approvals" className="mt-4 space-y-2">
            {approvals.length === 0 && (
              <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center text-[13px] text-muted-foreground">
                Nothing awaiting approval. Requests for approval-flagged items land here.
              </div>
            )}
            {approvals.map((a) => (
              <div
                key={a.reservation_id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
              >
                <Clock className="h-4 w-4 shrink-0 text-amber-600" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[14px] font-semibold">
                    {a.item.name} <CodeChip code={a.item.code} />
                  </div>
                  <div className="text-[12.5px] text-muted-foreground">
                    {a.reserved_by_name} wants it for{' '}
                    {a.shoot
                      ? `${a.shoot.name} · ${fmtShootWindow(a.shoot.starts_at, a.shoot.ends_at)}`
                      : a.window
                        ? `a personal hold · ${fmtShootWindow(a.window.starts_at, a.window.ends_at)}`
                        : 'a personal hold'}{' '}
                    · asked {fmtDayTime(a.created_at)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === a.reservation_id}
                    onClick={() => {
                      const reason =
                        window.prompt(`Why decline ${a.item.name}? (optional)`) ??
                        undefined
                      run(
                        a.reservation_id,
                        () => rejectReservation({ reservationId: a.reservation_id, reason }),
                        'Request declined'
                      )
                    }}
                  >
                    Decline
                  </Button>
                  <Button
                    size="sm"
                    disabled={busyId === a.reservation_id}
                    onClick={() =>
                      run(
                        a.reservation_id,
                        () => approveReservation(a.reservation_id),
                        `${a.item.name} approved`
                      )
                    }
                  >
                    {busyId === a.reservation_id && <Loader2 className="h-4 w-4 animate-spin" />}
                    Approve
                  </Button>
                </div>
              </div>
            ))}
          </TabsContent>

          {/* -------- Overdue -------- */}
          <TabsContent value="overdue" className="mt-4">
            <OverdueTable rows={overdue} />
          </TabsContent>

          {/* -------- Kits -------- */}
          {/* -------- Activity -------- */}
          <TabsContent value="activity" className="mt-4">
            <ol className="relative space-y-3 border-l border-border pl-5 ml-2">
              {data.activity.length === 0 && (
                <li className="text-[13px] text-muted-foreground">No activity yet.</li>
              )}
              {data.activity.map((e, i) => {
                const Icon = ACTIVITY_ICONS[e.kind]
                return (
                  <li key={i} className="text-[13px]">
                    <span className="absolute -left-[9px] mt-0.5 grid h-[18px] w-[18px] place-items-center rounded-full bg-background border border-border">
                      <Icon className="h-2.5 w-2.5 text-muted-foreground" />
                    </span>
                    <span className="font-medium">{e.actor_name}</span> {e.detail}{' '}
                    <span className="font-medium">{e.item_name}</span>{' '}
                    <CodeChip code={e.item_code} />
                    <div className="text-[11.5px] text-muted-foreground">{fmtDayTime(e.at)}</div>
                  </li>
                )
              })}
            </ol>
          </TabsContent>

          {/* -------- Repairs -------- */}
          <TabsContent value="repairs" className="mt-4 space-y-4">
            {openRepairs.length === 0 && (
              <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center text-[13px] text-muted-foreground">
                Nothing in repair. Send an item from the Inventory tab (wrench icon).
              </div>
            )}
            <ul className="space-y-2">
              {openRepairs.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
                >
                  <Wrench className="h-4 w-4 text-amber-600 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[14px] font-semibold">
                      {r.item_name} <CodeChip code={r.item_code} />
                    </div>
                    <div className="text-[12.5px] text-muted-foreground">
                      Sent {fmtDay(r.sent_at)} by {r.sent_by_name}
                      {r.vendor && <> · {r.vendor}</>}
                      {r.expected_back_on ? (
                        <> · expected back {fmtDay(r.expected_back_on)}</>
                      ) : (
                        <> · no expected date</>
                      )}
                      {r.notes && <> · {r.notes}</>}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    disabled={busyId === r.id}
                    onClick={() =>
                      run(r.id, () => receiveFromRepair(r.id), `${r.item_name} is back and available`)
                    }
                  >
                    {busyId === r.id && <Loader2 className="h-4 w-4 animate-spin" />}
                    Mark received
                  </Button>
                </li>
              ))}
            </ul>

            {closedRepairs.length > 0 && (
              <div>
                <div className="pb-2 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Past repairs
                </div>
                <ul className="space-y-1.5">
                  {closedRepairs.slice(0, 15).map((r) => (
                    <li key={r.id} className="text-[12.5px] text-muted-foreground">
                      {r.item_name}: sent {fmtDay(r.sent_at)}, back{' '}
                      {r.returned_at ? fmtDay(r.returned_at) : ''}
                      {r.vendor && <> ({r.vendor})</>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </TabsContent>

          {/* -------- Issues -------- */}
          <TabsContent value="issues" className="mt-4 space-y-2">
            {openIssues.length === 0 && (
              <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center text-[13px] text-muted-foreground">
                No open issues. Problems reported at return or from an item page appear here.
              </div>
            )}
            {openIssues.map((issue) => (
              <div
                key={issue.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
              >
                <Flag className="h-4 w-4 text-rose-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[14px] font-semibold">
                    {issue.item_name} <CodeChip code={issue.item_code} />
                  </div>
                  <div className="text-[13px]">{issue.note}</div>
                  <div className="text-[11.5px] text-muted-foreground">
                    {issue.reported_by_name} · {fmtDayTime(issue.created_at)}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busyId === issue.id}
                  onClick={() => run(issue.id, () => resolveIssue(issue.id), 'Issue resolved')}
                >
                  {busyId === issue.id && <Loader2 className="h-4 w-4 animate-spin" />}
                  Resolve
                </Button>
              </div>
            ))}
          </TabsContent>

          {/* -------- Locations -------- */}
          <TabsContent value="locations" className="mt-4 space-y-3 max-w-lg">
            <ul className="space-y-2">
              {data.locations.map((loc) => (
                <li
                  key={loc.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
                >
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1">
                    <div className="text-[14px] font-semibold">{loc.label}</div>
                    <div className="text-[12px] text-muted-foreground">
                      {loc.item_count} item{loc.item_count === 1 ? '' : 's'} home here
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const label = window.prompt('New name for this location', loc.label)
                      if (label && label.trim() && label !== loc.label) {
                        run(
                          loc.id,
                          () => renameLocation({ locationId: loc.id, label }),
                          'Location renamed'
                        )
                      }
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-rose-600"
                    disabled={loc.item_count > 0 || busyId === loc.id}
                    title={loc.item_count > 0 ? 'Move items out first' : 'Delete'}
                    onClick={() => run(loc.id, () => deleteLocation(loc.id), 'Location deleted')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Input
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                placeholder="New location, e.g. L3 or Drone cabinet"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newLocation.trim()) {
                    run('new-location', () => createLocation(newLocation), 'Location added')
                    setNewLocation('')
                  }
                }}
              />
              <Button
                variant="secondary"
                disabled={!newLocation.trim() || busyId === 'new-location'}
                onClick={() => {
                  run('new-location', () => createLocation(newLocation), 'Location added')
                  setNewLocation('')
                }}
              >
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>

            {/* Studios (bookable via Studio Blocking inside shoots) */}
            <div className="pt-4 space-y-3">
              <div>
                <div className="text-[13.5px] font-semibold">Studios</div>
                <p className="text-[12px] text-muted-foreground">
                  Bookable spaces. People block them inside a shoot; overlapping bookings are
                  refused automatically.
                </p>
              </div>
              <ul className="space-y-2">
                {data.studios.map((studio) => (
                  <li
                    key={studio.id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
                  >
                    <Clapperboard className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1">
                      <div className="text-[14px] font-semibold">{studio.name}</div>
                      <div className="text-[12px] text-muted-foreground">
                        {studio.upcoming_blocks} upcoming booking
                        {studio.upcoming_blocks === 1 ? '' : 's'}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const name = window.prompt('New name for this studio', studio.name)
                        if (name && name.trim() && name !== studio.name) {
                          run(studio.id, () => renameStudio({ studioId: studio.id, name }), 'Studio renamed')
                        }
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-rose-600"
                      disabled={busyId === studio.id}
                      title="Delete (only when it has no bookings)"
                      onClick={() => run(studio.id, () => deleteStudio(studio.id), 'Studio deleted')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
                {data.studios.length === 0 && (
                  <li className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[12.5px] text-muted-foreground">
                    No studios yet. Add one so shoots can block it.
                  </li>
                )}
              </ul>
              <div className="flex gap-2">
                <Input
                  value={newStudio}
                  onChange={(e) => setNewStudio(e.target.value)}
                  placeholder="New studio, e.g. Studio 2"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newStudio.trim()) {
                      run('new-studio', () => createStudio(newStudio), 'Studio added')
                      setNewStudio('')
                    }
                  }}
                />
                <Button
                  variant="secondary"
                  disabled={!newStudio.trim() || busyId === 'new-studio'}
                  onClick={() => {
                    run('new-studio', () => createStudio(newStudio), 'Studio added')
                    setNewStudio('')
                  }}
                >
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* -------- Slack bot controls -------- */}
          <TabsContent value="settings" className="mt-4">
            <LockupSettingsTab settings={slackSettings} people={people} />
          </TabsContent>

          <TabsContent value="slack" className="mt-4">
            <LockupSlackTab settings={slackSettings} />
          </TabsContent>
        </Tabs>
      </div>

    </div>
  )
}
