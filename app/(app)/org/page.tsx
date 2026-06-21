import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getOrgTree } from '@/lib/queries/org'
import { listTeams } from '@/lib/queries/teams'
import { OrgClient } from '@/components/org/org-client'

export default async function OrgPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const [tree, teams] = await Promise.all([getOrgTree(), listTeams()])

  return (
    <OrgClient
      currentUserId={user.id}
      roots={tree.roots}
      orphans={tree.orphans}
      teams={teams}
    />
  )
}
