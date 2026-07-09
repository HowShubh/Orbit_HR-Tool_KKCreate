import { requireUser } from '@/lib/actions/_helpers'
import {
  getMyDevices,
  getMyGear,
  getStudioSchedule,
  listEquipment,
  listLockupLocations,
  listShoots,
} from '@/lib/queries/lockup'
import { listMyCapabilityKeys } from '@/lib/queries/capabilities'
import { listUsers } from '@/lib/queries/users'
import { LockupClient } from '@/components/lockup/lockup-client'

const TABS = ['gear', 'devices', 'mine', 'shoots'] as const

export default async function LockupPage({
  searchParams,
}: {
  searchParams?: { tab?: string }
}) {
  const me = await requireUser()
  const [items, myGear, myDevices, shoots, locations, myCapabilities, studioSchedule, users] =
    await Promise.all([
      listEquipment(),
      getMyGear(me.id),
      getMyDevices(me.id),
      listShoots(),
      listLockupLocations(),
      listMyCapabilityKeys(me.id),
      getStudioSchedule(),
      listUsers(),
    ])

  const tab = (TABS as readonly string[]).includes(searchParams?.tab ?? '')
    ? (searchParams!.tab as (typeof TABS)[number])
    : 'gear'
  const canManageEquipment =
    me.role === 'hr' || me.role === 'founder' || myCapabilities.includes('manage_equipment')
  const people = users
    .filter((u) => u.status === 'active')
    .map((u) => ({ id: u.id, full_name: u.full_name }))

  return (
    <LockupClient
      items={items}
      myGear={myGear}
      myDevices={myDevices}
      shoots={shoots}
      locations={locations}
      studioSchedule={studioSchedule}
      people={people}
      currentUserId={me.id}
      canManageEquipment={canManageEquipment}
      initialTab={tab}
    />
  )
}
