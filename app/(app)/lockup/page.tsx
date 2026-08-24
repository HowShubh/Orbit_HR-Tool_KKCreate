import { requireUser } from '@/lib/actions/_helpers'
import {
  getMyDevices,
  getMyGear,
  getStudioSchedule,
  listEquipment,
  listKits,
  listLockupLocations,
  listShoots,
  listStudios,
} from '@/lib/queries/lockup'
import { listMyCapabilityKeys } from '@/lib/queries/capabilities'
import { LockupClient, type LockupTab } from '@/components/lockup/lockup-client'

const TABS = ['gear', 'studio', 'shoots', 'mine'] as const

export default async function LockupPage({
  searchParams,
}: {
  searchParams?: { tab?: string; cart?: string }
}) {
  const me = await requireUser()
  const [items, kits, myGear, myDevices, shoots, studios, locations, studioSchedule, myCapabilities] =
    await Promise.all([
      listEquipment(),
      listKits(),
      getMyGear(me.id),
      getMyDevices(me.id),
      listShoots(),
      listStudios(),
      listLockupLocations(),
      getStudioSchedule(),
      listMyCapabilityKeys(me.id),
    ])

  // Gear is the landing tab: no tab param means gear.
  const tab: LockupTab = (TABS as readonly string[]).includes(searchParams?.tab ?? '')
    ? (searchParams!.tab as LockupTab)
    : 'gear'
  const canManageEquipment =
    me.role === 'hr' || me.role === 'founder' || myCapabilities.includes('manage_equipment')

  return (
    <LockupClient
      items={items}
      kits={kits}
      myGear={myGear}
      myDevices={myDevices}
      shoots={shoots}
      studios={studios}
      locations={locations}
      studioSchedule={studioSchedule}
      currentUserId={me.id}
      canManageEquipment={canManageEquipment}
      initialTab={tab}
      openCartInitially={searchParams?.cart === '1'}
    />
  )
}
