'use server'

import { ActionError } from './errors'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCapability, writeAudit, revalidateHR } from './_helpers'
import { slackApi, resolveSlackUserId } from '@/lib/slack'

const TOGGLE_KEYS = [
  'slack_dm_enabled',
  'slack_whereabouts_on_approval',
  'slack_daily_digest',
] as const
type ToggleKey = (typeof TOGGLE_KEYS)[number]

/** Flip one of the Slack feature toggles (app_settings singleton). */
export async function updateSlackSetting(key: ToggleKey, value: boolean) {
  const actor = await requireCapability('manage_users')
  if (!TOGGLE_KEYS.includes(key)) throw new ActionError('Unknown setting')

  const admin = createAdminClient()
  const base = { id: 1, updated_at: new Date().toISOString() }
  const payload =
    key === 'slack_dm_enabled'
      ? { ...base, slack_dm_enabled: value }
      : key === 'slack_whereabouts_on_approval'
        ? { ...base, slack_whereabouts_on_approval: value }
        : { ...base, slack_daily_digest: value }
  const { error } = await admin.from('app_settings').upsert(payload)
  if (error) throw new ActionError(error.message)

  await writeAudit(actor.id, 'slack.setting_update', 'app_settings', '1', {
    after: { [key]: value },
  })
  await revalidateHR()
}

/**
 * Set a user's Slack member id from the HR Console. Writes the SAME
 * `users.slack_user_id` column the profile uses, so the two stay in sync.
 */
export async function setUserSlackId(userId: string, slackId: string | null) {
  const actor = await requireCapability('manage_users')
  const admin = createAdminClient()
  const value = slackId && slackId.trim() ? slackId.trim() : null

  const { error } = await admin.from('users').update({ slack_user_id: value }).eq('id', userId)
  if (error) throw new ActionError(error.message)

  await writeAudit(actor.id, 'user.slack_id_update', 'user', userId, {
    after: { slack_user_id: value },
  })
  await revalidateHR()
  return value
}

/**
 * Bulk-fill Slack member ids by matching each active user's Orbit email to a
 * Slack account (users.lookupByEmail). Only fills users who don't have one yet.
 */
export async function syncSlackIdsByEmail() {
  const actor = await requireCapability('manage_users')
  if (!process.env.SLACK_BOT_TOKEN) {
    throw new ActionError('Slack bot token is not configured.')
  }

  const admin = createAdminClient()
  const { data: users } = await admin
    .from('users')
    .select('id, email, slack_user_id')
    .eq('status', 'active')

  let matched = 0
  let already = 0
  let unmatched = 0
  for (const u of users ?? []) {
    if (u.slack_user_id) {
      already++
      continue
    }
    const id = await resolveSlackUserId(admin, u) // looks up by email + caches the id
    if (id) matched++
    else unmatched++
  }

  await writeAudit(actor.id, 'slack.sync_ids', 'app_settings', '1', {
    after: { matched, already, unmatched },
  })
  await revalidateHR()
  return { matched, already, unmatched }
}

/** Post a one-off test message to the configured channel so HR can confirm wiring. */
export async function sendSlackTestMessage() {
  await requireCapability('manage_users')
  const channel = process.env.SLACK_WHEREABOUTS_CHANNEL
  if (!process.env.SLACK_BOT_TOKEN) throw new ActionError('Slack bot token is not configured.')
  if (!channel) throw new ActionError('Slack channel (SLACK_WHEREABOUTS_CHANNEL) is not configured.')

  const res = await slackApi('chat.postMessage', {
    channel,
    text: '✅ Orbit is connected to this channel. (Test message sent from the HR Console.)',
    unfurl_links: false,
  })
  if (!res?.ok) throw new ActionError(`Slack rejected the message: ${res?.error ?? 'unknown error'}`)
  return { ok: true }
}

/** Read-only health check shown at the top of the Slack tab. */
export async function getSlackConnectionStatus() {
  await requireCapability('manage_users')
  const tokenSet = Boolean(process.env.SLACK_BOT_TOKEN)
  const channelSet = Boolean(process.env.SLACK_WHEREABOUTS_CHANNEL)
  if (!tokenSet) {
    return { tokenSet, channelSet, ok: false, team: null, botUser: null, error: null }
  }

  const res = await slackApi('auth.test', {})
  return {
    tokenSet,
    channelSet,
    ok: Boolean(res?.ok),
    team: (res?.team as string | undefined) ?? null,
    botUser: (res?.user as string | undefined) ?? null,
    error: (res?.error as string | undefined) ?? null,
  }
}
