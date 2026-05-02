'use client'

import { useState, useTransition } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { grantCapability } from '@/lib/actions/capabilities'
import { useStore } from '@/lib/store'
import type { Tables } from '@/lib/supabase/database.types'
import type { UserWithMembership } from '@/lib/queries/users'
import type { TeamWithMembers } from '@/lib/queries/teams'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  users: UserWithMembership[]
  teams: TeamWithMembers[]
  capabilities: Tables<'capabilities'>[]
  prefillUserId?: string
}

export function GrantCapabilityDialog({
  open,
  onOpenChange,
  users,
  teams,
  capabilities,
  prefillUserId,
}: Props) {
  const { pushToast } = useStore()
  const [isPending, startTransition] = useTransition()

  const [userId, setUserId] = useState(prefillUserId ?? '')
  const [capKey, setCapKey] = useState('')
  const [scopeType, setScopeType] = useState<string>('')
  const [scopeUserIds, setScopeUserIds] = useState<string[]>([])
  const [scopeTeamIds, setScopeTeamIds] = useState<string[]>([])
  const [note, setNote] = useState('')

  const selectedCap = capabilities.find((c) => c.key === capKey)

  function handleClose() {
    setUserId(prefillUserId ?? '')
    setCapKey('')
    setScopeType('')
    setScopeUserIds([])
    setScopeTeamIds([])
    setNote('')
    onOpenChange(false)
  }

  function handleSubmit() {
    if (!userId || !capKey) {
      pushToast({ title: 'User and capability are required', variant: 'error' })
      return
    }

    startTransition(async () => {
      try {
        await grantCapability({
          user_id: userId,
          capability_key: capKey,
          scope_type: (scopeType as 'self' | 'users' | 'teams' | 'all') || null,
          scope_user_ids: scopeType === 'users' && scopeUserIds.length > 0 ? scopeUserIds : null,
          scope_team_ids: scopeType === 'teams' && scopeTeamIds.length > 0 ? scopeTeamIds : null,
          note: note || null,
        })
        pushToast({ title: 'Capability granted', variant: 'success' })
        handleClose()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to grant capability'
        pushToast({ title: 'Error', body: msg, variant: 'error' })
      }
    })
  }

  function toggleUserId(id: string) {
    setScopeUserIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  function toggleTeamId(id: string) {
    setScopeTeamIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Grant Capability</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* User */}
          <div className="space-y-1.5">
            <Label>User</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select user…" />
              </SelectTrigger>
              <SelectContent>
                {users
                  .filter((u) => u.status === 'active')
                  .map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name} <span className="text-muted-foreground text-xs">({u.email})</span>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {/* Capability */}
          <div className="space-y-1.5">
            <Label>Capability</Label>
            <Select value={capKey} onValueChange={(v) => { setCapKey(v); setScopeType(''); setScopeUserIds([]); setScopeTeamIds([]) }}>
              <SelectTrigger>
                <SelectValue placeholder="Select capability…" />
              </SelectTrigger>
              <SelectContent>
                {capabilities.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    <span className="font-mono text-xs">{c.key}</span>
                    {c.is_write && <span className="ml-1 text-xs text-amber-600">(write)</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCap && (
              <div className="text-xs text-muted-foreground">{selectedCap.description}</div>
            )}
          </div>

          {/* Scope — only if capability is scoped */}
          {selectedCap?.is_scoped && (
            <div className="space-y-1.5">
              <Label>Scope Type</Label>
              <Select value={scopeType} onValueChange={(v) => { setScopeType(v); setScopeUserIds([]); setScopeTeamIds([]) }}>
                <SelectTrigger>
                  <SelectValue placeholder="No scope (all)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="self">Self only</SelectItem>
                  <SelectItem value="users">Specific users</SelectItem>
                  <SelectItem value="teams">Specific teams</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Scope users multi-select */}
          {scopeType === 'users' && (
            <div className="space-y-1.5">
              <Label>Scoped Users</Label>
              <div className="max-h-32 overflow-y-auto rounded-lg border p-2 space-y-1">
                {users
                  .filter((u) => u.status === 'active')
                  .map((u) => (
                    <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={scopeUserIds.includes(u.id)}
                        onChange={() => toggleUserId(u.id)}
                        className="accent-primary"
                      />
                      {u.full_name}
                    </label>
                  ))}
              </div>
            </div>
          )}

          {/* Scope teams multi-select */}
          {scopeType === 'teams' && (
            <div className="space-y-1.5">
              <Label>Scoped Teams</Label>
              <div className="max-h-32 overflow-y-auto rounded-lg border p-2 space-y-1">
                {teams.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={scopeTeamIds.includes(t.id)}
                      onChange={() => toggleTeamId(t.id)}
                      className="accent-primary"
                    />
                    {t.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Note */}
          <div className="space-y-1.5">
            <Label>Note (optional)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reason for granting this capability…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending || !userId || !capKey}>
            {isPending ? 'Granting…' : 'Grant Capability'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
