'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ImagePlus, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useStore } from '@/lib/store'
import type { Tables } from '@/lib/supabase/database.types'
import type { EquipmentItemRow } from '@/lib/queries/lockup'
import { EQUIPMENT_CATEGORIES, type EquipmentCategory } from '@/lib/lockup/constants'
import { createItem, updateItem, uploadItemPhoto } from '@/lib/actions/lockup'
import { CategoryIcon } from '../item-bits'

const UNASSIGNED = '__none__'

/** Create / edit an item. Purchase fields are visible here because the Tech
 *  Console page itself is capability-gated. When `kind` is 'assigned' this is a
 *  device (laptop/phone/SSD): it shows an owner picker and no cupboard. */
export function ItemDialog({
  open,
  onOpenChange,
  item,
  privateData,
  locations,
  kind = 'pooled',
  people = [],
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: EquipmentItemRow | null
  privateData: Tables<'equipment_private'> | null
  locations: Tables<'equipment_locations'>[]
  /** Which kind this dialog creates (ignored when editing an existing item). */
  kind?: 'pooled' | 'assigned'
  /** Active users for the owner picker (assigned devices). */
  people?: { id: string; full_name: string }[]
}) {
  const router = useRouter()
  const { pushToast } = useStore()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const effectiveKind = item ? item.kind : kind
  const isAssigned = effectiveKind === 'assigned'

  const [name, setName] = useState(item?.name ?? '')
  const [category, setCategory] = useState<EquipmentCategory>(
    item?.category ?? (isAssigned ? 'computer' : 'camera')
  )
  const [brandModel, setBrandModel] = useState(item?.brand_model ?? '')
  const [serial, setSerial] = useState(item?.serial_number ?? '')
  const [locationId, setLocationId] = useState(item?.home_location_id ?? locations[0]?.id ?? '')
  const [assigneeId, setAssigneeId] = useState(item?.assignee_id ?? UNASSIGNED)
  const [notes, setNotes] = useState(item?.notes ?? '')
  const [purchaseDate, setPurchaseDate] = useState(privateData?.purchase_date ?? '')
  const [price, setPrice] = useState(
    privateData?.purchase_price_inr != null ? String(privateData.purchase_price_inr) : ''
  )
  const [purchaseNotes, setPurchaseNotes] = useState(privateData?.purchase_notes ?? '')
  const [busy, setBusy] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      const assignee = assigneeId === UNASSIGNED ? null : assigneeId
      const fields = {
        name,
        category,
        brandModel,
        serialNumber: serial,
        homeLocationId: isAssigned ? undefined : locationId,
        notes,
        purchaseDate: purchaseDate || undefined,
        purchasePriceInr: price ? Number(price) : undefined,
        purchaseNotes,
        ...(isAssigned ? { assigneeId: assignee } : {}),
      }
      if (item) {
        await updateItem({ itemId: item.id, ...fields })
        pushToast({ title: `${name} updated`, variant: 'success' })
      } else {
        await createItem({ ...fields, kind: effectiveKind })
        pushToast({
          title: `${name} added`,
          body: 'Print its QR label from the Labels button.',
          variant: 'success',
        })
      }
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      pushToast({ title: err instanceof Error ? err.message : 'Save failed', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function onPhotoPicked(file: File | undefined) {
    if (!file || !item) return
    setUploadingPhoto(true)
    try {
      const formData = new FormData()
      formData.set('file', file)
      await uploadItemPhoto(item.id, formData)
      pushToast({ title: 'Photo updated', variant: 'success' })
      router.refresh()
    } catch (err) {
      pushToast({ title: err instanceof Error ? err.message : 'Upload failed', variant: 'error' })
    } finally {
      setUploadingPhoto(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? `Edit ${item.name}` : 'Add item'}</DialogTitle>
          <DialogDescription>
            {item
              ? 'Details, home shelf and purchase info.'
              : 'A QR code is generated automatically when you save.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {item && (
            <div className="flex items-center gap-3">
              <CategoryIcon category={category} photoUrl={item.photo_url} />
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => onPhotoPicked(e.target.files?.[0])}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={uploadingPhoto}
                onClick={() => fileRef.current?.click()}
              >
                {uploadingPhoto ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImagePlus className="h-4 w-4" />
                )}
                {item.photo_url ? 'Replace photo' : 'Add photo'}
              </Button>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="item-name">Name</Label>
            <Input
              id="item-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sony FX3"
              autoFocus={!item}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as EquipmentCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EQUIPMENT_CATEGORIES.map((c) => (
                    <SelectItem key={c.key} value={c.key}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isAssigned ? (
              <div className="space-y-1.5">
                <Label>Owner</Label>
                <Select value={assigneeId} onValueChange={setAssigneeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Assign to..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                    {people.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Home shelf</Label>
                <Select value={locationId} onValueChange={setLocationId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="item-brand">Brand / model</Label>
              <Input
                id="item-brand"
                value={brandModel}
                onChange={(e) => setBrandModel(e.target.value)}
                placeholder="Sony ILME-FX3"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-serial">Serial number</Label>
              <Input
                id="item-serial"
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="item-notes">Notes</Label>
            <Textarea
              id="item-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Anything useful, e.g. usually lives with the drone bag"
            />
          </div>

          <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
            <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">
              Purchase info (admins only)
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="item-pdate">Purchase date</Label>
                <Input
                  id="item-pdate"
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item-price">Price (INR)</Label>
                <Input
                  id="item-price"
                  type="number"
                  min="0"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="e.g. 389000"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-pnotes">Purchase notes</Label>
              <Input
                id="item-pnotes"
                value={purchaseNotes}
                onChange={(e) => setPurchaseNotes(e.target.value)}
                placeholder="Invoice number, warranty until..."
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" className="flex-1" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" className="flex-1" disabled={busy || !name.trim()} onClick={submit}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {item ? 'Save changes' : 'Add item'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
