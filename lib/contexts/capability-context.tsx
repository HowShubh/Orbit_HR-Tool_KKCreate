'use client'

import { createContext, ReactNode, useMemo } from 'react'
import { buildCanFromRole, type CanHelpers } from '@/lib/capabilities/can'
import type { Role } from '@/lib/capabilities/bundles'

interface CapabilityContextShape {
  can: CanHelpers
  role: Role
  userId: string
}

export const CapabilityContext = createContext<CapabilityContextShape | null>(null)

interface CapabilityProviderProps {
  userId: string
  role: Role
  ledTeamIds: string[]
  membersByTeam: Record<string, string[]>
  grantedCapabilityKeys?: string[]
  children: ReactNode
}

export function CapabilityProvider({
  userId,
  role,
  ledTeamIds,
  membersByTeam,
  grantedCapabilityKeys = [],
  children,
}: CapabilityProviderProps) {
  const can = useMemo(
    () => buildCanFromRole(userId, role, ledTeamIds, membersByTeam, grantedCapabilityKeys),
    [userId, role, ledTeamIds, membersByTeam, grantedCapabilityKeys]
  )

  const value = useMemo(
    () => ({ can, role, userId }),
    [can, role, userId]
  )

  return (
    <CapabilityContext.Provider value={value}>
      {children}
    </CapabilityContext.Provider>
  )
}
