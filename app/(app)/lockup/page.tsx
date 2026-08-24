import { requireUser } from '@/lib/actions/_helpers'
import {
  getMyDevices,
  getMyGear,
  getStudioSchedule,
  listEquipment,
  listKits,
  listLockupLocations,
  listShoots,
} from '@/lib/queries/lockup'
import { listMyCapabilityKeys } from '@/lib/queries/capabilities'
import { listUsers } from '@/lib/queries/users'
import { LockupClient } from '@/components/lockup/lockup-client'
import { LockupHome } from '@/components/lockup/lockup-home'

const TABS = ['gear', 'devices', 'mine', 'shoots'] as const

export default async function LockupPage({
  searchParams,
}: {
  searchParams?: { tab?: string }
}) {
  const me = await requireUser()

  // No tab = the entry fork (Get equipment / Plan a shoot). The tab surfaces
  // stay reachable at /lockup?tab=… for deep links (dashboard, notifications).
  if (!(TABS as readonly string[]).includes(searchParams?.tab ?? '')) {
    return <LockupHome />
  }
  const tab = searchParams!.tab as (typeof TABS)[number]

  const [items, myGear, myDevices, shoots, locations, myCapabilities, studioSchedule, users, kits] =
    await Promise.all([
      listEquipment(),
      getMyGear(me.id),
      getMyDevices(me.id),
      listShoots(),
      listLockupLocations(),
      listMyCapabilityKeys(me.id),
      getStudioSchedule(),
      listUsers(),
      listKits(),
    ])

  const canManageEquipment =
    me.role === 'hr' || me.role === 'founder' || myCapabilities.includes('manage_equipment')
  const people = users
    .filter((u) => u.status === 'active')
    .map((u) => ({ id: u.id, full_name: u.full_name }))

  return (
    <LockupClient
      items={items}
      kits={kits}
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
