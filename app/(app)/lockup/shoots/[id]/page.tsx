import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/actions/_helpers'
import {
  getAvailabilityForShoot,
  getShootDetail,
  getStudioSchedule,
  listKits,
  getShootOutstandingGear,
  listLockupLocations,
  listStudios,
} from '@/lib/queries/lockup'
import { listMyCapabilityKeys } from '@/lib/queries/capabilities'
import { listUsers } from '@/lib/queries/users'
import { ShootDetailClient } from '@/components/lockup/shoot-detail'

export default async function ShootDetailPage({ params }: { params: { id: string } }) {
  const me = await requireUser()
  const [
    shoot,
    availability,
    myCapabilities,
    users,
    studios,
    outstandingGear,
    locations,
    kits,
    studioSchedule,
  ] = await Promise.all([
    getShootDetail(params.id),
    getAvailabilityForShoot(params.id),
    listMyCapabilityKeys(me.id),
    listUsers(),
    listStudios(),
    getShootOutstandingGear(params.id),
    listLockupLocations(),
    listKits(),
    getStudioSchedule(),
  ])
  if (!shoot) notFound()

  const canManageEquipment =
    me.role === 'hr' || me.role === 'founder' || myCapabilities.includes('manage_equipment')
  const isOwner = shoot.owner_id === me.id
  const isEditor = shoot.editors.some((e) => e.user_id === me.id)

  return (
    <ShootDetailClient
      shoot={shoot}
      availability={availability}
      currentUserId={me.id}
      // Shoots are org-wide readable; changes need owner / editor / manager.
      canEdit={isOwner || isEditor || canManageEquipment}
      canCancel={isOwner || canManageEquipment}
      canManageEquipment={canManageEquipment}
      people={users
        .filter((u) => u.status === 'active')
        .map((u) => ({ id: u.id, full_name: u.full_name }))}
      studios={studios}
      outstandingGear={outstandingGear}
      locations={locations}
      kits={kits}
      studioSchedule={studioSchedule}
    />
  )
}
