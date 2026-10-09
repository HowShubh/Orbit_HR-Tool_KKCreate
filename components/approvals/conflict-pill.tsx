'use client'

import { format, parseISO } from 'date-fns'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LeaveRequestConflict } from './leave-request-types'

export function ConflictPill({
  conflicts,
  className,
}: {
  conflicts: LeaveRequestConflict[]
  className?: string
}) {
  if (conflicts.length === 0) return null

  // Show a short summary: "1 teammate also out Mon May 12" or "Conflicts on 3 days"
  const text =
    conflicts.length === 1
      ? `${conflicts[0].teammate_count} teammate${
          conflicts[0].teammate_count > 1 ? 's' : ''
        } also out ${format(parseISO(conflicts[0].date), 'EEE MMM d')}`
      : `Conflicts on ${conflicts.length} days`

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900 ring-1 ring-inset ring-amber-200',
        className
      )}
    >
      <AlertTriangle className="h-3 w-3" />
      {text}
    </span>
  )
}
