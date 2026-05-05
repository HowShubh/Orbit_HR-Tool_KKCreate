'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

/**
 * When the user returns to the tab/window after being away (or wakes a sleeping
 * laptop), refresh the current Server Component tree so they see fresh data
 * instead of a stale snapshot from before they left.
 *
 * Triggers on:
 *  - tab visibility change (visibilitychange)
 *  - window regaining focus (focus)
 *
 * Throttled: won't refresh more than once every 30 seconds, and only if the
 * user has actually been away. This avoids spamming refreshes when the user
 * is alt-tabbing rapidly.
 */
const STALE_AFTER_MS = 30_000

export function RefreshOnFocus() {
  const router = useRouter()
  const lastActiveAt = useRef<number>(Date.now())

  useEffect(() => {
    function maybeRefresh() {
      const now = Date.now()
      const awayFor = now - lastActiveAt.current
      lastActiveAt.current = now
      if (awayFor > STALE_AFTER_MS) {
        router.refresh()
      }
    }

    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        lastActiveAt.current = Date.now()
      } else {
        maybeRefresh()
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', maybeRefresh)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', maybeRefresh)
    }
  }, [router])

  return null
}
