import type { Tables } from '@/lib/supabase/database.types'
import type { LeaveTypeCategory } from '@/lib/leave-types'
import type { ProfileTeam } from '@/lib/queries/users'

export type PersonLeaveRow = Tables<'leaves'> & {
  type_name: string
  type_category: LeaveTypeCategory
}

/**
 * A balance bucket, already resolved to the name this viewer is allowed to see.
 * Buckets for private policies are dropped upstream for viewers who aren't the
 * person themselves or HR.
 */
export type PersonBalanceRow = Tables<'leave_balances'> & {
  type_name: string
}

export type PersonLeaveProfile = {
  user: Tables<'users'>
  managerName: string | null
  teams: ProfileTeam[]
  directReports: { id: string; full_name: string }[]
  balances: PersonBalanceRow[]
  leaves: PersonLeaveRow[]
  compoff: Tables<'compoff_grants'>[]
}
