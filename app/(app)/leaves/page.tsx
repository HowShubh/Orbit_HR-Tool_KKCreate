import { getCurrentUser } from '@/lib/auth/get-current-user'
import { redirect } from 'next/navigation'
import { listLeavesForUser } from '@/lib/queries/leaves'
import { listCompoffForUser } from '@/lib/queries/compoff'
import { createAdminClient } from '@/lib/supabase/admin'
import { MyLeavesClient } from '@/components/leaves/my-leaves-client'

const CURRENT_LEAVE_YEAR = 2026

export default async function MyLeavesPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const adminClient = createAdminClient()
  const [leaves, compoff, balancesRes, compoffBalRes] = await Promise.all([
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
  ])

  return (
    <MyLeavesClient
      currentUser={user}
      leaves={leaves}
      compoff={compoff}
      balances={balancesRes.data ?? []}
      compoffBalances={compoffBalRes.data ?? []}
    />
  )
}
