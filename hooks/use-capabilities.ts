'use client'

import { useContext } from 'react'
import { CapabilityContext } from '@/lib/contexts/capability-context'

export function useCapabilities() {
  const ctx = useContext(CapabilityContext)
  if (!ctx) throw new Error('useCapabilities must be inside CapabilityProvider')
  return ctx
}
