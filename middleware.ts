import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isAllowedOnLockupSite, isLockupHost } from '@/lib/lockup/site'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: use getUser() (not getSession()). getUser validates the token
  // with Supabase and, when the access token has expired, refreshes it and
  // writes the new cookies via setAll above. getSession() only reads the cookie
  // without refreshing, so an expired token would slip past the middleware and
  // then fail server components/actions with "Not authenticated".
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const onLockupSite = isLockupHost(request.headers.get('host'))

  const isPublic =
    pathname.startsWith('/login') ||
    pathname.startsWith('/setup') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/api/setup/') ||
    pathname.startsWith('/api/cron/')

  // Lockup's standalone site serves only the Lockup surface. Anything else
  // (dashboard, leaves, HR console...) lives on Orbit's domain.
  if (onLockupSite && !isPublic && !isAllowedOnLockupSite(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/lockup'
    url.search = ''
    return NextResponse.redirect(url)
  }

  // Unauthenticated user trying to reach a protected route. Preserve the
  // destination so QR scans land back on the item page after sign-in.
  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : ''
    return NextResponse.redirect(url)
  }

  // Authenticated user going to login — redirect home (or where they meant to go)
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    const next = request.nextUrl.searchParams.get('next')
    url.pathname = next && next.startsWith('/') && !next.startsWith('//') ? next : onLockupSite ? '/lockup' : '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
