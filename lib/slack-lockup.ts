import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

type AdminClient = SupabaseClient<Database>

// Lockup has its own Slack bot identity, separate from the Orbit HR bot
// (lib/slack.ts). Same conventions: with no token configured every function
// silently no-ops, and nothing in here ever throws — a Slack outage must never
// break a checkout or a cron.

const SLACK_API = 'https://slack.com/api'

function botToken() {
  return process.env.LOCKUP_SLACK_BOT_TOKEN || ''
}

/** Base URL used in links inside Lockup Slack messages. Prefers Lockup's own
 *  domain (the one on the QR stickers), falls back to Orbit's. */
export function lockupBaseUrl(): string {
  return (process.env.LOCKUP_QR_BASE_URL || process.env.APP_BASE_URL || '').replace(/\/$/, '')
}

export function lockupLink(path: string, label: string): string | null {
  const base = lockupBaseUrl()
  return base ? `<${base}${path}|${label}>` : null
}

/** Low-level Lockup-bot Web API call. Returns the parsed JSON, or null when
 *  the token is missing / the request threw. Also used by the Tech Console
 *  Slack-controls actions (auth.test, users.list). */
export async function lockupSlackApi(
  method: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; [k: string]: unknown } | null> {
  const token = botToken()
  if (!token) return null
  try {
    // Form-encoding, not JSON — see lib/slack.ts for why.
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined && value !== null) params.append(key, String(value))
    }
    const res = await fetch(`${SLACK_API}/${method}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
        Authorization: `Bearer ${token}`,
      },
      body: params,
    })
    const json = (await res.json()) as { ok: boolean; error?: string }
    if (!json.ok) {
      console.error(`[slack-lockup] ${method} failed:`, json.error)
    }
    return json
  } catch (err) {
    console.error(`[slack-lockup] ${method} threw:`, err)
    return null
  }
}

export type LockupSlackSettings = {
  dmEnabled: boolean
  remindersEnabled: boolean
  channelFeed: boolean
}

/**
 * Runtime feature toggles from equipment_settings (singleton), editable in the
 * Tech Console Slack tab. Defaults everything to ON when the row/table is
 * missing, so behaviour matches the pre-toggle state.
 */
export async function getLockupSlackSettings(admin: AdminClient): Promise<LockupSlackSettings> {
  const { data } = await admin
    .from('equipment_settings')
    .select('slack_dm_enabled, slack_reminders_enabled, slack_channel_feed')
    .eq('id', 1)
    .maybeSingle()
  return {
    dmEnabled: data?.slack_dm_enabled ?? true,
    remindersEnabled: data?.slack_reminders_enabled ?? true,
    channelFeed: data?.slack_channel_feed ?? true,
  }
}

export async function resolveSlackUserId(
  admin: AdminClient,
  user: { id: string; slack_user_id?: string | null; email?: string | null }
): Promise<string | null> {
  // Same Slack workspace as the HR bot, so the cached users.slack_user_id is shared.
  if (user.slack_user_id) return user.slack_user_id
  if (!botToken() || !user.email) return null

  const res = await lockupSlackApi('users.lookupByEmail', { email: user.email })
  const slackId =
    res && res.ok && typeof (res.user as { id?: string })?.id === 'string'
      ? (res.user as { id: string }).id
      : null
  if (!slackId) return null

  await admin.from('users').update({ slack_user_id: slackId }).eq('id', user.id)
  return slackId
}

/**
 * DM one user from the Lockup bot. No-op without a token or resolvable id, or
 * when the matching Tech Console toggle is off. `kind` picks the toggle:
 * 'instant' (action-triggered DMs) or 'reminder' (daily sweep DMs).
 */
export async function dmLockupUser(
  admin: AdminClient,
  user: { id: string; slack_user_id?: string | null; email?: string | null },
  text: string,
  kind: 'instant' | 'reminder' = 'instant'
): Promise<void> {
  if (!botToken()) return
  const settings = await getLockupSlackSettings(admin)
  if (kind === 'reminder' ? !settings.remindersEnabled : !settings.dmEnabled) return

  // TEST MODE: SLACK_TEST_DM_TO redirects every DM to one Slack user id,
  // labeled with the intended recipient — same convention as the HR bot.
  const testTo = (process.env.SLACK_TEST_DM_TO || '').trim()
  let slackId: string | null
  let outText = text
  if (testTo) {
    slackId = testTo
    const { data } = await admin
      .from('users')
      .select('full_name, email')
      .eq('id', user.id)
      .maybeSingle()
    const who = data?.full_name ?? user.email ?? user.id
    outText = `🧪 *[TEST DM → ${who}]*\n${text}`
  } else {
    slackId = await resolveSlackUserId(admin, user)
  }
  if (!slackId) return

  const opened = await lockupSlackApi('conversations.open', { users: slackId })
  const channelId =
    opened && opened.ok
      ? (opened.channel as { id?: string } | undefined)?.id
      : undefined
  if (!channelId) return

  await lockupSlackApi('chat.postMessage', {
    channel: channelId,
    text: outText,
    unfurl_links: false,
  })
}

/** Optional public activity feed. No-op unless LOCKUP_SLACK_CHANNEL is set
 *  and the Tech Console "channel feed" toggle is on. */
export async function postLockupChannel(admin: AdminClient, text: string): Promise<void> {
  const channel = process.env.LOCKUP_SLACK_CHANNEL
  if (!botToken() || !channel) return
  const settings = await getLockupSlackSettings(admin)
  if (!settings.channelFeed) return
  await lockupSlackApi('chat.postMessage', { channel, text, unfurl_links: false })
}
