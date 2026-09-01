'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Boxes,
  ChevronDown,
  Pencil,
  Plus,
  QrCode,
  Search,
  Trash2,
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
import type { EquipmentItemRow, KitRow, TechConsoleData } from '@/lib/queries/lockup'
import { STATUS_LABELS } from '@/lib/lockup/constants'
import { deleteKit, forceCheckin, setItemStatus } from '@/lib/actions/lockup'
import { CategoryIcon, CodeChip, StatusBadge, itemStatusLine } from '../item-bits'
import { ItemDialog } from './item-dialog'
import { ImportDialog } from './import-dialog'
import { KitDialog } from './kit-dialog'
import { SendToRepairDialog } from './send-repair-dialog'
import { LabelDownloadDialog } from './label-download'

/** Tech Console inventory: the management surface per the reference UX. */
export function InventoryTable({
  items,
  kits,
  locations,
  privateByItem,
  qrBaseUrl,
}: {
  items: EquipmentItemRow[]
  kits: KitRow[]
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
  const [kitDialog, setKitDialog] = useState<{ open: boolean; kit: KitRow | null }>({
    open: false,
    kit: null,
  })
  const [busyKitId, setBusyKitId] = useState<string | null>(null)

  async function doDeleteKit(kit: KitRow) {
    setBusyKitId(kit.id)
    try {
      await deleteKit(kit.id)
      pushToast({ title: 'Kit deleted', variant: 'success' })
      router.refresh()
    } catch (err) {
      pushToast({ title: err instanceof Error ? err.message : 'Failed', variant: 'error' })
    } finally {
      setBusyKitId(null)
    }
  }

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

      {/* Kits: built from these same items, so they live right here. */}
      <div className="space-y-2 rounded-xl border border-border bg-card p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[13px] font-semibold">
            <Boxes className="h-4 w-4 text-muted-foreground" />
            Kits
            <span className="text-[12px] font-normal text-muted-foreground">({kits.length})</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => setKitDialog({ open: true, kit: null })}>
            <Plus className="h-4 w-4" /> New kit
          </Button>
        </div>
        {kits.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            A kit is a one-tap selection shortcut in shoot planning: bundle gear people always take
            together, like a podcast setup. Custody stays per item.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {kits.map((kit) => (
              <div
                key={kit.id}
                className="group flex items-center gap-1.5 rounded-lg border border-border bg-background py-1 pl-2.5 pr-1"
              >
                <button
                  type="button"
                  onClick={() => setKitDialog({ open: true, kit })}
                  className="flex items-center gap-1.5 text-left"
                  title={kit.items.map((i) => i.name).join(', ') || 'empty'}
                >
                  <span className="text-[12.5px] font-medium">{kit.name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {kit.items.length} item{kit.items.length === 1 ? '' : 's'}
                  </span>
                  <Pencil className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
                <button
                  type="button"
                  aria-label={`Delete kit ${kit.name}`}
                  disabled={busyKitId === kit.id}
                  onClick={() => {
                    if (window.confirm(`Delete kit ${kit.name}? Items themselves are untouched.`)) {
                      void doDeleteKit(kit)
                    }
                  }}
                  className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-rose-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
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
      <KitDialog
        open={kitDialog.open}
        onOpenChange={(open) => setKitDialog((s) => ({ ...s, open }))}
        kit={kitDialog.kit}
        pooledItems={items}
      />
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
