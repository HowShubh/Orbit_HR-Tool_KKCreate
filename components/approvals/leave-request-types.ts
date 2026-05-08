import type { Tables } from '@/lib/supabase/database.types'
import type { LeaveTypeCategory } from '@/lib/leave-types'

export type LeaveDayType = string
export type LeaveRequestStatus = Tables<'leave_requests'>['status']

export type LeaveRequestDay = {
  leave_id: string
  date: string                  // YYYY-MM-DD
  type: LeaveDayType
  type_name: string
  type_category: LeaveTypeCategory
  days_deducted: number
  half_day_position: 'first_half' | 'second_half' | null
}

export type LeaveRequestSummary = {
  leave_days: number            // sum of days_deducted for {leave, compoff_leave}
  wfh_days: number              // sum for {wfh, compoff_wfh}
  start_date: string
  end_date: string
}

export type LeaveRequestConflict = {
  date: string
  teammate_count: number        // distinct other teammates with active|pending leave/wfh covering this date
}

export type LeaveRequestWithDays = {
  id: string                    // leave_requests.id, or `legacy:<leave_id>` for ungrouped legacy rows
  user_id: string
  user_full_name: string
  user_team_id: string | null
  user_team_name: string | null
  status: LeaveRequestStatus
  reason: string | null
  created_at: string
  decided_at: string | null
  days: LeaveRequestDay[]
  summary: LeaveRequestSummary
  conflicts: LeaveRequestConflict[]
  /** ID to pass to approveLeave/rejectLeave. For grouped requests, any leave_id works (action follows request_id). */
  decision_leave_id: string
}

export type RosterCellType = LeaveDayType | 'holiday'

export type RosterCell = {
  user_id: string
  user_full_name: string
  date: string                  // YYYY-MM-DD
  type: RosterCellType
  type_name?: string
  type_category?: LeaveTypeCategory
  half_day_position: 'first_half' | 'second_half' | null
}

export type ApprovalQueueScope = 'hr' | 'team'
