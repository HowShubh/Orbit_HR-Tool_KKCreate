'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import { PersonDetailDrawer } from './person-detail-drawer'
import { cn } from '@/lib/utils'

type PersonDrawerContextValue = { open: (userId: string) => void }

const PersonDrawerContext = createContext<PersonDrawerContextValue | null>(null)

/**
 * Renders a single person-detail drawer and lets any descendant open it by user
 * id. Wrap a whole area (e.g. the HR Console) once, then use <PersonName /> or
 * usePersonDrawer() anywhere inside to make names open the profile + leave
 * history drawer — for a consistent "click a name to see the person" UX.
 */
export function PersonDrawerProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null)
  return (
    <PersonDrawerContext.Provider value={{ open: setUserId }}>
      {children}
      <PersonDetailDrawer userId={userId} onClose={() => setUserId(null)} />
    </PersonDrawerContext.Provider>
  )
}

export function usePersonDrawer() {
  return useContext(PersonDrawerContext)
}

/**
 * A person's name that opens the detail drawer when clicked. If there is no
 * PersonDrawerProvider above it (e.g. the same component reused on the
 * dashboard), it renders as plain text, so it's always safe to use.
 */
export function PersonName({
  userId,
  name,
  className,
}: {
  userId: string
  name: string
  className?: string
}) {
  const ctx = usePersonDrawer()
  if (!ctx) return <span className={className}>{name}</span>
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation() // don't trigger a parent row/card click
        ctx.open(userId)
      }}
      title="View profile & leave history"
      className={cn('text-left hover:text-primary hover:underline', className)}
    >
      {name}
    </button>
  )
}
