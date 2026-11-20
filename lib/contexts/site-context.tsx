'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { SiteFlavor } from '@/lib/lockup/site'

// Which website is this render serving: Orbit (full HR app) or the standalone
// Lockup site (same deployment + database, Lockup-only surface and branding).
const SiteContext = createContext<SiteFlavor>('orbit')

export function SiteProvider({ site, children }: { site: SiteFlavor; children: ReactNode }) {
  return <SiteContext.Provider value={site}>{children}</SiteContext.Provider>
}

export function useSite(): SiteFlavor {
  return useContext(SiteContext)
}
