import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/actions/_helpers'
import { getItemProfile, listLockupLocations } from '@/lib/queries/lockup'
import { listMyCapabilityKeys } from '@/lib/queries/capabilities'
import { ItemPage } from '@/components/lockup/item-page'

export default async function LockupItemPage({ params }: { params: { code: string } }) {
  const me = await requireUser()
  const [profile, locations, myCapabilities] = await Promise.all([
    getItemProfile(params.code.toUpperCase()),
    listLockupLocations(),
    listMyCapabilityKeys(me.id),
  ])
  if (!profile) notFound()

  const canManageEquipment =
    me.role === 'hr' || me.role === 'founder' || myCapabilities.includes('manage_equipment')

  return (
    <ItemPage
      profile={profile}
      locations={locations}
      currentUserId={me.id}
      canManageEquipment={canManageEquipment}
    />
  )
}
