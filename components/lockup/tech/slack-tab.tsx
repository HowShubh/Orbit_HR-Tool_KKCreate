'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, AlertTriangle, Send, RefreshCw, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useStore } from '@/lib/store'
import {
  updateOverdueEscalation,
  updateLockupSlackSetting,
  sendLockupSlackTest,
  syncLockupSlackIds,
  getLockupSlackStatus,
} from '@/lib/actions/lockup'
import type { LockupSlackSettings } from '@/lib/slack-lockup'
import { Switch } from '@/components/ui/switch'

type ToggleKey = 'slack_dm_enabled' | 'slack_reminders_enabled' | 'slack_channel_feed'

const TOGGLES: { key: ToggleKey; title: string; desc: string }[] = [
  {
    key: 'slack_dm_enabled',
    title: 'Direct messages',
    desc: 'DM people the moment something happens: approvals, handovers, repairs and expired reservations.',
  },
  {
    key: 'slack_reminders_enabled',
    title: 'Daily reminders',
    desc: 'Morning DMs from the daily sweep: gear due today, overdue items, the manager digest and repairs expected back.',
  },
  {
    key: 'slack_channel_feed',
    title: 'Channel activity feed',
    desc: 'Post checkouts, returns, handovers, studio bookings and repairs to the Lockup channel.',
  },
]

function errMsg(err: unknown) {
  return err instanceof Error ? err.message : 'Something went wrong'
}

export function LockupSlackTab({
  settings,
  people,
}: {
  settings: LockupSlackSettings
  people: { id: string; full_name: string }[]
}) {
  const { pushToast } = useStore()
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [values, setValues] = useState<Record<ToggleKey, boolean>>({
    slack_dm_enabled: settings.dmEnabled,
    slack_reminders_enabled: settings.remindersEnabled,
    slack_channel_feed: settings.channelFeed,
  })

  const [status, setStatus] = useState<Awaited<ReturnType<typeof getLockupSlackStatus>> | null>(null)
  const [checking, setChecking] = useState(true)
  const [busy, setBusy] = useState<'sync' | 'test' | 'escalation' | null>(null)
  const [leadId, setLeadId] = useState(settings.techLeadUserId ?? '')
  const [leadDays, setLeadDays] = useState(settings.escalateToLeadsAfterDays)
  const [channelDays, setChannelDays] = useState(settings.escalateToChannelAfterDays)

  async function saveEscalation() {
    setBusy('escalation')
    try {
      await updateOverdueEscalation({
        techLeadUserId: leadId || null,
        leadsAfterDays: leadDays,
        channelAfterDays: channelDays,
      })
      pushToast({ title: 'Escalation saved', variant: 'success' })
      router.refresh()
    } catch (err) {
      pushToast({ title: 'Could not save', body: errMsg(err), variant: 'error' })
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => {
    getLockupSlackStatus()
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setChecking(false))
  }, [])

  function toggle(key: ToggleKey, value: boolean) {
    setValues((v) => ({ ...v, [key]: value }))
    startTransition(async () => {
      try {
        await updateLockupSlackSetting(key, value)
      } catch (err) {
        setValues((v) => ({ ...v, [key]: !value }))
        pushToast({ title: 'Could not update setting', body: errMsg(err), variant: 'error' })
      }
    })
  }

  async function runSync() {
    setBusy('sync')
    try {
      const r = await syncLockupSlackIds()
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
      const r = await sendLockupSlackTest()
      pushToast({
        title: 'Test message sent',
        body: r.via === 'channel' ? 'Check the Lockup channel.' : 'Check your Slack DMs.',
        variant: 'success',
      })
    } catch (err) {
      pushToast({ title: 'Test failed', body: errMsg(err), variant: 'error' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
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
                <div className="font-semibold">The Lockup bot is not connected</div>
                <p className="text-amber-700">
                  Set <code>LOCKUP_SLACK_BOT_TOKEN</code> in the environment to turn it on.
                  This bot is separate from the Orbit HR bot.
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
                      ? 'Activity channel configured. The bot must be a member of it to post.'
                      : 'No activity channel set (LOCKUP_SLACK_CHANNEL). DMs still work; the feed stays off.'}
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
              <Switch checked={values[t.key]} onCheckedChange={(v) => toggle(t.key, Boolean(v))} />
            </label>
          ))}

          <p className="text-[11.5px] text-muted-foreground">
            These switches turn features on and off instantly. The bot also stays fully off whenever
            its Slack token is missing. In-app notifications are not affected.
          </p>
        </CardContent>
      </Card>

      {/* Overdue escalation */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div>
            <div className="text-sm font-semibold">When gear goes overdue</div>
            <p className="text-[12px] text-muted-foreground">
              The holder is reminded every day regardless. These are the extra steps.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[12.5px] font-medium" htmlFor="tech-lead">
              Tech lead
            </label>
            <select
              id="tech-lead"
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-[13.5px]"
            >
              <option value="">Every equipment manager</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
            <p className="text-[11.5px] text-muted-foreground">
              They get the first escalation. Leave unset and it goes to everyone with
              manage_equipment instead.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <label className="flex-1 space-y-1.5">
              <span className="block text-[12.5px] font-medium">
                Tell the lead and the holder&apos;s manager after
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={leadDays}
                  onChange={(e) => setLeadDays(Number(e.target.value))}
                  className="h-10 w-20 rounded-lg border border-input bg-card px-3 text-[13.5px]"
                />
                <span className="text-[12.5px] text-muted-foreground">days late</span>
              </div>
            </label>
            <label className="flex-1 space-y-1.5">
              <span className="block text-[12.5px] font-medium">Post to the Lockup channel after</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={channelDays}
                  onChange={(e) => setChannelDays(Number(e.target.value))}
                  className="h-10 w-20 rounded-lg border border-input bg-card px-3 text-[13.5px]"
                />
                <span className="text-[12.5px] text-muted-foreground">days late</span>
              </div>
            </label>
          </div>

          <Button size="sm" disabled={busy !== null} onClick={saveEscalation}>
            {busy === 'escalation' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save escalation
          </Button>
        </CardContent>
      </Card>

      {/* Slack member IDs */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">Slack member IDs</div>
              <p className="text-[12px] text-muted-foreground">
                DMs need each person&apos;s Slack ID. People are matched by email automatically;
                this fills any that are missing. IDs are shared with the Orbit bot and can be
                fixed per person in the HR Console.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={runSync} disabled={busy !== null}>
              {busy === 'sync' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sync IDs from email
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
