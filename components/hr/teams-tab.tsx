'use client'

import { useState, useTransition } from 'react'
import { Plus, Edit2, Trash2, Users } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TeamFormDialog } from './team-form-dialog'
import { TeamMembersDialog } from './team-members-dialog'
import { deleteTeam } from '@/lib/actions/teams'
import { useStore } from '@/lib/store'
import type { TeamWithMembers } from '@/lib/queries/teams'
import type { UserWithMembership } from '@/lib/queries/users'

interface Props {
  teams: TeamWithMembers[]
  users: UserWithMembership[]
}

const DAY_DISPLAY: Record<string, string> = {
  MON: 'Mon',
  TUE: 'Tue',
  WED: 'Wed',
  THU: 'Thu',
  FRI: 'Fri',
  SAT: 'Sat',
  SUN: 'Sun',
}

export function TeamsTab({ teams, users }: Props) {
  const { pushToast } = useStore()
  const [isPending, startTransition] = useTransition()
  const [formOpen, setFormOpen] = useState(false)
  const [editingTeam, setEditingTeam] = useState<TeamWithMembers | undefined>()
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
  const [membersTeam, setMembersTeam] = useState<TeamWithMembers | undefined>()
  const [membersOpen, setMembersOpen] = useState(false)

  function openCreate() {
    setEditingTeam(undefined)
    setFormMode('create')
    setFormOpen(true)
  }

  function openEdit(team: TeamWithMembers) {
    setEditingTeam(team)
    setFormMode('edit')
    setFormOpen(true)
  }

  function openMembers(team: TeamWithMembers) {
    setMembersTeam(team)
    setMembersOpen(true)
  }

  function handleDelete(team: TeamWithMembers) {
    if (team.member_count > 0) {
      pushToast({
        title: 'Cannot delete',
        body: `Team has ${team.member_count} active members. Remove them first.`,
        variant: 'error',
      })
      return
    }
    if (!window.confirm(`Delete team "${team.name}"? This cannot be undone.`)) return
    startTransition(async () => {
      try {
        await deleteTeam(team.id)
        pushToast({ title: 'Team deleted', variant: 'success' })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed'
        pushToast({ title: 'Error', body: msg, variant: 'error' })
      }
    })
  }

  return (
    <>
      <Card>
        <CardContent className="p-0">
          <div className="p-4 flex items-center justify-between gap-3 border-b">
            <div className="text-[13px] text-muted-foreground">
              {teams.length} team{teams.length !== 1 ? 's' : ''}
            </div>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Add Team
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground bg-muted/40">
                  <th className="font-medium px-4 py-3">Name</th>
                  <th className="font-medium px-4 py-3">WFO Pattern</th>
                  <th className="font-medium px-4 py-3">Team Lead</th>
                  <th className="font-medium px-4 py-3">Members</th>
                  <th className="font-medium px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((team) => {
                  const days = team.wfo_pattern
                    ? team.wfo_pattern.split(',').filter(Boolean)
                    : []

                  return (
                    <tr key={team.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{team.name}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {days.length > 0 ? (
                            days.map((d) => (
                              <span
                                key={d}
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-muted text-muted-foreground"
                              >
                                {DAY_DISPLAY[d] ?? d}
                              </span>
                            ))
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {team.team_lead_name ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold tabular-nums">{team.member_count}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(team)}>
                            <Edit2 className="h-3.5 w-3.5" />
                            Edit
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => openMembers(team)}>
                            <Users className="h-3.5 w-3.5" />
                            Members
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="hover:text-rose-600"
                            disabled={isPending || team.member_count > 0}
                            onClick={() => handleDelete(team)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {teams.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-sm">
                      No teams yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <TeamFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        team={editingTeam}
        users={users}
      />

      {membersTeam && (
        <TeamMembersDialog
          open={membersOpen}
          onOpenChange={setMembersOpen}
          team={membersTeam}
          users={users}
        />
      )}
    </>
  )
}
