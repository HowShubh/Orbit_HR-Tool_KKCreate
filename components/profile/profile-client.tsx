'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { BadgeCheck, CalendarDays } from 'lucide-react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent } from '@/components/ui/card'
import { PhotoUpload } from '@/components/ui/photo-upload'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useStore } from '@/lib/store'
import { updateMyProfile } from '@/lib/actions/profile'
import { updateMyPhoto, removeMyPhoto } from '@/lib/actions/avatars'
import type { AppUser } from '@/lib/auth/get-current-user'
import type { ProfileTeam } from '@/lib/queries/users'

interface Props {
  user: AppUser
  teams: ProfileTeam[]
  managerName: string | null
  directReports: { id: string; full_name: string }[]
}

export function ProfileClient({ user, teams, managerName, directReports }: Props) {
  const router = useRouter()
  const { pushToast } = useStore()
  const [isPending, startTransition] = useTransition()

  const [phone, setPhone] = useState(user.phone ?? '')
  const [muted, setMuted] = useState(user.notifications_muted ?? false)

  const dirty = (phone.trim() || null) !== (user.phone ?? null) || muted !== (user.notifications_muted ?? false)

  function save() {
    startTransition(async () => {
      try {
        await updateMyProfile({
          phone: phone.trim() ? phone.trim() : null,
          notifications_muted: muted,
        })
        pushToast({ title: 'Profile updated', variant: 'success' })
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not update profile'
        pushToast({ title: 'Update failed', body: message, variant: 'error' })
      }
    })
  }

  return (
    <>
      <Topbar title="My Profile" subtitle="What teammates see, plus your preferences" />
      <div className="px-5 lg:px-8 py-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Identity card */}
        <div className="lg:col-span-1">
          <Card>
            <CardContent className="p-6 text-center">
              <PhotoUpload
                name={user.full_name}
                src={user.photo_url}
                size="xl"
                onUpload={updateMyPhoto}
                onRemove={removeMyPhoto}
              />
              <div className="mt-4 text-[16px] font-semibold tracking-tight">
                {user.full_name}
              </div>
              <div className="text-[12.5px] text-muted-foreground">
                {user.designation ?? '—'}
              </div>
              <div className="mt-3 flex items-center justify-center gap-1.5 flex-wrap">
                <Badge variant="muted" className="capitalize">
                  {user.role.replace('_', ' ')}
                </Badge>
                {teams.map((team) => (
                  <Badge key={team.id} variant={team.is_primary ? 'default' : 'muted'}>
                    {team.name}
                  </Badge>
                ))}
              </div>

              <div className="mt-6 space-y-3 text-left">
                <Row label="Email" value={user.email} />
                <Row label="Reports to" value={managerName ?? 'Not assigned'} />
                <Row
                  label="Manager of"
                  value={
                    directReports.length === 0
                      ? 'No direct reports'
                      : directReports.length <= 2
                      ? directReports.map((r) => r.full_name).join(', ')
                      : `${directReports.length} people`
                  }
                />
                <Row
                  label="Joined"
                  value={user.joined_at ? format(parseISO(user.joined_at), 'MMM d, yyyy') : '—'}
                  icon={<CalendarDays className="h-3.5 w-3.5" />}
                />
                <Row
                  label="Status"
                  value={user.status}
                  icon={
                    user.status === 'active' ? (
                      <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />
                    ) : undefined
                  }
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Editable preferences */}
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-6 space-y-6">
              <div>
                <h2 className="text-[15px] font-semibold">Contact & preferences</h2>
                <p className="text-[12.5px] text-muted-foreground">
                  Only your phone number and notification preference are editable here. Ask HR to
                  change your name, role, or team.
                </p>
              </div>

              <div className="space-y-1.5 max-w-sm">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  placeholder="+91 98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <label className="flex items-center justify-between rounded-lg border border-border px-4 py-3 max-w-sm cursor-pointer">
                <div>
                  <div className="text-[13.5px] font-medium">Mute notifications</div>
                  <div className="text-[12px] text-muted-foreground">
                    Pause in-app notifications for leaves and approvals.
                  </div>
                </div>
                <Switch checked={muted} onCheckedChange={(v) => setMuted(Boolean(v))} />
              </label>

              <div className="flex items-center gap-3">
                <Button onClick={save} disabled={!dirty || isPending}>
                  {isPending ? 'Saving…' : 'Save changes'}
                </Button>
                {dirty && !isPending && (
                  <span className="text-[12px] text-muted-foreground">Unsaved changes</span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}

function Row({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium capitalize flex items-center gap-1.5 truncate">
        {icon}
        <span className="truncate normal-case">{value}</span>
      </span>
    </div>
  )
}
