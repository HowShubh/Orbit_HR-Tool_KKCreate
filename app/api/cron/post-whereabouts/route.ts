import { NextResponse } from 'next/server'
import { format, parseISO } from 'date-fns'
import { createAdminClient } from '@/lib/supabase/admin'
import { listLeavesToday } from '@/lib/queries/leaves'
import { isAwayCategory, isWfhCategory } from '@/lib/leave-types'
import { getSlackSettings, postToWhereabouts } from '@/lib/slack'
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
    const label = (name: string, halfDay: boolean) => (halfDay ? `${name} (½ day)` : name)
    const dedupe = (arr: string[]) => Array.from(new Set(arr))

    const onLeave = dedupe(
      leaves
        .filter((l) => isAwayCategory(l.type_category))
        .map((l) => label(l.user_full_name, Number(l.days_deducted) === 0.5))
    )
    const wfh = dedupe(
      leaves
        .filter((l) => isWfhCategory(l.type_category))
        .map((l) => label(l.user_full_name, Number(l.days_deducted) === 0.5))
    )

    if (onLeave.length === 0 && wfh.length === 0) {
      return NextResponse.json({ ok: true, posted: false, count: 0 })
    }

    const header = format(parseISO(todayIST()), 'EEE, MMM d')
    const lines = [`*Out today (${header})*`]
    if (onLeave.length) lines.push(`🌴 On leave: ${onLeave.join(', ')}`)
    if (wfh.length) lines.push(`🏠 WFH: ${wfh.join(', ')}`)
    await postToWhereabouts(lines.join('\n'))

    return NextResponse.json({ ok: true, posted: true, count: onLeave.length + wfh.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Whereabouts digest failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
