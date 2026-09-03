'use client'

import { type ReactNode, useState } from 'react'
import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { useCapabilities } from '@/hooks/use-capabilities'
import { cn } from '@/lib/utils'
import type { AuditEntryWithActor } from '@/lib/queries/audit'

type Category = 'Leave' | 'Comp-off' | 'People' | 'Teams' | 'Holidays' | 'System'

const CATEGORY_STYLE: Record<Category, string> = {
  Leave: 'bg-blue-50 text-blue-700 ring-blue-100',
  'Comp-off': 'bg-amber-50 text-amber-700 ring-amber-100',
  People: 'bg-violet-50 text-violet-700 ring-violet-100',
  Teams: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  Holidays: 'bg-rose-50 text-rose-700 ring-rose-100',
  System: 'bg-slate-100 text-slate-600 ring-slate-200',
}

function categoryOf(action: string): Category {
  if (action.startsWith('leave_request') || action.startsWith('leave.')) return 'Leave'
  if (action.startsWith('compoff')) return 'Comp-off'
  if (
    action.startsWith('user') ||
    action.startsWith('profile') ||
    action.startsWith('capability') ||
    action.startsWith('bundle')
  )
    return 'People'
  if (action.startsWith('team')) return 'Teams'
  if (action.startsWith('holiday')) return 'Holidays'
  return 'System'
}

