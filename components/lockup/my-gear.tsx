'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, PackageOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Tables } from '@/lib/supabase/database.types'
import type { MyGearRow } from '@/lib/queries/lockup'
import { CategoryIcon, CodeChip, fmtDayTime } from './item-bits'
import { ReturnDialog } from './return-dialog'
import { ScanConfirmDialog } from './scan-confirm-dialog'

export function MyGear({
  gear,
  locations,
  canManageEquipment = false,
}: {
  gear: MyGearRow[]
  locations: Tables<'equipment_locations'>[]
  canManageEquipment?: boolean
}) {
  const [returning, setReturning] = useState<MyGearRow | null>(null)
  // Non-managers must scan the sticker to check in: the item has to be at the shelf.
  const [scanning, setScanning] = useState<MyGearRow | null>(null)

  if (gear.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-5 py-12 text-center space-y-2">
        <PackageOpen className="mx-auto h-8 w-8 text-muted-foreground" />
        <div className="text-[14px] font-medium">Nothing checked out</div>
        <p className="text-[12.5px] text-muted-foreground">
          Scan the QR sticker on any item to take it. It will show up here with its return date.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {gear.map((g) => (
        <div
          key={g.checkout_id}
          className="flex items-center gap-3.5 rounded-xl border border-border bg-card px-3.5 py-3"
        >
          <CategoryIcon category={g.category} photoUrl={g.photo_url} />
          <div className="min-w-0 flex-1">
            <Link
              href={`/e/${g.item_code}?src=app`}
              className="flex items-center gap-2 hover:underline"
            >
              <span className="truncate text-[14.5px] font-semibold">{g.item_name}</span>
              <CodeChip code={g.item_code} />
            </Link>
            <div className="flex flex-wrap items-center gap-x-2 text-[12.5px] text-muted-foreground">
              {g.due_at && (
                <span className={g.overdue ? 'text-rose-600 font-medium' : undefined}>
                  {g.overdue ? 'Was due' : 'Due'} {fmtDayTime(g.due_at)}
                </span>
              )}
              {g.shoot_name && <span>· for {g.shoot_name}</span>}
            </div>
          </div>
          {g.overdue && (
            <Badge variant="danger" className="hidden sm:inline-flex">
              <AlertTriangle className="h-3 w-3" /> Overdue
            </Badge>
          )}
          <Button
            size="sm"
            variant={g.overdue ? 'default' : 'secondary'}
            onClick={() => (canManageEquipment ? setReturning(g) : setScanning(g))}
          >
            Check in
          </Button>
        </div>
      ))}

      {scanning && (
        <ScanConfirmDialog
          open
          onOpenChange={(o) => !o && setScanning(null)}
          expectCode={scanning.item_code}
          itemName={scanning.item_name}
          actionLabel="check in"
          onVerified={() => {
            setReturning(scanning)
            setScanning(null)
          }}
        />
      )}
      {returning && (
        <ReturnDialog
          open
          onOpenChange={(o) => !o && setReturning(null)}
          item={{
            id: returning.item_id,
            name: returning.item_name,
            home_location_id:
              locations.find((l) => l.label === returning.home_location_label)?.id ?? null,
          }}
          locations={locations}
          onDone={() => setReturning(null)}
        />
      )}
    </div>
  )
}
