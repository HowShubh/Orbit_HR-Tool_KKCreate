'use client'

import { useState, useTransition } from 'react'
import { Search, UserPlus, Edit2, Upload } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { UserFormDialog } from './user-form-dialog'
import { UsersCsvImport } from './users-csv-import'
import { PersonName } from '@/components/people/person-drawer-context'
import { deactivateUser, reactivateUser } from '@/lib/actions/users'
import { useStore } from '@/lib/store'
import type { UserWithMembership } from '@/lib/queries/users'
import type { TeamWithMembers } from '@/lib/queries/teams'

interface Props {
  users: UserWithMembership[]
  teams: TeamWithMembers[]
}

export function UsersTab({ users, teams }: Props) {
  const { pushToast } = useStore()
  const [isPending, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserWithMembership | undefined>()
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [csvImportOpen, setCsvImportOpen] = useState(false)

  const filtered = users.filter((u) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      u.full_name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.designation ?? '').toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    )
  })

  const total = users.length
  const activeCount = users.filter((u) => u.status === 'active').length
  const exitedCount = total - activeCount

  function openCreate() {
    setEditingUser(undefined)
    setDialogMode('create')
    setDialogOpen(true)
  }

  function openEdit(u: UserWithMembership) {
    setEditingUser(u)
    setDialogMode('edit')
    setDialogOpen(true)
  }

  function handleDeactivate(userId: string) {
    startTransition(async () => {
      try {
        await deactivateUser(userId)
        pushToast({ title: 'User deactivated', variant: 'success' })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed'
        pushToast({ title: 'Error', body: msg, variant: 'error' })
      }
    })
  }

  function handleReactivate(userId: string) {
    startTransition(async () => {
      try {
        await reactivateUser(userId)
        pushToast({ title: 'User reactivated', variant: 'success' })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed'
        pushToast({ title: 'Error', body: msg, variant: 'error' })
      }
    })
  }

  const teamsById = new Map(teams.map((t) => [t.id, t]))

  return (
    <>
      <Card>
        <CardContent className="p-0">
          <div className="px-4 pt-4 text-sm font-semibold">
            {total} {total === 1 ? 'user' : 'users'}
            <span className="ml-2 text-[12px] font-normal text-muted-foreground">
              {activeCount} active
              {exitedCount > 0 ? ` · ${exitedCount} former` : ''}
              {search.trim() ? ` · ${filtered.length} shown` : ''}
            </span>
          </div>
          <div className="p-4 flex items-center justify-between gap-3 border-b">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email, role…"
                className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <Button onClick={() => setCsvImportOpen(true)} variant="outline">
              <Upload className="h-4 w-4" />
              Import CSV
            </Button>
            <Button onClick={openCreate}>
              <UserPlus className="h-4 w-4" />
              Add User
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground bg-muted/40">
                  <th className="font-medium px-4 py-3">Employee</th>
                  <th className="font-medium px-4 py-3">Role</th>
                  <th className="font-medium px-4 py-3">Manager</th>
                  <th className="font-medium px-4 py-3">Primary Team</th>
                  <th className="font-medium px-4 py-3">Status</th>
                  <th className="font-medium px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const manager = users.find((x) => x.id === u.manager_id)
                  const primaryMembership = u.memberships.find((m) => m.is_primary)
                  const primaryTeam = primaryMembership
                    ? teamsById.get(primaryMembership.team_id)
                    : undefined

                  return (
                    <tr key={u.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={u.full_name} src={u.photo_url} size="sm" />
                          <div className="min-w-0">
                            <PersonName
                              userId={u.id}
                              name={u.full_name}
                              className="text-[13px] font-medium truncate"
                            />
                            <div className="text-[11px] text-muted-foreground truncate">{u.email}</div>
                            {u.designation && (
                              <div className="text-[11px] text-muted-foreground/70 truncate">{u.designation}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={u.role === 'founder' ? 'warning' : u.role === 'hr' ? 'info' : 'muted'}>
                          {u.role.replace('_', ' ')}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {manager?.full_name ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        {primaryTeam ? (
                          <Badge variant="default">{primaryTeam.name}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={u.status === 'active' ? 'success' : 'muted'}>
                          {u.status === 'active' ? 'Active' : 'Exited'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>
                            <Edit2 className="h-3.5 w-3.5" />
                            Edit
                          </Button>
                          {u.status === 'active' ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="hover:text-rose-600"
                              disabled={isPending}
                              onClick={() => handleDeactivate(u.id)}
                            >
                              Deactivate
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="hover:text-emerald-600"
                              disabled={isPending}
                              onClick={() => handleReactivate(u.id)}
                            >
                              Reactivate
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">
                      No users found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <UserFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialogMode}
        user={editingUser}
        users={users}
        teams={teams}
      />

      <UsersCsvImport
        open={csvImportOpen}
        onOpenChange={setCsvImportOpen}
        users={users}
        teams={teams}
      />

    </>
  )
}