function B({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-foreground">{children}</span>
}

// Turn a raw audit row into a plain-English sentence. `A` is the actor, `S` is
// the subject (whoever the action is about); isSelf means the actor did it to
// their own record.
function describe(e: AuditEntryWithActor): ReactNode {
  const A = <B>{e.actor_full_name}</B>
  const S = <B>{e.subject_full_name ?? 'an employee'}</B>
  const isSelf = Boolean(e.subject_user_id) && e.subject_user_id === e.actor_id

  switch (e.action) {
    // Leave
    case 'leave_request.create':
      return <>{A} applied for leave</>
    case 'leave_request.create_for_user':
    case 'leave.create_on_behalf':
      return <>{A} added leave for {S}</>
    case 'leave_request.approve':
    case 'leave.approve':
      return isSelf ? <>{A} auto-approved their own leave</> : <>{A} approved {S}&rsquo;s leave</>
    case 'leave_request.reject':
    case 'leave.reject':
      return <>{A} rejected {S}&rsquo;s leave</>
    case 'leave.delete':
      return isSelf ? <>{A} deleted their leave</> : <>{A} deleted {S}&rsquo;s leave</>
    case 'leave.delete_request':
      return <>{A} requested to delete their leave</>
    case 'leave.delete_approve':
      return <>{A} approved the deletion of {S}&rsquo;s leave</>
    case 'leave.delete_reject':
      return <>{A} rejected the deletion of {S}&rsquo;s leave</>
    case 'leave.import_backlog':
      return <>{A} imported backlog leave records</>

    // Comp-off
    case 'compoff.request':
    case 'compoff.request_plan':
      return <>{A} requested comp-off</>
    case 'compoff.grant_for_user':
      return <>{A} granted comp-off to {S}</>
    case 'compoff.import_csv':
      return <>{A} bulk-granted comp-off from a CSV</>
    case 'compoff.approved':
      return isSelf ? <>{A} auto-approved their own comp-off</> : <>{A} approved {S}&rsquo;s comp-off</>
    case 'compoff.rejected':
      return <>{A} rejected {S}&rsquo;s comp-off</>
    case 'compoff.remove':
      return <>{A} removed {S}&rsquo;s comp-off</>

    // People
    case 'user.create':
      return <>{A} added {S} as a user</>
    case 'user.update':
      return isSelf ? <>{A} updated their details</> : <>{A} updated {S}&rsquo;s details</>
    case 'user.deactivate':
      return <>{A} deactivated {S}</>
    case 'user.reactivate':
      return <>{A} reactivated {S}</>
    case 'user.photo_update':
      return isSelf ? <>{A} updated their photo</> : <>{A} updated {S}&rsquo;s photo</>
    case 'user.photo_remove':
      return isSelf ? <>{A} removed their photo</> : <>{A} removed {S}&rsquo;s photo</>
    case 'user.slack_id_update':
      return <>{A} updated {S}&rsquo;s Slack ID</>
    case 'profile.update':
      return <>{A} updated their profile</>
    case 'user.import':
      return <>{A} imported users from a CSV</>
    case 'capability.grant':
      return <>{A} granted a permission to {S}</>
    case 'capability.revoke':
      return <>{A} revoked a permission from {S}</>
    case 'bundle.apply':
      return <>{A} changed {S}&rsquo;s role permissions</>

    // Teams
    case 'team.create':
      return <>{A} created a team</>
    case 'team.update':
      return <>{A} updated a team</>
    case 'team.delete':
      return <>{A} deleted a team</>
    case 'team.photo_update':
      return <>{A} updated a team&rsquo;s photo</>
    case 'team_member.add':
      return <>{A} added a team member</>
    case 'team_member.remove':
      return <>{A} removed a team member</>

    // Holidays
    case 'holiday.create':
      return <>{A} added a holiday</>
    case 'holiday.update':
      return <>{A} updated a holiday</>
    case 'holiday.delete':
      return <>{A} deleted a holiday</>
    case 'holiday.import':
      return <>{A} imported holidays</>

    // Leave types
    case 'leave_type.create':
      return <>{A} added a leave type</>
    case 'leave_type.update':
      return <>{A} updated a leave type</>
    case 'leave_type.delete':
      return <>{A} deleted a leave type</>

    // System / balances
    case 'balance.upsert':
    case 'balance.apply_quotas':
      return <>{A} adjusted leave balances</>
    case 'annual_reset.run':
      return <>{A} ran the annual leave reset</>
    case 'fiscal_year.delete':
      return <>{A} deleted a fiscal year</>
    case 'slack.setting_update':
      return <>{A} changed a Slack setting</>
    case 'slack.sync_ids':
      return <>{A} synced Slack member IDs</>

    default:
      return (
        <>
          {A} {e.action.replace(/[._]/g, ' ')}
          {e.subject_full_name ? <> for {S}</> : null}
        </>
      )
  }
}

// Plain text for search (names + action + note).
function searchText(e: AuditEntryWithActor): string {
  return [e.actor_full_name, e.subject_full_name ?? '', e.action, e.entity_type, e.note ?? '']
    .join(' ')
    .toLowerCase()
}

interface Props {
  entries: AuditEntryWithActor[]
}

export function AuditClient({ entries }: Props) {
  const { can } = useCapabilities()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())

  if (!can.viewAuditLog()) {
    return (
      <div className="p-12 text-center text-muted-foreground">
        Audit Log is available to HR and Founders.
      </div>
    )
  }

  const q = search.trim().toLowerCase()
  const rows = q ? entries.filter((e) => searchText(e).includes(q)) : entries

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  return (
    <>
      <Topbar title="Audit Log" subtitle="Who did what, and when, across Orbit" />
      <div className="px-5 lg:px-8 py-5 space-y-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by person, action, or note…"
            className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <Card>
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                {search ? 'No entries match your search.' : 'No audit log entries yet.'}
              </div>
            ) : (
              <ul className="divide-y">
                {rows.map((row) => {
                  const isOpen = open.has(row.id)
                  const category = categoryOf(row.action)
                  const when = parseISO(row.created_at)
                  return (
                    <li key={row.id}>
                      <button
                        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
                        onClick={() => toggle(row.id)}
                      >
                        <Avatar name={row.actor_full_name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] leading-snug">{describe(row)}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                'inline-flex rounded-full px-2 py-0.5 text-[10.5px] font-medium ring-1 ring-inset',
                                CATEGORY_STYLE[category]
                              )}
                            >
                              {category}
                            </span>
                            <span
                              className="text-[11.5px] text-muted-foreground"
                              title={format(when, 'EEE, MMM d, yyyy · h:mm a')}
                            >
                              {formatDistanceToNow(when, { addSuffix: true })}
                            </span>
                            {row.note && (
                              <span className="truncate text-[11.5px] text-muted-foreground/80">
                                · {row.note}
                              </span>
                            )}
                          </div>
                        </div>
                        {isOpen ? (
                          <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                      </button>
                      {isOpen && (
                        <div className="space-y-2 px-4 pb-4 pl-[60px]">
                          <div className="text-[11.5px] text-muted-foreground">
                            <span className="font-mono">{row.action}</span> on {row.entity_type} ·{' '}
                            {format(when, 'MMM d, yyyy · h:mm:ss a')}
                          </div>
                          {row.diff != null && (
                            <pre className="overflow-x-auto rounded-lg bg-slate-950 p-3 font-mono text-[12px] text-slate-100">
                              {JSON.stringify(row.diff, null, 2)}
                            </pre>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
