'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Pencil, Plus, Search, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Tables } from '@/lib/supabase/database.types'
import type { EquipmentItemRow, TechConsoleData } from '@/lib/queries/lockup'
import { CodeChip, StatusBadge, itemStatusLine } from '../item-bits'
import { CategoryIcon } from '../item-bits'
import { ItemDialog } from './item-dialog'

/** Tech Console management of assigned devices (laptops, phones, SSDs). */
export function DevicesTable({
  devices,
  locations,
  privateByItem,
  people,
}: {
  devices: EquipmentItemRow[]
  locations: Tables<'equipment_locations'>[]
  privateByItem: TechConsoleData['privateByItem']
  people: { id: string; full_name: string }[]
}) {
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<EquipmentItemRow | null>(null)
  const [creating, setCreating] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return devices
    return devices.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.code.toLowerCase().includes(q) ||
        (i.brand_model ?? '').toLowerCase().includes(q) ||
        (i.serial_number ?? '').toLowerCase().includes(q) ||
        (i.assignee_name ?? '').toLowerCase().includes(q) ||
        (i.holder_name ?? '').toLowerCase().includes(q)
    )
  }, [devices, query])

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search devices, owner, holder..."
            className="pl-9"
          />
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Add device
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Device</th>
              <th className="px-3 py-2.5 font-medium">Code</th>
              <th className="px-3 py-2.5 font-medium">Owner</th>
              <th className="px-3 py-2.5 font-medium hidden md:table-cell">Currently with</th>
              <th className="px-4 py-2.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((item) => (
              <tr key={item.id} className="hover:bg-accent/40">
                <td className="px-4 py-2.5">
                  <Link href={`/e/${item.code}?src=app`} className="flex items-center gap-3 group">
                    <CategoryIcon category={item.category} photoUrl={item.photo_url} size="sm" />
                    <div className="min-w-0">
                      <div className="font-semibold group-hover:underline truncate max-w-[220px]">
                        {item.name}
                      </div>
                      <div className="text-[11.5px] text-muted-foreground md:hidden truncate max-w-[220px]">
                        {itemStatusLine(item)}
                      </div>
                    </div>
                  </Link>
                </td>
                <td className="px-3 py-2.5">
                  <CodeChip code={item.code} />
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {item.assignee_name ?? <span className="text-amber-600">Unassigned</span>}
                </td>
                <td className="px-3 py-2.5 hidden md:table-cell text-muted-foreground">
                  {item.status === 'checked_out'
                    ? item.holder_name ?? 'someone'
                    : item.status === 'available'
                      ? 'With owner'
                      : <StatusBadge status={item.status} />}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="outline" onClick={() => setEditing(item)}>
                      <UserRound className="h-3.5 w-3.5" /> Manage
                    </Button>
                    <Button size="icon" variant="ghost" title="Edit" onClick={() => setEditing(item)}>
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  {devices.length === 0
                    ? 'No assigned devices yet. Add a laptop, phone or SSD and assign it to someone.'
                    : 'Nothing matches this search.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(creating || editing) && (
        <ItemDialog
          open
          onOpenChange={(o) => {
            if (!o) {
              setCreating(false)
              setEditing(null)
            }
          }}
          item={editing}
          privateData={editing ? privateByItem[editing.id] ?? null : null}
          locations={locations}
          kind="assigned"
          people={people}
        />
      )}
    </div>
  )
}
