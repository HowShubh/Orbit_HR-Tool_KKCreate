'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, QrCode } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { MyDevices as MyDevicesView } from './my-devices'
import { ShootCards } from './shoot-cards'
import { StudioTab } from './studio-tab'
import { CartSheet } from './cart-sheet'

export type LockupTab = 'gear' | 'studio' | 'shoots' | 'mine'

/**
 * Lockup's shell: four tabs that are always reachable, landing on Gear.
 * The cart bar is pinned to the bottom wherever you are; the cart itself is
 * provided by the route layout, so it survives leaving for an item page.
 */
export function LockupClient({
  items,
  kits,
  myGear,
  myDevices,
  shoots,
  studios,
  locations,
  studioSchedule,
  currentUserId,
  canManageEquipment,
  initialTab,
  openCartInitially,
}: {
  items: EquipmentItemRow[]
  kits: KitRow[]
  myGear: MyGearRow[]
  myDevices: MyDevices
  shoots: ShootSummary[]
  studios: Tables<'equipment_studios'>[]
  locations: Tables<'equipment_locations'>[]
  studioSchedule: StudioScheduleEntry[]
  currentUserId: string
  canManageEquipment: boolean
  initialTab: LockupTab
  /** Set when arriving from the cart bar on another Lockup route. */
  openCartInitially?: boolean
}) {
  const router = useRouter()
  const [tab, setTab] = useState<string>(initialTab)
  const [cartOpen, setCartOpen] = useState(Boolean(openCartInitially))

  const overdueCount = myGear.filter((g) => g.overdue).length
  const mineCount =
    myGear.length + myDevices.assignedToMe.length + myDevices.borrowedByMe.length
  const upcomingShoots = shoots.filter(
    (s) => s.status !== 'done' && s.status !== 'cancelled'
  ).length

  return (
    <div>
      <PageHeader
        title="Lockup"
        subtitle="Who has what, and until when. Scan the QR on any item to take or return it."
      />

      <div className="space-y-4 px-5 py-5 lg:px-8">
        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v)
            router.replace(v === 'gear' ? '/lockup' : `/lockup?tab=${v}`, { scroll: false })
          }}
        >
          <TabsList>
            <TabsTrigger value="gear">Gear</TabsTrigger>
            <TabsTrigger value="studio">Studio</TabsTrigger>
            <TabsTrigger value="shoots" className="gap-1.5">
              Shoots
              {upcomingShoots > 0 && (
                <Badge variant="muted" className="px-1.5 py-0 text-[10px]">
                  {upcomingShoots}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="mine" className="gap-1.5">
              With me
              {mineCount > 0 && (
                <Badge
                  variant={overdueCount > 0 ? 'danger' : 'info'}
                  className="px-1.5 py-0 text-[10px]"
                >
                  {mineCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="gear" className="mt-4">
            <InventoryBrowser
              items={items}
              kits={kits}
              shoots={shoots}
              currentUserId={currentUserId}
            />
          </TabsContent>

          <TabsContent value="studio" className="mt-4">
            <StudioTab
              studios={studios}
              entries={studioSchedule}
              currentUserId={currentUserId}
              canManageEquipment={canManageEquipment}
            />
          </TabsContent>

          <TabsContent value="shoots" className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12.5px] text-muted-foreground">
                Everything planned, in the studio and outside. Open one to see its gear and crew.
              </p>
              <Button asChild size="sm">
                <Link href="/lockup/shoots/new">
                  <Plus className="h-4 w-4" /> Plan a shoot
                </Link>
              </Button>
            </div>
            <ShootCards shoots={shoots} currentUserId={currentUserId} />
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
        </Tabs>

        <p className="flex items-center justify-center gap-2 pt-2 text-[12.5px] text-muted-foreground">
          <QrCode className="h-4 w-4" />
          Holding an item? Scan its sticker to take or return it.
        </p>
      </div>

      <CartSheet
        open={cartOpen}
        onOpenChange={setCartOpen}
        items={items}
        shoots={shoots}
        currentUserId={currentUserId}
      />
    </div>
  )
}
