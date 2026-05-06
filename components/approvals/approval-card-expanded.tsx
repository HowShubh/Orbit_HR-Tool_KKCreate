'use client'

import { useEffect, useState } from 'react'
import { fetchRosterContext } from '@/lib/actions/approvals'
import { TeamRosterGrid } from './team-roster-grid'
import type {
  LeaveRequestWithDays,
  RosterCell,
} from './leave-request-types'

export function ApprovalCardExpanded({ request }: { request: LeaveRequestWithDays }) {
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'ready'; cells: RosterCell[] }
    | { kind: 'error'; message: string }
    | { kind: 'no-team' }
  >(() => (request.user_team_id ? { kind: 'loading' } : { kind: 'no-team' }))

  useEffect(() => {
    let cancelled = false
    if (!request.user_team_id) return
    setState({ kind: 'loading' })
    fetchRosterContext({
      team_id: request.user_team_id,
      start_date: request.summary.start_date,
      end_date: request.summary.end_date,
    })
      .then((cells) => {
        if (!cancelled) setState({ kind: 'ready', cells })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load team context'
          setState({ kind: 'error', message })
        }
      })
    return () => {
      cancelled = true
    }
  }, [request.user_team_id, request.summary.start_date, request.summary.end_date])

  if (state.kind === 'no-team') {
    return (
      <div className="border-t bg-muted/20 p-4 text-[12.5px] text-muted-foreground">
        No team context available for this employee.
      </div>
    )
  }
  if (state.kind === 'loading') {
    return (
      <div className="border-t bg-muted/20 p-4">
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-7 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
    )
  }
  if (state.kind === 'error') {
    return (
      <div className="border-t bg-muted/20 p-4 text-[12.5px] text-rose-600">
        Couldn't load team context — {state.message}.{' '}
        <button
          className="underline"
          onClick={() => setState({ kind: 'loading' })}
        >
          Retry
        </button>
      </div>
    )
  }
  return (
    <div className="border-t bg-muted/20 p-4">
      <TeamRosterGrid
        applicantId={request.user_id}
        applicantName={request.user_full_name}
        applicantDays={request.days}
        rosterCells={state.cells}
        dateRange={{ start: request.summary.start_date, end: request.summary.end_date }}
      />
    </div>
  )
}
