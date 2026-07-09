'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, PackageOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Tables } from '@/lib/supabase/database.types'
import type { MyDeviceRow, MyGearRow } from '@/lib/queries/lockup'
import { useStore } from '@/lib/store'
import { handBackDevice } from '@/lib/actions/lockup'
import { CategoryIcon, CodeChip } from './item-bits'
import { MyGear } from './my-gear'
import { ScanConfirmDialog } from './scan-confirm-dialog'

/**
 * "Device With Me" — everything company-owned the person currently holds:
 * their assigned devices, devices they borrowed (with hand-back), and any
 * pooled gear they have checked out.
 */
export function MyDevices({
  assignedToMe,
  borrowedByMe,
  gear,
  locations,
  canManageEquipment,
}: {
  assignedToMe: MyDeviceRow[]
  borrowedByMe: MyDeviceRow[]
  gear: MyGearRow[]
  locations: Tables<'equipment_locations'>[]
  canManageEquipment: boolean
}) {
  const router = useRouter()
  const { pushToast } = useStore()
  const [scanning, setScanning] = useState<MyDeviceRow | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function doHandBack(device: MyDeviceRow) {
    setBusyId(device.item_id)
    try {
      await handBackDevice(device.item_id)
      pushToast({
        title: `Handed back${device.assignee_name ? ` to ${device.assignee_name}` : ''}`,
        variant: 'success',
      })
      router.refresh()
    } catch (err) {
      pushToast({ title: err instanceof Error ? err.message : 'Failed', variant: 'error' })
    } finally {
      setBusyId(null)
    }
  }

  const nothing =
    assignedToMe.length === 0 && borrowedByMe.length === 0 && gear.length === 0

  if (nothing) {
    return (
      <div className="rounded-xl border border-dashed border-border px-5 py-12 text-center space-y-2">
        <PackageOpen className="mx-auto h-8 w-8 text-muted-foreground" />
        <div className="text-[14px] font-medium">Nothing with you</div>
        <p className="text-[12.5px] text-muted-foreground">
          Company devices assigned to you, anything you have borrowed, and gear you have checked
          out all show up here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {assignedToMe.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
            Assigned to me
          </h3>
          {assignedToMe.map((d) => (
            <DeviceRow key={d.item_id} device={d} />
          ))}
        </section>
      )}

      {borrowedByMe.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
            Borrowed by me
          </h3>
          {borrowedByMe.map((d) => (
            <DeviceRow
              key={d.item_id}
              device={d}
              action={
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busyId === d.item_id}
                  onClick={() => (canManageEquipment ? doHandBack(d) : setScanning(d))}
                >
                  {busyId === d.item_id && <Loader2 className="h-4 w-4 animate-spin" />}
                  Hand back
                </Button>
              }
            />
          ))}
        </section>
      )}

      {gear.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
            Checked-out gear
          </h3>
          <MyGear gear={gear} locations={locations} canManageEquipment={canManageEquipment} />
        </section>
      )}

      {scanning && (
        <ScanConfirmDialog
          open
          onOpenChange={(o) => !o && setScanning(null)}
          expectCode={scanning.item_code}
          itemName={scanning.item_name}
          actionLabel="hand back"
          onVerified={() => {
            const d = scanning
            setScanning(null)
            void doHandBack(d)
          }}
        />
      )}
    </div>
  )
}

function DeviceRow({
  device,
  action,
}: {
  device: MyDeviceRow
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-border bg-card px-3.5 py-3">
      <CategoryIcon category={device.category} photoUrl={device.photo_url} />
      <div className="min-w-0 flex-1">
        <Link href={`/e/${device.item_code}?src=app`} className="flex items-center gap-2 hover:underline">
          <span className="truncate text-[14.5px] font-semibold">{device.item_name}</span>
          <CodeChip code={device.item_code} />
        </Link>
        {device.assignee_name && (
          <div className="truncate text-[12.5px] text-muted-foreground">
            Owner: {device.assignee_name}
          </div>
        )}
      </div>
      {action}
    </div>
  )
}
