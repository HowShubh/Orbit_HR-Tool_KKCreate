'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronDown,
  Pencil,
  Plus,
  QrCode,
  Search,
  Upload,
  Wrench,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useStore } from '@/lib/store'
import type { Tables } from '@/lib/supabase/database.types'
import type { EquipmentItemRow, TechConsoleData } from '@/lib/queries/lockup'
import { STATUS_LABELS } from '@/lib/lockup/constants'
import { forceCheckin, setItemStatus } from '@/lib/actions/lockup'
import { CategoryIcon, CodeChip, StatusBadge, itemStatusLine } from '../item-bits'
import { ItemDialog } from './item-dialog'
import { ImportDialog } from './import-dialog'
import { SendToRepairDialog } from './send-repair-dialog'
import { LabelDownloadDialog } from './label-download'

/** Tech Console inventory: the management surface per the reference UX. */
export function InventoryTable({
  items,
  locations,
  privateByItem,
  qrBaseUrl,
}: {
  items: EquipmentItemRow[]
  locations: Tables<'equipment_locations'>[]
  privateByItem: TechConsoleData['privateByItem']
  qrBaseUrl: string | null
}) {
  const router = useRouter()
  const { pushToast } = useStore()
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<EquipmentItemRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [labels, setLabels] = useState(false)
  const [repairItem, setRepairItem] = useState<EquipmentItemRow | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.code.toLowerCase().includes(q) ||
        (i.serial_number ?? '').toLowerCase().includes(q) ||
        (i.brand_model ?? '').toLowerCase().includes(q) ||
        (i.holder_name ?? '').toLowerCase().includes(q)
    )
  }, [items, query])

  async function changeStatus(item: EquipmentItemRow, status: 'available' | 'retired' | 'lost') {
    try {
      await setItemStatus({ itemId: item.id, status })
      pushToast({ title: `${item.name} marked ${STATUS_LABELS[status].toLowerCase()}`, variant: 'success' })
      router.refresh()
    } catch (err) {
      pushToast({ title: err instanceof Error ? err.message : 'Failed', variant: 'error' })
    }
  }

  async function doForceCheckin(item: EquipmentItemRow) {
    try {
      await forceCheckin(item.id)
      pushToast({ title: `${item.name} force checked in`, variant: 'success' })
      router.refresh()
    } catch (err) {
      pushToast({ title: err instanceof Error ? err.message : 'Failed', variant: 'error' })
    }
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search inventory..."
            className="pl-9"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => setLabels(true)}>
            <QrCode className="h-4 w-4" /> Labels
          </Button>
          <Button variant="outline" onClick={() => setImporting(true)}>
            <Upload className="h-4 w-4" /> Import CSV
          </Button>
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Add item
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Item</th>
              <th className="px-3 py-2.5 font-medium">Code</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium hidden md:table-cell">Holder</th>
              <th className="px-3 py-2.5 font-medium hidden lg:table-cell">Where</th>
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
                <td className="px-3 py-2.5">
                  <StatusBadge status={item.status} />
                </td>
                <td className="px-3 py-2.5 hidden md:table-cell text-muted-foreground">
                  {item.holder_name ?? '·'}
                </td>
                <td className="px-3 py-2.5 hidden lg:table-cell text-muted-foreground">
                  {item.status === 'available' ? (
                    <span>
                      {item.current_location_label ?? item.home_location_label ?? '·'}
                      {item.current_location_label &&
                        item.current_location_id !== item.home_location_id && (
                          <span
                            className="ml-1 text-amber-600"
                            title={`Home shelf is ${item.home_location_label}`}
                          >
                            (away)
                          </span>
                        )}
                    </span>
                  ) : (
                    <span title={`Home shelf: ${item.home_location_label ?? 'none'}`}>
                      home: {item.home_location_label ?? '·'}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-1">
                    {item.status === 'available' && (
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Send to repair"
                        onClick={() => setRepairItem(item)}
                      >
                        <Wrench className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline" className="gap-1 min-w-[120px] justify-between">
                          {STATUS_LABELS[item.status]}
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Set status</DropdownMenuLabel>
                        {item.status === 'checked_out' && (
                          <DropdownMenuItem onClick={() => doForceCheckin(item)}>
                            Force check in
                          </DropdownMenuItem>
                        )}
                        {item.status !== 'available' && item.status !== 'checked_out' && (
                          <DropdownMenuItem onClick={() => changeStatus(item, 'available')}>
                            Available
                          </DropdownMenuItem>
                        )}
                        {item.status === 'available' && (
                          <DropdownMenuItem onClick={() => setRepairItem(item)}>
                            Send to repair
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        {item.status !== 'retired' && (
                          <DropdownMenuItem onClick={() => changeStatus(item, 'retired')}>
                            Retired
                          </DropdownMenuItem>
                        )}
                        {item.status !== 'lost' && (
                          <DropdownMenuItem
                            className="text-rose-600"
                            onClick={() => changeStatus(item, 'lost')}
                          >
                            Lost
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Edit item"
                      onClick={() => setEditing(item)}
                    >
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  {items.length === 0
                    ? 'No items yet. Add one or import the inventory CSV.'
                    : 'Nothing matches this search.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Dialogs */}
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
        />
      )}
      <ImportDialog open={importing} onOpenChange={setImporting} />
      <LabelDownloadDialog
        open={labels}
        onOpenChange={setLabels}
        items={items}
        qrBaseUrl={qrBaseUrl}
      />
      {repairItem && (
        <SendToRepairDialog
          open
          onOpenChange={(o) => !o && setRepairItem(null)}
          item={repairItem}
        />
      )}
    </div>
  )
}
