import { listUsers } from '@/lib/queries/users'
import { listTeams } from '@/lib/queries/teams'
import {
  listCapabilities,
  listBundles,
  listUserCapabilities,
} from '@/lib/queries/capabilities'
import { PermissionsClient } from '@/components/permissions/permissions-client'

export default async function PermissionsPage() {
  const [users, teams, capabilities, bundles, userCapabilities] = await Promise.all([
    listUsers(),
    listTeams(),
    listCapabilities(),
    listBundles(),
    listUserCapabilities(),
  ])

  return (
    <PermissionsClient
      users={users}
      teams={teams}
      capabilities={capabilities}
      bundles={bundles}
      userCapabilities={userCapabilities}
    />
  )
}
