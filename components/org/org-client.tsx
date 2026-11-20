'use client'

import { useState, useRef, useEffect, type ReactNode } from 'react'
import { Crown, Users, AlertTriangle, ChevronRight, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
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
  // Mobile list: which subtrees are collapsed (default: all expanded).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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

      {/* Phone: indented, collapsible list (the node-tree doesn't fit at 375px) */}
      <div className="sm:hidden px-4 py-4 space-y-4">
        <div className="overflow-hidden rounded-xl border bg-card">
          {roots.map((root) => (
            <OrgListRow
              key={root.user.id}
              node={root}
              depth={0}
              currentUserId={currentUserId}
              collapsed={collapsed}
              toggle={toggle}
              isRoot
            />
          ))}
        </div>
        {orphans.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
            <div className="flex items-center gap-2 text-amber-900">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-[13px] font-semibold">Needs a manager ({orphans.length})</span>
            </div>
            <div className="mt-2 overflow-hidden rounded-lg border bg-card">
              {orphans.map((o) => (
                <OrgListRow
                  key={o.user.id}
                  node={o}
                  depth={0}
                  currentUserId={currentUserId}
                  collapsed={collapsed}
                  toggle={toggle}
                  isRoot
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tablet / desktop: FigJam-style pan + zoom canvas */}
      <div className="hidden sm:block">
        <OrgCanvas footer={orphans.length > 0 ? <OrphansPanel orphans={orphans} /> : undefined}>
          <div className="flex flex-col items-center gap-10 p-12">
            {roots.map((root) => (
              <OrgNodeView key={root.user.id} node={root} currentUserId={currentUserId} isRoot />
            ))}
          </div>
        </OrgCanvas>
      </div>
    </>
  )
}

/**
 * Lightweight pan + zoom canvas (no external lib). Drag or scroll to pan,
 * ⌘/Ctrl + scroll to zoom toward the cursor, plus on-screen controls. The tree
 * is rendered into a single transformed layer, so it stays crisp at any zoom.
 */
function OrgCanvas({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 })
  const viewRef = useRef(view)
  viewRef.current = view
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  const MIN = 0.2
  const MAX = 2.5
  const clamp = (s: number) => Math.min(MAX, Math.max(MIN, s))

  function fit() {
    const c = containerRef.current
    const content = contentRef.current
    if (!c || !content) return
    const cw = c.clientWidth
    const ch = c.clientHeight
    const ww = content.scrollWidth
    const wh = content.scrollHeight
    if (!ww || !wh) return
    const scale = clamp(Math.min((cw - 32) / ww, (ch - 32) / wh, 1))
    setView({ scale, tx: (cw - ww * scale) / 2, ty: Math.max(24, (ch - wh * scale) / 2) })
  }

  function zoomAt(px: number, py: number, factor: number) {
    const { scale, tx, ty } = viewRef.current
    const next = clamp(scale * factor)
    if (next === scale) return
    const ratio = next / scale
    setView({ scale: next, tx: px - (px - tx) * ratio, ty: py - (py - ty) * ratio })
  }

  function zoomFromCenter(factor: number) {
    const c = containerRef.current
    if (!c) return
    zoomAt(c.clientWidth / 2, c.clientHeight / 2, factor)
  }

  // Fit on mount and whenever the viewport resizes.
  useEffect(() => {
    const id = requestAnimationFrame(fit)
    window.addEventListener('resize', fit)
    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener('resize', fit)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Native non-passive wheel listener so we can preventDefault (React's onWheel
  // is passive and can't stop the page from scrolling).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) {
        zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.12 : 0.89)
      } else {
        const dx = e.deltaX
        const dy = e.deltaY
        setView((v) => ({ ...v, tx: v.tx - dx, ty: v.ty - dy }))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return
    containerRef.current?.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty }
    setDragging(true)
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current
    if (!d) return
    setView((v) => ({ ...v, tx: d.tx + (e.clientX - d.x), ty: d.ty + (e.clientY - d.y) }))
  }
  function endDrag() {
    drag.current = null
    setDragging(false)
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      className={cn(
        'relative h-[calc(100vh-4rem)] w-full select-none overflow-hidden border-t bg-muted/20',
        dragging ? 'cursor-grabbing' : 'cursor-grab'
      )}
      style={{
        backgroundImage:
          'radial-gradient(circle, rgb(148 163 184 / 0.25) 1px, transparent 1px)',
        backgroundSize: '22px 22px',
      }}
    >
      <div
        ref={contentRef}
        className="absolute left-0 top-0 origin-top-left"
        style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`, willChange: 'transform' }}
      >
        {children}
      </div>

      <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-background/70 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur-sm">
        Drag to move · scroll to pan · ⌘/Ctrl + scroll to zoom
      </div>

      {footer && <div className="absolute bottom-4 left-4 max-w-sm">{footer}</div>}

      <div className="absolute bottom-4 right-4 flex items-center gap-0.5 rounded-lg border bg-background/95 p-1 shadow-sm backdrop-blur-sm">
        <button
          type="button"
          onClick={() => zoomFromCenter(0.89)}
          aria-label="Zoom out"
          className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="w-12 text-center text-[12px] font-medium tabular-nums">
          {Math.round(view.scale * 100)}%
        </span>
        <button
          type="button"
          onClick={() => zoomFromCenter(1.12)}
          aria-label="Zoom in"
          className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={fit}
          className="ml-1 inline-flex h-8 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-muted-foreground hover:bg-muted"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          Fit
        </button>
      </div>
    </div>
  )
}

function OrphansPanel({ orphans }: { orphans: OrgNode[] }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/95 p-3 shadow-sm backdrop-blur-sm">
      <div className="flex items-center gap-2 text-amber-900">
        <AlertTriangle className="h-4 w-4" />
        <span className="text-[13px] font-semibold">Needs a manager ({orphans.length})</span>
      </div>
      <p className="mt-1 text-[11.5px] text-amber-800">
        Reports to an inactive manager. Reassign in HR Console → Users.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {orphans.map((o) => (
          <span
            key={o.user.id}
            className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-amber-900 ring-1 ring-inset ring-amber-200"
          >
            {o.user.full_name}
          </span>
        ))}
      </div>
    </div>
  )
}

function OrgListRow({
  node,
  depth,
  currentUserId,
  collapsed,
  toggle,
  isRoot,
}: {
  node: OrgNode
  depth: number
  currentUserId: string
  collapsed: Set<string>
  toggle: (id: string) => void
  isRoot?: boolean
}) {
  const isMe = node.user.id === currentUserId
  const isTop = isRoot || node.user.manager_id === null
  const hasReports = node.reports.length > 0
  const isOpen = hasReports && !collapsed.has(node.user.id)

  return (
    <>
      <div
        className={cn('flex items-center gap-2 border-b px-3 py-2.5 last:border-b-0', isMe && 'bg-violet-50')}
        style={{ paddingLeft: 12 + depth * 18 }}
      >
        {hasReports ? (
          <button
            type="button"
            onClick={() => toggle(node.user.id)}
            aria-label={isOpen ? 'Collapse' : 'Expand'}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted"
          >
            <ChevronRight className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-90')} />
          </button>
        ) : (
          <span className="inline-block w-6 shrink-0" />
        )}

        <div className="relative shrink-0">
          <Avatar name={node.user.full_name} src={node.user.photo_url} size="sm" />
          {isTop && (
            <Crown className="absolute -top-1 -right-1 h-3 w-3 text-amber-500 fill-amber-400" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-semibold">{node.user.full_name}</span>
            {isMe && <span className="text-[11px] text-muted-foreground">(You)</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-medium capitalize',
                ROLE_COLOR[node.user.role] ?? 'bg-slate-100 text-slate-700'
              )}
            >
              {node.user.role.replace('_', ' ')}
            </span>
            <span className="truncate text-[11px] text-muted-foreground">
              {node.user.designation || '—'}
            </span>
          </div>
        </div>

        {hasReports && (
          <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
            {node.reports.length}
          </span>
        )}
      </div>

      {isOpen &&
        node.reports.map((r) => (
          <OrgListRow
            key={r.user.id}
            node={r}
            depth={depth + 1}
            currentUserId={currentUserId}
            collapsed={collapsed}
            toggle={toggle}
          />
        ))}
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
          <Avatar name={node.user.full_name} src={node.user.photo_url} size="md" />
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
