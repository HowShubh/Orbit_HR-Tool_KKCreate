'use client'

import { useState, useTransition } from 'react'
import { format, parseISO } from 'date-fns'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { updateMyProfile } from '@/lib/actions/profile'
import { createClient } from '@/lib/supabase/client'
import { useStore } from '@/lib/store'
import type { AppUser } from '@/lib/auth/get-current-user'

interface Props {
  user: AppUser
}

export function SettingsClient({ user }: Props) {
  const { pushToast } = useStore()
  const router = useRouter()

  const [phone, setPhone] = useState(user.phone ?? '')
  const [notifMuted, setNotifMuted] = useState(user.notifications_muted)
  const [isPendingContact, startContactTransition] = useTransition()
  const [isPendingNotif, startNotifTransition] = useTransition()
  const [isPendingSignout, startSignoutTransition] = useTransition()

  function handleSaveContact() {
    startContactTransition(async () => {
      try {
        await updateMyProfile({ phone: phone || null })
        pushToast({ title: 'Contact updated', variant: 'success' })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to save'
        pushToast({ title: 'Error', body: msg, variant: 'error' })
      }
    })
  }

  function handleToggleNotif(checked: boolean) {
    setNotifMuted(checked)
    startNotifTransition(async () => {
      try {
        await updateMyProfile({ notifications_muted: checked })
        pushToast({
          title: checked ? 'Notifications muted' : 'Notifications enabled',
          variant: 'success',
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to save'
        pushToast({ title: 'Error', body: msg, variant: 'error' })
        setNotifMuted(!checked) // revert
      }
    })
  }

  function handleSignOut() {
    startSignoutTransition(async () => {
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push('/login')
    })
  }

  return (
    <>
      <Topbar title="Settings" subtitle="Workspace preferences" />
      <div className="px-5 lg:px-8 py-5 space-y-5 max-w-2xl">

        {/* Account (read-only) */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-3 mb-3">
              <Avatar name={user.full_name} size="md" />
              <div>
                <div className="font-semibold text-[15px]">{user.full_name}</div>
                <div className="text-sm text-muted-foreground">{user.email}</div>
              </div>
            </div>

            <h3 className="text-sm font-semibold">Account</h3>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground text-xs mb-0.5">Full name</div>
                <div className="font-medium">{user.full_name}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs mb-0.5">Email</div>
                <div className="font-medium">{user.email}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs mb-0.5">Role</div>
                <Badge variant={user.role === 'founder' ? 'warning' : user.role === 'hr' ? 'info' : 'muted'}>
                  {user.role.replace('_', ' ')}
                </Badge>
              </div>
              {user.designation && (
                <div>
                  <div className="text-muted-foreground text-xs mb-0.5">Designation</div>
                  <div className="font-medium">{user.designation}</div>
                </div>
              )}
              <div>
                <div className="text-muted-foreground text-xs mb-0.5">Joined</div>
                <div className="font-medium">{format(parseISO(user.joined_at), 'MMM d, yyyy')}</div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground border-t pt-3">
              To change your name, email, role, or designation, contact HR.
            </p>
          </CardContent>
        </Card>

        {/* Contact */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <h3 className="text-sm font-semibold">Contact</h3>

            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
              />
            </div>

            <Button
              onClick={handleSaveContact}
              disabled={isPendingContact}
              size="sm"
            >
              {isPendingContact ? 'Saving…' : 'Save Contact'}
            </Button>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <h3 className="text-sm font-semibold">Notifications</h3>

            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium">Mute all notifications</div>
                <div className="text-xs text-muted-foreground">
                  Disable email and in-app notifications
                </div>
              </div>
              <Switch
                checked={notifMuted}
                onCheckedChange={handleToggleNotif}
                disabled={isPendingNotif}
              />
            </div>
          </CardContent>
        </Card>

        {/* Sign out */}
        <Card>
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold mb-3">Account Actions</h3>
            <Button
              variant="outline"
              className="text-destructive hover:bg-destructive/10 hover:border-destructive/50"
              onClick={handleSignOut}
              disabled={isPendingSignout}
            >
              {isPendingSignout ? 'Signing out…' : 'Sign out'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
