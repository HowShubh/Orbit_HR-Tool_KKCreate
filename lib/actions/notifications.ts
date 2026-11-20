'use server'

import { ActionError } from './errors'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { dmSlackUser, getSlackSettings } from '@/lib/slack'
import { requireUser } from './_helpers'

/** Internal: create a notification row. Used by other server actions. */
export async function notifyUser(input: {
  user_id: string
  type: string
  title: string
  body: string
  link_url?: string
  related_entity_type?: string
  related_entity_id?: string
  /** Also send this as a Slack DM (opt-in; used for leave-lifecycle events). */
  slackDm?: boolean
  /** Richer text for the Slack DM only (e.g. a per-day breakdown). Falls back
   *  to the in-app title/body when omitted. The Orbit link is appended. */
  slackText?: string
  /** Label for the appended Orbit link in the Slack DM. Defaults to "View in Orbit". */
  slackLinkLabel?: string
}): Promise<void> {
  const adminClient = createAdminClient()

  // Respect the recipient's "mute notifications" preference — skip in-app AND
  // Slack notifications entirely for muted users. (They can still see pending
  // items on the dashboard / approval queue; muting only silences these pings.)
  const { data: recipient } = await adminClient
    .from('users')
    .select('notifications_muted')
    .eq('id', input.user_id)
    .single()
  if (recipient?.notifications_muted) return

  await adminClient.from('notifications').insert({
    user_id: input.user_id,
    type: input.type,
    title: input.title,
    body: input.body,
    link_url: input.link_url ?? null,
    related_entity_type: input.related_entity_type ?? null,
    related_entity_id: input.related_entity_id ?? null,
  })

  // Mirror selected events to a Slack DM. Fully gated on the bot token so that
  // without Slack configured we never even read `slack_user_id` (keeps this
  // independent of migration 018). dmSlackUser no-ops on no id and never throws.
  if (input.slackDm && process.env.SLACK_BOT_TOKEN && (await getSlackSettings(adminClient)).dmEnabled) {
    const { data: target } = await adminClient
      .from('users')
      .select('id, email, slack_user_id')
      .eq('id', input.user_id)
      .single()
    if (target) {
      const base = (process.env.APP_BASE_URL ?? '').replace(/\/$/, '')
      const url = base ? `${base}${input.link_url ?? ''}` : null
      // Tidy labeled link, e.g. <https://orbit…|View in Orbit>
      const link = url ? `<${url}|${input.slackLinkLabel ?? 'View in Orbit'}>` : null
      const text = input.slackText
        ? [input.slackText, link].filter(Boolean).join('\n')
        : [`*${input.title}*`, input.body, link].filter(Boolean).join('\n')
      await dmSlackUser(adminClient, target, text)
    }
  }
}

export async function markNotificationRead(notificationId: string) {
  const user = await requireUser()
  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('user_id', user.id)
  if (error) throw new ActionError(error.message)
  revalidatePath('/', 'layout')
}

export async function markAllNotificationsRead() {
  const user = await requireUser()
  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('read_at', null)
  if (error) throw new ActionError(error.message)
  revalidatePath('/', 'layout')
}
