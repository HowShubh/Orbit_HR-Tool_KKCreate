import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getMyProfileContext } from '@/lib/queries/users'
import { ProfileClient } from '@/components/profile/profile-client'

export default async function ProfilePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { teams, managerName, directReports } = await getMyProfileContext(
    user.id,
    user.manager_id
  )

  return (
    <ProfileClient
      user={user}
      teams={teams}
      managerName={managerName}
      directReports={directReports}
    />
  )
}
