'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { Tables } from '@/lib/supabase/database.types'
import type { LeaveWithUser } from '@/lib/queries/leaves'

const TYPE_PILL: Record<string, string> = {
  wfh: 'bg-blue-100 text-blue-800',
  leave: 'bg-orange-100 text-orange-800',
  compoff_wfh: 'bg-cyan-100 text-cyan-800',
  compoff_leave: 'bg-amber-100 text-amber-800',
}

const TYPE_LABEL: Record<string, string> = {
  wfh: 'WFH',
  leave: 'Leave',
  compoff_wfh: 'Comp-off WFH',
  compoff_leave: 'Comp-off Leave',
}

const ROLE_COLOR: Record<string, string> = {
  founder: 'bg-violet-100 text-violet-800',
  hr: 'bg-emerald-100 text-emerald-800',
  team_lead: 'bg-blue-100 text-blue-800',
  employee: 'bg-slate-100 text-slate-700',
}

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const

interface Props {
  currentUser: Tables<'users'>
  myTeams: Tables<'teams'>[]
  initialTeamId: string | null
  membersByTeam: Record<string, Tables<'users'>[]>
  leadByTeam: Record<string, Tables<'users'> | null>
  upcomingByTeam: Record<string, LeaveWithUser[]>
}

export function TeamClient({
  currentUser,
  myTeams,
  initialTeamId,
  membersByTeam,
  leadByTeam,
  upcomingByTeam,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(initialTeamId)

  if (!initialTeamId || myTeams.length === 0) {
    return (
      <>
        <Topbar title="My Team" subtitle="" />
        <div className="px-5 lg:px-8 py-12">
          <Card>
            <CardContent className="p-12 text-center text-muted-foreground text-sm">
              You're not part of any team yet. Contact HR to be added.
            </CardContent>
          </Card>
        </div>
      </>
    )
  }

  const team = myTeams.find((t) => t.id === selectedId) ?? myTeams[0]
  const members = membersByTeam[team.id] ?? []
  const lead = leadByTeam[team.id]
  const upcoming = upcomingByTeam[team.id] ?? []

  const wfoDays = team.wfo_pattern
    ? team.wfo_pattern.split(',').map((s) => s.trim().toUpperCase())
    : []

  return (
    <>
      <Topbar title="My Team" subtitle="Members, schedule, and upcoming leaves" />
      <div className="px-5 lg:px-8 py-5 space-y-5">
        {/* Team selector */}
        {myTeams.length > 1 && (
          <div className="flex items-center gap-3">
            <span className="text-[12.5px] text-muted-foreground">Showing</span>
            <Select value={team.id} onValueChange={setSelectedId}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {myTeams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Team header */}
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-[18px] font-bold tracking-tight">{team.name}</div>
                <div className="text-[12.5px] text-muted-foreground mt-0.5">
                  {members.length} {members.length === 1 ? 'member' : 'members'}
                  {lead && ` · Led by ${lead.full_name}`}
                </div>
              </div>
            </div>

            {/* WFO pattern */}
            <div>
              <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
                Office days
              </div>
              <div className="flex gap-1.5">
                {DAYS.map((d) => {
                  const inOffice = wfoDays.includes(d)
                  return (
                    <span
                      key={d}
                      className={cn(
                        'rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset',
                        inOffice
                          ? 'bg-violet-100 text-violet-800 ring-violet-200'
                          : 'bg-muted text-muted-foreground ring-border'
                      )}
                    >
                      {d}
                    </span>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Members grid */}
        <div>
          <h2 className="text-[12.5px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
            Members
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {members.map((m) => {
              const isLead = lead?.id === m.id
              const isMe = m.id === currentUser.id
              return (
                <Card key={m.id} className={cn(isMe && 'ring-2 ring-violet-500')}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <Avatar name={m.full_name} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-semibold truncate">
                        {m.full_name} {isLead && <span className="text-violet-600 text-[11px] ml-1">★ Lead</span>}
                      </div>
                      <div className="text-[11.5px] text-muted-foreground truncate">
                        {m.designation || '—'}
                      </div>
                    </div>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-medium capitalize',
                        ROLE_COLOR[m.role] ?? 'bg-slate-100 text-slate-700'
                      )}
                    >
                      {m.role.replace('_', ' ')}
                    </span>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>

        {/* Upcoming leaves */}
        <div>
          <h2 className="text-[12.5px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
            Upcoming leaves (next 30 days)
          </h2>
          <Card>
            <CardContent className="p-0">
              {upcoming.length === 0 ? (
                <div className="p-6 text-center text-[12.5px] text-muted-foreground">
                  No upcoming leaves on the team.
                </div>
              ) : (
                <ul className="divide-y">
                  {upcoming.map((l) => (
                    <li key={l.id} className="flex items-center gap-3 px-4 py-3">
                      <Avatar name={l.user_full_name} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium truncate">
                          {l.user_full_name}
                        </div>
                        <div className="text-[11.5px] text-muted-foreground">
                          {format(parseISO(l.start_date), 'MMM d')}
                          {l.start_date !== l.end_date && ` → ${format(parseISO(l.end_date), 'MMM d')}`}
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
        </div>
      </div>
    </>
  )
}
