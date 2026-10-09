import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { reconcileAllCompoffExpiry } from '@/lib/compoff-expiry'

/**
 * Nightly job: debit expired comp-off from every user's balance so HR's global
 * balances stay correct (not just lazily when each user opens their planner).
 *
 * Scheduled via vercel.json. Secured with CRON_SECRET: Vercel Cron sends
 * `Authorization: Bearer <CRON_SECRET>` when that env var is set. If the secret
 * isn't configured the route runs unguarded (set CRON_SECRET in production).
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
    const usersProcessed = await reconcileAllCompoffExpiry(adminClient)
    return NextResponse.json({ ok: true, usersProcessed })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Reconcile failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
