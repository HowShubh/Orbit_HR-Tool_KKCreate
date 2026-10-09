'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarClock, Clapperboard, Clock, Loader2, MapPin, PackageOpen, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Tables } from '@/lib/supabase/database.types'
import type { MyDeviceRow, MyGearRow, MyReservationRow } from '@/lib/queries/lockup'
import { useStore } from '@/lib/store'
import { cancelReservation, handBackDevice } from '@/lib/actions/lockup'
import { CategoryIcon, CodeChip, fmtDayTime } from './item-bits'
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
  reservations,
  locations,
  canManageEquipment,
}: {
  assignedToMe: MyDeviceRow[]
  borrowedByMe: MyDeviceRow[]
  gear: MyGearRow[]
  reservations: MyReservationRow[]
  locations: Tables<'equipment_locations'>[]
  canManageEquipment: boolean
}) {
  const router = useRouter()
  const { pushToast } = useStore()
  const [scanning, setScanning] = useState<MyDeviceRow | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function doCancelReservation(r: MyReservationRow) {
    setBusyId(r.id)
    try {
      await cancelReservation(r.id)
      pushToast({ title: `Reservation of ${r.item_name} dropped`, variant: 'success' })
      router.refresh()
    } catch (err) {
      pushToast({ title: err instanceof Error ? err.message : 'Failed', variant: 'error' })
    } finally {
      setBusyId(null)
    }
  }

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
    assignedToMe.length === 0 &&
    borrowedByMe.length === 0 &&
    gear.length === 0 &&
    reservations.length === 0

  if (nothing) {
    return (
      <div className="rounded-xl border border-dashed border-border px-5 py-12 text-center space-y-2">
        <PackageOpen className="mx-auto h-8 w-8 text-muted-foreground" />
        <div className="text-[14px] font-medium">Nothing with you</div>
        <p className="text-[12.5px] text-muted-foreground">
          Company devices assigned to you, anything you have borrowed, gear you have checked out,
          and gear you have reserved all show up here.
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

      {reservations.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
            Reserved gear
          </h3>
          <p className="text-[11.5px] text-muted-foreground">
            Set aside for you, not taken yet. Scan the sticker at the shelf to pick it up.
          </p>
          {reservations.map((r) => (
            <ReservationRow
              key={r.id}
              reservation={r}
              busy={busyId === r.id}
              onCancel={() => doCancelReservation(r)}
            />
          ))}
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

function ReservationRow({
  reservation: r,
  busy,
  onCancel,
}: {
  reservation: MyReservationRow
  busy: boolean
  onCancel: () => void
}) {
  const windowLine =
    r.starts_at && r.ends_at
      ? `${fmtDayTime(r.starts_at)} → ${fmtDayTime(r.ends_at)}`
      : r.shoot_name
        ? 'For the whole shoot'
        : 'Held'
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-border bg-card px-3.5 py-3">
      <CategoryIcon category={r.category} photoUrl={r.photo_url} />
      <div className="min-w-0 flex-1 space-y-0.5">
        <Link
          href={`/e/${r.item_code}?src=app`}
          className="flex items-center gap-2 hover:underline"
        >
          <span className="truncate text-[14.5px] font-semibold">{r.item_name}</span>
          <CodeChip code={r.item_code} />
          {r.status === 'pending' && (
            <Badge variant="warning" className="px-1.5 py-0 text-[10px]">
              Awaiting approval
            </Badge>
          )}
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground">
          {r.shoot_name && (
            <span className="inline-flex items-center gap-1">
              <Clapperboard className="h-3 w-3" /> {r.shoot_name}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            {r.shoot_name ? (
              <Clock className="h-3 w-3" />
            ) : (
              <CalendarClock className="h-3 w-3" />
            )}
            {windowLine}
          </span>
          {r.home_location_label && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {r.home_location_label}
            </span>
          )}
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="shrink-0 text-muted-foreground hover:text-rose-600"
        disabled={busy}
        onClick={onCancel}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
        Drop
      </Button>
    </div>
  )
}
