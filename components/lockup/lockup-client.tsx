'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import type { Tables } from '@/lib/supabase/database.types'
import type {
  EquipmentItemRow,
  KitRow,
  MyDevices,
  MyGearRow,
  ShootSummary,
  StudioScheduleEntry,
} from '@/lib/queries/lockup'
import { InventoryBrowser } from './inventory-browser'
import { DevicesBrowser } from './devices-browser'
import { MyDevices as MyDevicesView } from './my-devices'
import { ShootCards } from './shoot-cards'
import { StudioSchedule } from './studio-schedule'

export function LockupClient({
  items,
  kits,
  myGear,
  myDevices,
  shoots,
  locations,
  studioSchedule,
  people,
  currentUserId,
  canManageEquipment,
  initialTab,
}: {
  items: EquipmentItemRow[]
  kits: KitRow[]
  myGear: MyGearRow[]
  myDevices: MyDevices
  shoots: ShootSummary[]
  locations: Tables<'equipment_locations'>[]
  studioSchedule: StudioScheduleEntry[]
  people: { id: string; full_name: string }[]
  currentUserId: string
  canManageEquipment: boolean
  initialTab: 'gear' | 'devices' | 'mine' | 'shoots'
}) {
  const router = useRouter()
  const [tab, setTab] = useState<string>(initialTab)
  const overdueCount = myGear.filter((g) => g.overdue).length
  const devices = items.filter((i) => i.kind === 'assigned')
  const mineCount =
    myGear.length + myDevices.assignedToMe.length + myDevices.borrowedByMe.length

  return (
    <div>
      <PageHeader
        title="Lockup"
        subtitle="Who has what, and until when. Scan the QR on any item to take or return it."
      />
      <div className="px-5 lg:px-8 py-5 space-y-4">
        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v)
            router.replace(`/lockup?tab=${v}`, { scroll: false })
          }}
        >
          <TabsList>
            <TabsTrigger value="gear">Gear</TabsTrigger>
            <TabsTrigger value="devices">Devices</TabsTrigger>
            <TabsTrigger value="mine" className="gap-1.5">
              With me
              {mineCount > 0 && (
                <Badge variant={overdueCount > 0 ? 'danger' : 'info'} className="px-1.5 py-0 text-[10px]">
                  {mineCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="shoots">Shoots</TabsTrigger>
          </TabsList>

          <TabsContent value="gear" className="mt-4">
            <InventoryBrowser
              items={items}
              kits={kits}
              locations={locations}
              currentUserId={currentUserId}
              canManageEquipment={canManageEquipment}
            />
          </TabsContent>
          <TabsContent value="devices" className="mt-4">
            <DevicesBrowser
              devices={devices}
              locations={locations}
              currentUserId={currentUserId}
              canManageEquipment={canManageEquipment}
              people={people}
            />
          </TabsContent>
          <TabsContent value="mine" className="mt-4">
            <MyDevicesView
              assignedToMe={myDevices.assignedToMe}
              borrowedByMe={myDevices.borrowedByMe}
              gear={myGear}
              locations={locations}
              canManageEquipment={canManageEquipment}
            />
          </TabsContent>
          <TabsContent value="shoots" className="mt-4 space-y-4">
            <StudioSchedule entries={studioSchedule} />
            <ShootCards shoots={shoots} currentUserId={currentUserId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
