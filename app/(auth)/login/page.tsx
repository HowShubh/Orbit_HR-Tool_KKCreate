import { headers } from 'next/headers'
import { siteFromHost } from '@/lib/lockup/site'
import { LoginClient } from './login-client'

/**
 * Server wrapper: decides the branding (Orbit vs the standalone Lockup site)
 * from the request host and forwards the post-login destination. The QR
 * stickers rely on `?next=` so a scan lands back on the item page after
 * sign-in.
 */
export default function LoginPage({
  searchParams,
}: {
  searchParams?: { next?: string; error?: string }
}) {
  const rawNext = searchParams?.next
  const next = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : null

  return <LoginClient site={siteFromHost(headers().get('host'))} next={next} />
}
