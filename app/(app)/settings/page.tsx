import { getCurrentUser } from '@/lib/auth/get-current-user'
import { redirect } from 'next/navigation'
import { SettingsClient } from '@/components/settings/settings-client'

export default async function SettingsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return <SettingsClient user={user} />
}
