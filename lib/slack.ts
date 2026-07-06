import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

type AdminClient = SupabaseClient<Database>

// The whole Slack integration is optional: with no bot token configured every
// function below quietly no-ops, so Orbit behaves exactly as before. Nothing in
// here ever throws — a Slack outage must never break a leave action or a cron.

const SLACK_API = 'https://slack.com/api'

function botToken() {
  return process.env.SLACK_BOT_TOKEN || ''
}

/** Low-level Slack Web API call. Returns the parsed JSON, or null on failure. */
export async function slackApi(
  method: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; [k: string]: unknown } | null> {
  const token = botToken()
  if (!token) return null
  try {
    // Use form-encoding, not JSON. Slack's read methods (e.g.
    // users.lookupByEmail) reject a JSON body with `invalid_arguments`; only a
    // few write methods accept JSON. Form-encoding works for every method we use.
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
      console.error(`[slack] ${method} failed:`, json.error)
    }
    return json
  } catch (err) {
    console.error(`[slack] ${method} threw:`, err)
    return null
  }
}

/**
 * The channel for whereabouts posts. SLACK_TEST_CHANNEL (if set) overrides the
 * real channel so testing never posts to the live #whereabouts. Unset in
 * production => normal behaviour.
 */
export function whereaboutsChannel(): string {
  return (process.env.SLACK_TEST_CHANNEL || process.env.SLACK_WHEREABOUTS_CHANNEL || '').trim()
}

/** Post a message to the #whereabouts channel. No-op without bot token/channel. */
export async function postToWhereabouts(text: string): Promise<void> {
  const channel = whereaboutsChannel()
  if (!botToken() || !channel) return
  await slackApi('chat.postMessage', { channel, text, unfurl_links: false })
}

export type SlackSettings = {
  dmEnabled: boolean
  whereaboutsOnApproval: boolean
  dailyDigest: boolean
}

/**
 * Runtime feature toggles from app_settings (singleton). Defaults everything to
 * ON when the row/table is missing, so behaviour matches the pre-toggle state.
 */
export async function getSlackSettings(admin: AdminClient): Promise<SlackSettings> {
  const { data } = await admin
    .from('app_settings')
    .select('slack_dm_enabled, slack_whereabouts_on_approval, slack_daily_digest')
    .eq('id', 1)
    .maybeSingle()
  return {
    dmEnabled: data?.slack_dm_enabled ?? true,
    whereaboutsOnApproval: data?.slack_whereabouts_on_approval ?? true,
    dailyDigest: data?.slack_daily_digest ?? true,
  }
}

/** Post to #whereabouts only when the "on approval" toggle is enabled. */
export async function postWhereaboutsOnApproval(admin: AdminClient, text: string): Promise<void> {
  if (!botToken()) return
  const settings = await getSlackSettings(admin)
  if (!settings.whereaboutsOnApproval) return
  await postToWhereabouts(text)
}

/**
 * Resolve a user's Slack member id: prefer the stored `slack_user_id`, else look
 * them up by email and cache the result back onto the row. Returns null if it
 * can't be resolved (e.g. no email match / lookup not permitted).
 */
export async function resolveSlackUserId(
  admin: AdminClient,
  user: { id: string; slack_user_id?: string | null; email?: string | null }
): Promise<string | null> {
  if (user.slack_user_id) return user.slack_user_id
  if (!botToken() || !user.email) return null

  const res = await slackApi('users.lookupByEmail', { email: user.email })
  const slackId =
    res && res.ok && typeof (res.user as { id?: string })?.id === 'string'
      ? (res.user as { id: string }).id
      : null
  if (!slackId) return null

  // Cache for next time (best effort).
  await admin.from('users').update({ slack_user_id: slackId }).eq('id', user.id)
  return slackId
}

/**
 * Returns a Slack mention `<@id>` for a user so the channel post tags them
 * (disambiguates same-named people). Falls back to their bold name when no
 * Slack id can be resolved (or Slack isn't configured).
 */
export async function slackMention(
  admin: AdminClient,
  user: { id: string; full_name: string; slack_user_id?: string | null; email?: string | null }
): Promise<string> {
  const id = await resolveSlackUserId(admin, user)
  return id ? `<@${id}>` : `*${user.full_name}*`
}

/**
 * Mention a user by id, loading the fields slackMention needs. Convenient when
 * the caller only has a user id (or a partial row without email / slack id).
 */
export async function slackMentionById(admin: AdminClient, userId: string): Promise<string> {
  const { data } = await admin
    .from('users')
    .select('id, full_name, email, slack_user_id')
    .eq('id', userId)
    .maybeSingle()
  if (!data) return 'someone'
  return slackMention(admin, data)
}

/** DM a user. Resolves their Slack id (email fallback), opens an IM, posts. */
export async function dmSlackUser(
  admin: AdminClient,
  user: { id: string; slack_user_id?: string | null; email?: string | null },
  text: string
): Promise<void> {
  if (!botToken()) return

  // TEST MODE: SLACK_TEST_DM_TO (a Slack user id) redirects EVERY DM to that one
  // person, labeled with the intended recipient — so testing never pings real
  // employees. Unset in production => normal per-recipient DMs.
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

  const opened = await slackApi('conversations.open', { users: slackId })
  const channelId =
    opened && opened.ok
      ? (opened.channel as { id?: string } | undefined)?.id
      : undefined
  if (!channelId) return

  await slackApi('chat.postMessage', { channel: channelId, text: outText, unfurl_links: false })
}
