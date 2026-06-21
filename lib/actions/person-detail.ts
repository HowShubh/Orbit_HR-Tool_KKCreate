'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireCapability } from './_helpers'
import { getMyProfileContext } from '@/lib/queries/users'
import { listLeaveTypes } from '@/lib/queries/leave-types'
import { reconcileCompoffExpiry } from '@/lib/compoff-expiry'
import { leaveTypeCategory, leaveTypeLabel, COMPOFF_YEAR } from '@/lib/leave-types'
import { currentFiscalYearStart } from '@/lib/date'
import type { PersonLeaveProfile, PersonLeaveRow } from '@/lib/person-detail-types'

/**
 * Everything about one person's time off, for the HR user drawer and the team
 * member expander. Authorized by `view_leaves` scope: HR/Founders see anyone,
 * team leads see members of teams they lead, and a person can see themselves.
 */
export async function getUserLeaveProfile(targetUserId: string): Promise<PersonLeaveProfile> {
  await requireCapability('view_leaves', targetUserId)

  const adminClient = createAdminClient()
  // Reflect comp-off expiry before reading balances/grants.
  await reconcileCompoffExpiry(adminClient, targetUserId)

  const policies = await listLeaveTypes()

  const [userRes, leavesRes, compoffRes, balancesRes] = await Promise.all([
    adminClient.from('users').select('*').eq('id', targetUserId).single(),
    adminClient
      .from('leaves')
      .select('*')
      .eq('user_id', targetUserId)
      .order('start_date', { ascending: false }),
    adminClient
      .from('compoff_grants')
      .select('*')
      .eq('user_id', targetUserId)
      .order('work_date', { ascending: false }),
    adminClient
      .from('leave_balances')
      .select('*')
      .eq('user_id', targetUserId)
      .in('leave_year', [currentFiscalYearStart(), COMPOFF_YEAR]),
  ])

  const user = userRes.data
  if (!user) throw new Error('User not found')

  const { teams, managerName, directReports } = await getMyProfileContext(
    targetUserId,
    user.manager_id
  )

  const leaves: PersonLeaveRow[] = (leavesRes.data ?? []).map((l) => ({
    ...l,
    type_name: leaveTypeLabel(l.requested_type ?? l.type, policies),
    type_category: leaveTypeCategory(l.requested_type ?? l.type, policies),
  }))

  return {
    user,
    managerName,
    teams,
    directReports,
    balances: balancesRes.data ?? [],
    leaves,
    compoff: compoffRes.data ?? [],
  }
}
