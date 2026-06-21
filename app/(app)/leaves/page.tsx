import { getCurrentUser } from '@/lib/auth/get-current-user'
import { redirect } from 'next/navigation'
import { listLeavesForUser } from '@/lib/queries/leaves'
import { listCompoffForUser } from '@/lib/queries/compoff'
import { listLeaveTypes } from '@/lib/queries/leave-types'
import { createAdminClient } from '@/lib/supabase/admin'
import { currentFiscalYearStart } from '@/lib/date'
import { reconcileCompoffExpiry } from '@/lib/compoff-expiry'
import { MyLeavesClient } from '@/components/leaves/my-leaves-client'

export default async function MyLeavesPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const adminClient = createAdminClient()
  const CURRENT_LEAVE_YEAR = currentFiscalYearStart()
  // Reflect comp-off expiry in the displayed balances.
  await reconcileCompoffExpiry(adminClient, user.id)
  const [leaves, compoff, balancesRes, compoffBalRes, leaveTypes] = await Promise.all([
    listLeavesForUser(user.id, 'all'),
    listCompoffForUser(user.id),
    adminClient
      .from('leave_balances')
      .select('*')
      .eq('user_id', user.id)
      .eq('leave_year', CURRENT_LEAVE_YEAR),
    adminClient
      .from('leave_balances')
      .select('*')
      .eq('user_id', user.id)
      .eq('leave_year', 0),
    listLeaveTypes(),
  ])

  return (
    <MyLeavesClient
      currentUser={user}
      leaves={leaves}
      compoff={compoff}
      balances={balancesRes.data ?? []}
      compoffBalances={compoffBalRes.data ?? []}
      leaveTypes={leaveTypes}
    />
  )
}
