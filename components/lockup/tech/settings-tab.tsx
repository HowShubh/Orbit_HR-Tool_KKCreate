'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useStore } from '@/lib/store'
import { updateOverdueEscalation } from '@/lib/actions/lockup'
import type { LockupSlackSettings } from '@/lib/slack-lockup'

/**
 * Lockup's own settings, separate from Slack. Overdue escalation and the tech
 * lead used to live under the Slack tab, where they vanished whenever Slack was
 * off, even though the tech lead is the approver and first escalation target
 * regardless of Slack. This is their proper home.
 */
export function LockupSettingsTab({
  settings,
  people,
}: {
  settings: LockupSlackSettings
  people: { id: string; full_name: string }[]
}) {
  const { pushToast } = useStore()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [leadId, setLeadId] = useState(settings.techLeadUserId ?? '')
  const [leadDays, setLeadDays] = useState(settings.escalateToLeadsAfterDays)
  const [channelDays, setChannelDays] = useState(settings.escalateToChannelAfterDays)

  async function save() {
    setBusy(true)
    try {
      await updateOverdueEscalation({
        techLeadUserId: leadId || null,
        leadsAfterDays: leadDays,
        channelAfterDays: channelDays,
      })
      pushToast({ title: 'Settings saved', variant: 'success' })
      router.refresh()
    } catch (err) {
      pushToast({
        title: 'Could not save',
        body: err instanceof Error ? err.message : 'Something went wrong',
        variant: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <div className="text-sm font-semibold">Tech lead</div>
            <p className="text-[12px] text-muted-foreground">
              Who owns Lockup day to day: they get the first overdue escalation and are the default
              approver for flagged gear.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[12.5px] font-medium" htmlFor="tech-lead">
              Assigned to
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
              Leave unset and escalations go to everyone with manage_equipment instead.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div>
            <div className="text-sm font-semibold">When gear goes overdue</div>
            <p className="text-[12px] text-muted-foreground">
              The holder is reminded every day regardless. These are the extra escalation steps.
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

          <Button size="sm" disabled={busy} onClick={save}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save settings
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
