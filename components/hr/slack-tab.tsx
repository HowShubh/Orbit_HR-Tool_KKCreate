'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, AlertTriangle, Send, RefreshCw, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PersonName } from '@/components/people/person-drawer-context'
import { Switch } from '@/components/ui/switch'
import { useStore } from '@/lib/store'
import {
  updateSlackSetting,
  setUserSlackId,
  syncSlackIdsByEmail,
  sendSlackTestMessage,
  getSlackConnectionStatus,
} from '@/lib/actions/slack-settings'
import type { SlackSettings } from '@/lib/slack'
import type { UserWithMembership } from '@/lib/queries/users'

type ToggleKey = 'slack_dm_enabled' | 'slack_whereabouts_on_approval' | 'slack_daily_digest'

const TOGGLES: { key: ToggleKey; title: string; desc: string }[] = [
  {
    key: 'slack_dm_enabled',
    title: 'Approval DMs',
    desc: 'DM the manager when a leave is applied, and DM the applicant when it is approved or rejected.',
  },
  {
    key: 'slack_whereabouts_on_approval',
    title: 'Whereabouts post on approval',
    desc: 'Post to the channel the moment a leave becomes active.',
  },
  {
    key: 'slack_daily_digest',
    title: 'Daily digest (10:50 AM)',
    desc: 'Each morning, post who is on leave or WFH that day.',
  },
]

function errMsg(err: unknown) {
  return err instanceof Error ? err.message : 'Something went wrong'
}

export function SlackTab({ users, settings }: { users: UserWithMembership[]; settings: SlackSettings }) {
  const { pushToast } = useStore()
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [values, setValues] = useState<Record<ToggleKey, boolean>>({
    slack_dm_enabled: settings.dmEnabled,
    slack_whereabouts_on_approval: settings.whereaboutsOnApproval,
    slack_daily_digest: settings.dailyDigest,
  })

  const [status, setStatus] = useState<Awaited<ReturnType<typeof getSlackConnectionStatus>> | null>(null)
  const [checking, setChecking] = useState(true)
  const [busy, setBusy] = useState<'sync' | 'test' | null>(null)

  useEffect(() => {
    getSlackConnectionStatus()
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setChecking(false))
  }, [])

  function toggle(key: ToggleKey, value: boolean) {
    setValues((v) => ({ ...v, [key]: value }))
    startTransition(async () => {
      try {
        await updateSlackSetting(key, value)
      } catch (err) {
        setValues((v) => ({ ...v, [key]: !value }))
        pushToast({ title: 'Could not update setting', body: errMsg(err), variant: 'error' })
      }
    })
  }

  async function runSync() {
    setBusy('sync')
    try {
      const r = await syncSlackIdsByEmail()
      pushToast({
        title: 'Slack IDs synced',
        body: `${r.matched} matched, ${r.already} already set, ${r.unmatched} not found.`,
        variant: 'success',
      })
      router.refresh()
    } catch (err) {
      pushToast({ title: 'Sync failed', body: errMsg(err), variant: 'error' })
    } finally {
      setBusy(null)
    }
  }

  async function runTest() {
    setBusy('test')
    try {
      await sendSlackTestMessage()
      pushToast({ title: 'Test message sent', body: 'Check the #whereabouts channel.', variant: 'success' })
    } catch (err) {
      pushToast({ title: 'Test failed', body: errMsg(err), variant: 'error' })
    } finally {
      setBusy(null)
    }
  }

  const activeUsers = users.filter((u) => u.status === 'active')

  return (
    <div className="space-y-4">
      {/* Connection status */}
      <Card>
        <CardContent className="p-4">
          {checking ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking Slack connection…
            </div>
          ) : !status?.tokenSet ? (
            <div className="flex items-start gap-2 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-semibold">Slack is not connected</div>
                <p className="text-amber-700">
                  Set <code>SLACK_BOT_TOKEN</code> and <code>SLACK_WHEREABOUTS_CHANNEL</code> in the
                  environment to turn the integration on.
                </p>
              </div>
            </div>
          ) : status.ok ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-2 text-sm text-emerald-800">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <div className="font-semibold">
                    Connected to {status.team ?? 'Slack'} as @{status.botUser ?? 'bot'}
                  </div>
                  <p className="text-emerald-700">
                    {status.channelSet
                      ? 'Channel configured. The bot must be a member of it to post.'
                      : 'No channel set — add SLACK_WHEREABOUTS_CHANNEL to post the digest/announcements.'}
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={runTest} disabled={busy !== null}>
                {busy === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send test message
              </Button>
            </div>
          ) : (
            <div className="flex items-start gap-2 text-sm text-rose-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-semibold">Slack token set, but the connection failed</div>
                <p className="text-rose-700">Slack said: {status.error ?? 'unknown error'}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Feature toggles */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="text-sm font-semibold">What the bot does</div>
          {TOGGLES.map((t) => (
            <label
              key={t.key}
              className="flex items-start justify-between gap-3 rounded-lg border px-4 py-3 cursor-pointer"
            >
              <div>
                <div className="text-[13.5px] font-medium">{t.title}</div>
                <div className="text-[12px] text-muted-foreground">{t.desc}</div>
              </div>
              <Switch
                checked={values[t.key]}
                onCheckedChange={(v) => toggle(t.key, Boolean(v))}
              />
            </label>
          ))}

          <p className="text-[11.5px] text-muted-foreground">
            These switches turn features on and off instantly. The bot also stays fully off whenever
            the Slack token is missing.
          </p>
        </CardContent>
      </Card>

      {/* User Slack IDs */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">Slack member IDs</div>
              <p className="text-[12px] text-muted-foreground">
                People are matched by email automatically. Set a member ID only to fix a mismatch.
                Changes here also update the person&apos;s profile.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={runSync} disabled={busy !== null}>
              {busy === 'sync' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sync IDs from email
            </Button>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Slack email (= Orbit email)</th>
                  <th className="px-3 py-2 font-medium">Slack member ID</th>
                </tr>
              </thead>
              <tbody>
                {activeUsers.map((u) => (
                  <SlackIdRow key={u.id} user={u} />
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function SlackIdRow({ user }: { user: UserWithMembership }) {
  const { pushToast } = useStore()
  const [val, setVal] = useState(user.slack_user_id ?? '')
  const [saving, setSaving] = useState(false)
  const dirty = val.trim() !== (user.slack_user_id ?? '')

  async function save() {
    setSaving(true)
    try {
      await setUserSlackId(user.id, val)
      pushToast({ title: 'Saved', variant: 'success' })
    } catch (err) {
      pushToast({ title: 'Save failed', body: errMsg(err), variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <tr className="border-t">
      <td className="px-3 py-2 font-medium">
        <PersonName userId={user.id} name={user.full_name} />
      </td>
      <td className="px-3 py-2 text-muted-foreground">{user.email}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <Input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder="auto (U0…)"
            className="h-8 w-44"
          />
          <Button size="sm" variant="outline" disabled={!dirty || saving} onClick={save}>
            {saving ? '…' : 'Save'}
          </Button>
        </div>
      </td>
    </tr>
  )
}
