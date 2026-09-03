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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { applyBundleToUser } from '@/lib/actions/capabilities'
import { useStore } from '@/lib/store'
import type { Tables } from '@/lib/supabase/database.types'
import type { UserWithMembership } from '@/lib/queries/users'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  users: UserWithMembership[]
  bundles: Tables<'capability_bundles'>[]
}

export function ApplyBundleDialog({ open, onOpenChange, users, bundles }: Props) {
  const { pushToast } = useStore()
  const [isPending, startTransition] = useTransition()
  const [userId, setUserId] = useState('')
  const [bundleKey, setBundleKey] = useState('')

  function handleClose() {
    setUserId('')
    setBundleKey('')
    onOpenChange(false)
  }

  function handleSubmit() {
    if (!userId || !bundleKey) {
      pushToast({ title: 'User and bundle are required', variant: 'error' })
      return
    }

    startTransition(async () => {
      try {
        await applyBundleToUser({ user_id: userId, bundle_key: bundleKey })
        pushToast({ title: 'Bundle applied', variant: 'success' })
        handleClose()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to apply bundle'
        pushToast({ title: 'Error', body: msg, variant: 'error' })
      }
    })
  }

  const selectedBundle = bundles.find((b) => b.key === bundleKey)

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Apply Capability Bundle</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
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
                      {u.full_name} <span className="text-muted-foreground text-xs">({u.role})</span>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Bundle</Label>
            <Select value={bundleKey} onValueChange={setBundleKey}>
              <SelectTrigger>
                <SelectValue placeholder="Select bundle…" />
              </SelectTrigger>
              <SelectContent>
                {bundles.map((b) => (
                  <SelectItem key={b.key} value={b.key}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedBundle && (
              <div className="text-xs text-muted-foreground">{selectedBundle.description}</div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending || !userId || !bundleKey}>
            {isPending ? 'Applying…' : 'Apply Bundle'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
