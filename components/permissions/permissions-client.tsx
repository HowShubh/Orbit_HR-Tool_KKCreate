'use client'

import { useState, useTransition } from 'react'
import { Search, Shield, Package, X } from 'lucide-react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useCapabilities } from '@/hooks/use-capabilities'
import { revokeCapability } from '@/lib/actions/capabilities'
import { MANUALLY_GRANTABLE_CAPABILITIES, PERMISSIONS_READ_ONLY } from '@/lib/permissions-config'
import { useStore } from '@/lib/store'
import { GrantCapabilityDialog } from './grant-capability-dialog'
import { ApplyBundleDialog } from './apply-bundle-dialog'
import type { Tables } from '@/lib/supabase/database.types'
import type { UserWithMembership } from '@/lib/queries/users'
import type { TeamWithMembers } from '@/lib/queries/teams'

type UserCapability = Tables<'user_capabilities'> & {
  user_full_name: string
  user_email: string
}

interface Props {
  users: UserWithMembership[]
  teams: TeamWithMembers[]
  capabilities: Tables<'capabilities'>[]
  bundles: Tables<'capability_bundles'>[]
  userCapabilities: UserCapability[]
}

function sourceVariant(source: string): 'muted' | 'info' | 'warning' | 'success' | 'danger' {
  if (source === 'manual') return 'info'
  if (source === 'bundle') return 'warning'
  return 'muted'
}

/** Human-readable scope of a grant, e.g. "all", "teams: Finance", "users: Asha". */
function scopeLabel(
  uc: Pick<Tables<'user_capabilities'>, 'scope_type' | 'scope_team_ids' | 'scope_user_ids'>,
  teams: TeamWithMembers[],
  users: UserWithMembership[]
): string | null {
  switch (uc.scope_type) {
    case 'all':
      return 'all'
    case 'self':
      return 'self'
    case 'teams': {
      const names = (uc.scope_team_ids ?? []).map(
        (id) => teams.find((t) => t.id === id)?.name ?? '?'
      )
      return names.length ? `teams: ${names.join(', ')}` : 'teams'
    }
    case 'users': {
      const names = (uc.scope_user_ids ?? []).map(
        (id) => users.find((u) => u.id === id)?.full_name ?? '?'
      )
      return names.length ? `users: ${names.join(', ')}` : 'users'
    }
    default:
      return null
  }
}

