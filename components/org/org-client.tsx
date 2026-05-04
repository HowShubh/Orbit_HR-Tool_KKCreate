'use client'

import { Crown } from 'lucide-react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
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
  tree: OrgNode[]
  teams: TeamWithMembers[]
}

export function OrgClient({ currentUserId, tree, teams }: Props) {
  // Count total active users in the tree
  function count(nodes: OrgNode[]): number {
    return nodes.reduce((acc, n) => acc + 1 + count(n.reports), 0)
  }
  const total = count(tree)

  if (tree.length === 0) {
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
          {tree.map((root) => (
            <OrgNodeView key={root.user.id} node={root} currentUserId={currentUserId} isRoot />
          ))}
        </div>
      </div>
    </>
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
  const isFounder = node.user.role === 'founder'

  return (
    <div className="flex flex-col items-center">
      {/* Card */}
      <div
        className={cn(
          'rounded-xl border bg-card p-3 min-w-[180px] max-w-[200px] text-center shadow-sm',
          isMe && 'ring-2 ring-violet-500',
          isFounder && 'border-violet-300'
        )}
      >
        <div className="relative inline-block">
          <Avatar name={node.user.full_name} size="md" />
          {isFounder && (
            <Crown className="absolute -top-1 -right-1 h-3.5 w-3.5 text-amber-500 fill-amber-400" />
          )}
        </div>
        <div className="mt-2 text-[13px] font-semibold truncate">{node.user.full_name}</div>
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
      </div>

      {/* Connector + reports */}
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
