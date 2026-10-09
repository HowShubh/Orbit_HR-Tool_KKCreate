import { NextResponse } from 'next/server'
import { format, parseISO } from 'date-fns'
import { createAdminClient } from '@/lib/supabase/admin'
import { listLeavesToday } from '@/lib/queries/leaves'
import { getSlackSettings, postToWhereabouts, slackMention } from '@/lib/slack'
import { todayIST } from '@/lib/date'

/**
 * Daily morning digest: posts who's out / working from home today to the
 * #whereabouts Slack channel. Skips posting when nobody is out.
 *
 * Scheduled once a day via vercel.json (10:50 IST = 05:20 UTC) — this and the
 * reconcile-compoff job are the only two crons, so it fits the Vercel Hobby
 * limit (2 cron jobs, once per day). Secured with CRON_SECRET. No-ops without a
 * Slack token, and respects the HR daily-digest toggle.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const admin = createAdminClient()
    if (!(await getSlackSettings(admin)).dailyDigest) {
      return NextResponse.json({ ok: true, posted: false, reason: 'disabled' })
    }

    const leaves = await listLeavesToday()
    if (leaves.length === 0) {
      return NextResponse.json({ ok: true, posted: false, count: 0 })
    }

    // Look up the people once for @mentions and their role/designation.
    const userIds = Array.from(new Set(leaves.map((l) => l.user_id)))
    const { data: users } = await admin
      .from('users')
      .select('id, full_name, designation, slack_user_id, email')
      .in('id', userIds)
    const userById = new Map((users ?? []).map((u) => [u.id, u]))

    // One numbered, blockquoted line per person in a category (deduped per user).
    async function group(match: (category: string) => boolean): Promise<string[]> {
      const seen = new Set<string>()
      const out: string[] = []
      for (const l of leaves) {
        if (!match(l.type_category) || seen.has(l.user_id)) continue
        seen.add(l.user_id)
        const u = userById.get(l.user_id)
        const mention = u ? await slackMention(admin, u) : `*${l.user_full_name}*`
        const role = u?.designation ? `, ${u.designation}` : ''
        const half = Number(l.days_deducted) === 0.5 ? ' (half day)' : ''
        out.push(`> ${out.length + 1}. ${mention}${role}${half}`)
      }
      return out
    }

    const onLeave = await group((c) => c === 'leave')
    const compoffLeave = await group((c) => c === 'compoff_leave')
    const wfh = await group((c) => c === 'wfh')
    const compoffWfh = await group((c) => c === 'compoff_wfh')

    const totalPeople = onLeave.length + compoffLeave.length + wfh.length + compoffWfh.length
    if (totalPeople === 0) {
      return NextResponse.json({ ok: true, posted: false, count: 0 })
    }

    const header = format(parseISO(todayIST()), 'EEE, d MMM yyyy')
    const sections = [`*Daily #whereabouts-kkcreate digest — ${header}*`]
    if (onLeave.length) sections.push(`\n*On leave 🌴*\n${onLeave.join('\n')}`)
    if (compoffLeave.length) sections.push(`\n*On comp-off leave 🌴*\n${compoffLeave.join('\n')}`)
    if (wfh.length) sections.push(`\n*On WFH 🏠*\n${wfh.join('\n')}`)
    if (compoffWfh.length) sections.push(`\n*On Comp-off WFH 🏠*\n${compoffWfh.join('\n')}`)
    await postToWhereabouts(sections.join('\n'))

    return NextResponse.json({ ok: true, posted: true, count: totalPeople })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Whereabouts digest failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