export function PermissionsClient({
  users,
  teams,
  capabilities,
  bundles,
  userCapabilities,
}: Props) {
  const { can } = useCapabilities()
  const { pushToast } = useStore()
  const [isPending, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const [grantDialogOpen, setGrantDialogOpen] = useState(false)
  const [bundleDialogOpen, setBundleDialogOpen] = useState(false)
  const [prefillUserId, setPrefillUserId] = useState<string | undefined>()

  if (!can.manageCapabilities()) {
    return (
      <>
        <Topbar title="Permissions" subtitle="Grant and revoke capabilities" />
        <div className="p-12 text-center text-muted-foreground text-sm">
          Permissions management is available to Founders only.
        </div>
      </>
    )
  }

  function openGrantForUser(userId?: string) {
    setPrefillUserId(userId)
    setGrantDialogOpen(true)
  }

  function handleRevoke(id: string) {
    startTransition(async () => {
      try {
        await revokeCapability(id)
        pushToast({ title: 'Capability revoked', variant: 'success' })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed'
        pushToast({ title: 'Error', body: msg, variant: 'error' })
      }
    })
  }

  // Group capabilities by user
  const capsByUser = new Map<string, UserCapability[]>()
  for (const uc of userCapabilities) {
    if (!capsByUser.has(uc.user_id)) capsByUser.set(uc.user_id, [])
    capsByUser.get(uc.user_id)!.push(uc)
  }

  // Group users by capability key
  const usersByCap = new Map<string, UserCapability[]>()
  for (const uc of userCapabilities) {
    if (!usersByCap.has(uc.capability_key)) usersByCap.set(uc.capability_key, [])
    usersByCap.get(uc.capability_key)!.push(uc)
  }

  const filteredUsers = users.filter((u) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      u.full_name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    )
  })

  const filteredCapabilities = capabilities.filter((c) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return c.key.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
  })

  return (
    <>
      <Topbar title="Permissions" subtitle="Grant and revoke capabilities" />
      <div className="px-5 lg:px-8 py-5 space-y-4">
        {/* Header actions */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users or capabilities…"
              className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={PERMISSIONS_READ_ONLY} onClick={() => setBundleDialogOpen(true)}>
              <Package className="h-4 w-4" />
              Apply Bundle
            </Button>
            <Button onClick={() => openGrantForUser(undefined)}>
              <Shield className="h-4 w-4" />
              Grant Capability
            </Button>
          </div>
        </div>

        {PERMISSIONS_READ_ONLY && (
          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-[12.5px] text-muted-foreground">
            <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <strong className="text-foreground">Mostly read-only.</strong> Access is managed by
              role — to change what someone can do, update their role in{' '}
              <strong>HR Console → Users</strong>. The exception is{' '}
              <strong className="font-mono text-foreground">manage_equipment</strong> (Lockup),
              which can be granted and revoked here because it is honored end to end.
            </span>
          </div>
        )}

        <Tabs defaultValue="by-user">
          <TabsList>
            <TabsTrigger value="by-user">By User</TabsTrigger>
            <TabsTrigger value="by-capability">By Capability</TabsTrigger>
          </TabsList>

          {/* BY USER */}
          <TabsContent value="by-user">
            <Card>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {filteredUsers.map((user) => {
                    const grants = capsByUser.get(user.id) ?? []
                    return (
                      <li key={user.id} className="px-4 py-4">
                        <div className="flex items-start gap-3">
                          <Avatar name={user.full_name} size="sm" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1.5">
                              <span className="text-[13.5px] font-semibold">{user.full_name}</span>
                              <span className="text-xs text-muted-foreground">{user.email}</span>
                              <Badge variant={user.role === 'founder' ? 'warning' : user.role === 'hr' ? 'info' : 'muted'}>
                                {user.role.replace('_', ' ')}
                              </Badge>
                            </div>

                            {grants.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {grants.map((uc) => {
                                  const scope = scopeLabel(uc, teams, users)
                                  return (
                                  <div
                                    key={uc.id}
                                    className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
                                    title={uc.source === 'role' ? 'Derived from role — cannot revoke directly' : uc.source === 'bundle' ? `From bundle — cannot revoke directly` : uc.note ?? ''}
                                  >
                                    <span className="font-mono">{uc.capability_key}</span>
                                    {scope && (
                                      <span className="text-[10px] text-muted-foreground">· {scope}</span>
                                    )}
                                    <Badge variant={sourceVariant(uc.source)} className="text-[9px] px-1 py-0">
                                      {uc.source}
                                    </Badge>
                                    {uc.source === 'manual' && (
                                      <button
                                        onClick={() => handleRevoke(uc.id)}
                                        disabled={isPending || (PERMISSIONS_READ_ONLY && !MANUALLY_GRANTABLE_CAPABILITIES.includes(uc.capability_key))}
                                        className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors"
                                        title="Revoke"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    )}
                                  </div>
                                  )
                                })}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">No custom capabilities</span>
                            )}
                          </div>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openGrantForUser(user.id)}
                            className="shrink-0"
                          >
                            Grant
                          </Button>
                        </div>
                      </li>
                    )
                  })}

                  {filteredUsers.length === 0 && (
                    <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No users found
                    </li>
                  )}
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          {/* BY CAPABILITY */}
          <TabsContent value="by-capability">
            <Card>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {filteredCapabilities.map((cap) => {
                    const grants = usersByCap.get(cap.key) ?? []
                    return (
                      <li key={cap.key} className="px-4 py-4">
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <span className="font-mono text-[13px] font-semibold">{cap.key}</span>
                              {cap.is_write && <Badge variant="warning" className="text-[9px]">write</Badge>}
                              {cap.is_scoped && <Badge variant="info" className="text-[9px]">scoped</Badge>}
                            </div>
                            <div className="text-xs text-muted-foreground mb-2">{cap.description}</div>

                            {grants.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {grants.map((uc) => {
                                  const scope = scopeLabel(uc, teams, users)
                                  return (
                                  <div
                                    key={uc.id}
                                    className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
                                  >
                                    <span>{uc.user_full_name}</span>
                                    {scope && (
                                      <span className="text-[10px] text-muted-foreground">· {scope}</span>
                                    )}
                                    <Badge variant={sourceVariant(uc.source)} className="text-[9px] px-1 py-0">
                                      {uc.source}
                                    </Badge>
                                    {uc.source === 'manual' && (
                                      <button
                                        onClick={() => handleRevoke(uc.id)}
                                        disabled={isPending || (PERMISSIONS_READ_ONLY && !MANUALLY_GRANTABLE_CAPABILITIES.includes(uc.capability_key))}
                                        className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors"
                                        title="Revoke"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    )}
                                  </div>
                                  )
                                })}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">No grants</span>
                            )}
                          </div>
                        </div>
                      </li>
                    )
                  })}

                  {filteredCapabilities.length === 0 && (
                    <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No capabilities found
                    </li>
                  )}
                </ul>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <GrantCapabilityDialog
        open={grantDialogOpen}
        onOpenChange={setGrantDialogOpen}
        users={users}
        teams={teams}
        capabilities={capabilities}
        prefillUserId={prefillUserId}
      />

      <ApplyBundleDialog
        open={bundleDialogOpen}
        onOpenChange={setBundleDialogOpen}
        users={users}
        bundles={bundles}
      />
    </>
  )
}
