'use client'

import { Crown, Users, AlertTriangle } from 'lucide-react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import type { OrgNode } from '@/lib/queries/org'
import type { TeamWithMembers } from '@/lib/queries/teams'

const ROLE_COLOR: Record<string, string> = {
  founder: 'bg-violet-100 text-violet-800',
  hr: 'bg-emerald-100 text-emerald-800',
  team_lead: 'bg-blue-100 text-blue-800',
  employee: 'bg-slate-100 text-slate-700',
}

interface Props {
  currentUserId: string
  roots: OrgNode[]
  orphans: OrgNode[]
  teams: TeamWithMembers[]
}

function countNodes(nodes: OrgNode[]): number {
  return nodes.reduce((acc, n) => acc + 1 + countNodes(n.reports), 0)
}

export function OrgClient({ currentUserId, roots, orphans, teams }: Props) {
  const total = countNodes(roots) + countNodes(orphans)

  if (total === 0) {
    return (
      <>
        <Topbar title="Organization" subtitle="" />
        <div className="px-5 lg:px-8 py-12">
          <Card>
            <CardContent className="p-12 text-center text-muted-foreground text-sm">
              No active users yet. Add users in HR Console → Users to see the org chart.
            </CardContent>
          </Card>
        </div>
      </>
    )
  }

  return (
    <>
      <Topbar
        title="Organization"
        subtitle={`${total} ${total === 1 ? 'person' : 'people'} across ${teams.length} ${teams.length === 1 ? 'team' : 'teams'}`}
      />

      <div className="overflow-x-auto px-5 lg:px-8 py-8">
        <div className="flex flex-col items-center gap-6 min-w-fit">
          {roots.map((root) => (
            <OrgNodeView key={root.user.id} node={root} currentUserId={currentUserId} isRoot />
          ))}
        </div>
      </div>

      {orphans.length > 0 && (
        <div className="px-5 lg:px-8 pb-10">
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <div className="flex items-center gap-2 text-amber-900">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-[13px] font-semibold">
                Needs a manager ({orphans.length})
              </span>
            </div>
            <p className="mt-1 text-[12px] text-amber-800">
              These people report to someone who is no longer active. Assign a new
              manager in HR Console → Users so they reconnect to the org.
            </p>
            <div className="mt-4 overflow-x-auto">
              <div className="flex items-start gap-4 min-w-fit">
                {orphans.map((o) => (
                  <OrgNodeView key={o.user.id} node={o} currentUserId={currentUserId} isRoot />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function TeamChips({ node }: { node: OrgNode }) {
  // Show led teams first (managerial scope), then memberships not already shown.
  const ledIds = new Set(node.ledTeams.map((t) => t.id))
  const memberOnly = node.memberTeams.filter((t) => !ledIds.has(t.id))

  if (node.ledTeams.length === 0 && memberOnly.length === 0) return null

  return (
    <div className="mt-2 flex flex-wrap justify-center gap-1">
      {node.ledTeams.map((t) => (
        <span
          key={`lead-${t.id}`}
          className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 ring-1 ring-inset ring-blue-100"
          title={`Manages ${t.name}`}
        >
          <Users className="h-2.5 w-2.5" />
          {t.name}
          {t.solo && <span className="opacity-60">· solo</span>}
        </span>
      ))}
      {memberOnly.map((t) => (
        <span
          key={`mem-${t.id}`}
          className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
          title={`Member of ${t.name}`}
        >
          {t.name}
        </span>
      ))}
    </div>
  )
}

function OrgNodeView({
  node,
  currentUserId,
  isRoot,
}: {
  node: OrgNode
  currentUserId: string
  isRoot?: boolean
}) {
  const isMe = node.user.id === currentUserId
  const isTop = isRoot || node.user.manager_id === null

  return (
    <div className="flex flex-col items-center">
      <div
        className={cn(
          'rounded-xl border bg-card p-3 min-w-[190px] max-w-[210px] text-center shadow-sm',
          isMe && 'ring-2 ring-violet-500',
          isTop && 'border-violet-300'
        )}
      >
        <div className="relative inline-block">
          <Avatar name={node.user.full_name} size="md" />
          {isTop && (
            <Crown className="absolute -top-1 -right-1 h-3.5 w-3.5 text-amber-500 fill-amber-400" />
          )}
        </div>
        <div className="mt-2 text-[13px] font-semibold truncate">
          {node.user.full_name}
          {isMe && <span className="ml-1 text-[11px] text-muted-foreground">(You)</span>}
        </div>
        <div className="text-[11px] text-muted-foreground truncate">
          {node.user.designation || '—'}
        </div>
        <span
          className={cn(
            'inline-block mt-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize',
            ROLE_COLOR[node.user.role] ?? 'bg-slate-100 text-slate-700'
          )}
        >
          {node.user.role.replace('_', ' ')}
        </span>
        <TeamChips node={node} />
        {node.reports.length > 0 && (
          <div className="mt-2 text-[10px] text-muted-foreground">
            {node.reports.length} direct {node.reports.length === 1 ? 'report' : 'reports'}
          </div>
        )}
      </div>

      {node.reports.length > 0 && (
        <>
          <div className="w-px h-5 bg-border" />
          <div
            className={cn(
              'flex items-start gap-4 pt-4 border-t border-border min-w-fit px-2',
              node.reports.length === 1 && 'border-t-0 pt-0'
            )}
          >
            {node.reports.map((r) => (
              <OrgNodeView key={r.user.id} node={r} currentUserId={currentUserId} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
