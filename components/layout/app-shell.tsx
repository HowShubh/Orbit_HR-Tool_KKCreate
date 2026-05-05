'use client'

import { ReactNode } from 'react'
import { Sidebar } from '@/components/layout/sidebar'
import { BottomNav } from '@/components/layout/bottom-nav'
import { RefreshOnFocus } from '@/components/layout/refresh-on-focus'
import { StoreProvider } from '@/lib/store'
import { CapabilityProvider } from '@/lib/contexts/capability-context'
import type { Tables } from '@/lib/supabase/database.types'

interface AppShellProps {
  currentUser: Tables<'users'>
  ledTeamIds: string[]
  membersByTeam: Record<string, string[]>
  children: ReactNode
}

export function AppShell({
  currentUser,
  ledTeamIds,
  membersByTeam,
  children,
}: AppShellProps) {
  return (
    <StoreProvider realUser={currentUser}>
      <CapabilityProvider
        userId={currentUser.id}
        role={currentUser.role}
        ledTeamIds={ledTeamIds}
        membersByTeam={membersByTeam}
      >
        <RefreshOnFocus />
        <div className="min-h-screen bg-background flex">
          <Sidebar />
          <main className="flex-1 min-w-0 pb-20 lg:pb-0">{children}</main>
          <BottomNav />
        </div>
      </CapabilityProvider>
    </StoreProvider>
  )
}
