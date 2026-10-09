'use client'

import { useState, useTransition } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Trash2, UserPlus } from 'lucide-react'
import { addTeamMember, removeTeamMember } from '@/lib/actions/teams'
import { useStore } from '@/lib/store'
import type { TeamWithMembers } from '@/lib/queries/teams'
import type { UserWithMembership } from '@/lib/queries/users'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  team: TeamWithMembers
  users: UserWithMembership[]
}

export function TeamMembersDialog({ open, onOpenChange, team, users }: Props) {
  const { pushToast } = useStore()
  const [isPending, startTransition] = useTransition()
  const [addUserId, setAddUserId] = useState('')

  // Members of this team = users with active membership for this team
  const teamMembers = users.filter((u) =>
    u.memberships.some((m) => m.team_id === team.id)
  )

  // Users NOT in this team
  const nonMembers = users.filter(
    (u) =>
      u.status === 'active' &&
      !u.memberships.some((m) => m.team_id === team.id)
  )

  function handleAdd() {
    if (!addUserId) return
    startTransition(async () => {
      try {
        await addTeamMember({
          user_id: addUserId,
          team_id: team.id,
          is_primary: false,
        })
        pushToast({ title: 'Member added', variant: 'success' })
        setAddUserId('')
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed'
        pushToast({ title: 'Error', body: msg, variant: 'error' })
      }
    })
  }

  function handleRemove(userId: string) {
    const user = users.find((u) => u.id === userId)
    const membership = user?.memberships.find((m) => m.team_id === team.id)
    if (!membership) return

    startTransition(async () => {
      try {
        await removeTeamMember(membership.id)
        pushToast({ title: 'Member removed', variant: 'success' })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed'
        pushToast({ title: 'Error', body: msg, variant: 'error' })
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Members — {team.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current members */}
          <div>
            <div className="text-[12px] text-muted-foreground uppercase tracking-wide font-semibold mb-2">
              Current Members ({teamMembers.length})
            </div>
            {teamMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No members yet.</p>
            ) : (
              <ul className="space-y-2">
                {teamMembers.map((u) => {
                  const membership = u.memberships.find((m) => m.team_id === team.id)
                  return (
                    <li key={u.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                      <Avatar name={u.full_name} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium truncate">{u.full_name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{u.designation ?? u.role}</div>
                      </div>
                      {membership?.is_primary && (
                        <Badge variant="default" className="text-[10px]">Primary</Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="hover:text-rose-600 shrink-0"
                        disabled={isPending}
                        onClick={() => handleRemove(u.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Add member */}
          {nonMembers.length > 0 && (
            <div>
              <div className="text-[12px] text-muted-foreground uppercase tracking-wide font-semibold mb-2">
                Add Member
              </div>
              <div className="flex gap-2">
                <Select value={addUserId || '__none__'} onValueChange={(v) => setAddUserId(v === '__none__' ? '' : v)}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select a user…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select a user…</SelectItem>
                    {nonMembers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleAdd} disabled={!addUserId || isPending}>
                  <UserPlus className="h-4 w-4" />
                  Add
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
