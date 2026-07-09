import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runLockupSweep } from '@/lib/lockup/sweep'

/**
 * Daily Lockup job: due-today + overdue reminders (holders and the equipment
 * managers' digest), auto-expiry of reservations not picked up within 24h of
 * shoot start, and "repair expected back today" reminders.
 *
 * Scheduled via vercel.json. Secured with CRON_SECRET: Vercel Cron sends
 * `Authorization: Bearer <CRON_SECRET>` when that env var is set.
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
    const adminClient = createAdminClient()
    const result = await runLockupSweep(adminClient)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sweep failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
