'use client'

import { ReactNode } from 'react'
import { Sidebar } from '@/components/layout/sidebar'
import { BottomNav } from '@/components/layout/bottom-nav'
import { RefreshOnFocus } from '@/components/layout/refresh-on-focus'
import { StoreProvider } from '@/lib/store'
import { CapabilityProvider } from '@/lib/contexts/capability-context'
import { SiteProvider } from '@/lib/contexts/site-context'
import type { SiteFlavor } from '@/lib/lockup/site'
import type { Tables } from '@/lib/supabase/database.types'

interface AppShellProps {
  currentUser: Tables<'users'>
  ledTeamIds: string[]
  membersByTeam: Record<string, string[]>
  grantedCapabilityKeys?: string[]
  notifications: Tables<'notifications'>[]
  pendingCompoffCount: number
  site?: SiteFlavor
  children: ReactNode
}

export function AppShell({
  currentUser,
  ledTeamIds,
  membersByTeam,
  grantedCapabilityKeys,
  notifications,
  pendingCompoffCount,
  site = 'orbit',
  children,
}: AppShellProps) {
  return (
    <StoreProvider realUser={currentUser} realNotifications={notifications}>
      <CapabilityProvider
        userId={currentUser.id}
        role={currentUser.role}
        ledTeamIds={ledTeamIds}
        membersByTeam={membersByTeam}
        grantedCapabilityKeys={grantedCapabilityKeys}
      >
        <SiteProvider site={site}>
          <RefreshOnFocus />
          <div className="min-h-screen bg-background flex">
            <Sidebar pendingCompoffCount={pendingCompoffCount} />
            <main className="flex-1 min-w-0 pb-20 lg:pb-0">{children}</main>
            <BottomNav />
          </div>
        </SiteProvider>
      </CapabilityProvider>
    </StoreProvider>
  )
}
