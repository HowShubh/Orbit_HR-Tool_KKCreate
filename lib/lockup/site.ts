// Host-based site flavor. The same deployment answers on Orbit's domain and,
// when LOCKUP_HOST is set, on Lockup's own domain (the one printed inside the
// QR stickers). On the Lockup host only the Lockup surface is served and the
// shell is branded Lockup. Server-side only (reads env).

export type SiteFlavor = 'orbit' | 'lockup'

export function isLockupHost(host: string | null | undefined): boolean {
  const lockupHost = (process.env.LOCKUP_HOST || '').trim().toLowerCase()
  if (!lockupHost || !host) return false
  return host.toLowerCase().split(':')[0] === lockupHost.split(':')[0]
}

export function siteFromHost(host: string | null | undefined): SiteFlavor {
  return isLockupHost(host) ? 'lockup' : 'orbit'
}

/** Path prefixes served on the Lockup host; everything else redirects to /lockup. */
export const LOCKUP_SITE_PREFIXES = [
  '/lockup',
  '/tech',
  '/e/',
  '/login',
  '/reset-password',
  '/auth',
  '/api',
  '/profile',
  '/settings',
]

export function isAllowedOnLockupSite(pathname: string): boolean {
  return LOCKUP_SITE_PREFIXES.some(
    (p) => pathname === p || pathname === p.replace(/\/$/, '') || pathname.startsWith(p.endsWith('/') ? p : `${p}/`)
  )
}
