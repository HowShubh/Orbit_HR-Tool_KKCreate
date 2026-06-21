import type { Tables } from '@/lib/supabase/database.types'
import type { LeaveTypeCategory } from '@/lib/leave-types'
import type { ProfileTeam } from '@/lib/queries/users'

export type PersonLeaveRow = Tables<'leaves'> & {
  type_name: string
  type_category: LeaveTypeCategory
}

export type PersonLeaveProfile = {
  user: Tables<'users'>
  managerName: string | null
  teams: ProfileTeam[]
  directReports: { id: string; full_name: string }[]
  balances: Tables<'leave_balances'>[]
  leaves: PersonLeaveRow[]
  compoff: Tables<'compoff_grants'>[]
}
