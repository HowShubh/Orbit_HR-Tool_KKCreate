'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Clapperboard,
  Loader2,
  MapPin,
  Plus,
  ScanLine,
  Trash2,
  User,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useStore } from '@/lib/store'
import {
  addShootEditor,
  cancelReservation,
  cancelShoot,
  deleteShoot,
  removeShootEditor,
  removeStudioBlock,
} from '@/lib/actions/lockup'
import type { AvailabilityRow, ShootDetail } from '@/lib/queries/lockup'
import type { Tables } from '@/lib/supabase/database.types'
import { SHOOT_STATUS_LABELS } from '@/lib/lockup/constants'
import { CategoryIcon, CodeChip, StatusBadge, fmtDay, fmtTime, itemStatusLine } from './item-bits'
import { ReservationPicker } from './reservation-picker'
import { CheckoutDialog, type CartItem } from './checkout-dialog'
import { ScanConfirmDialog } from './scan-confirm-dialog'
import { StudioBlockDialog } from './studio-block-dialog'

function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function ShootDetailClient({
  shoot,
  availability,
  currentUserId,
  canEdit,
  canCancel,
  canManageEquipment,
  people,
  studios,
}: {
  shoot: ShootDetail
  availability: AvailabilityRow[]
  currentUserId: string
  /** owner, an added editor, or an equipment manager */
  canEdit: boolean
  /** owner or an equipment manager */
  canCancel: boolean
  /** Tech Lead / HR / Founder: exempt from the scan-to-act rule */
  canManageEquipment: boolean
  people: { id: string; full_name: string }[]
  studios: Tables<'equipment_studios'>[]
}) {
  const router = useRouter()
  const { pushToast } = useStore()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickupItem, setPickupItem] = useState<CartItem | null>(null)
  const [pickupScan, setPickupScan] = useState<CartItem | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [editorsOpen, setEditorsOpen] = useState(false)
  const [studioOpen, setStudioOpen] = useState(false)
  const [releasingBlockId, setReleasingBlockId] = useState<string | null>(null)

  const conflicts = shoot.reservations.filter((r) => r.conflict)
  const closed = shoot.status === 'cancelled' || shoot.status === 'done'

  // Pickup window: 24h before the shoot starts until it ends
  const pickupOpen =
    Date.now() >= new Date(shoot.starts_at).getTime() - 24 * 60 * 60 * 1000 &&
    Date.now() <= new Date(shoot.ends_at).getTime()

  function startPickup(item: CartItem) {
    if (canManageEquipment) setPickupItem(item)
    else setPickupScan(item) // must scan the sticker: the gear is taken physically
  }

  async function removeReservation(id: string, itemName: string) {
    setRemovingId(id)
    try {
      await cancelReservation(id)
      pushToast({ title: `${itemName} removed from the shoot`, variant: 'success' })
      router.refresh()
    } catch (err) {
      pushToast({
        title: err instanceof Error ? err.message : 'Could not remove the reservation',
        variant: 'error',
      })
    } finally {
      setRemovingId(null)
    }
  }

  async function doCancelShoot() {
    if (!window.confirm(`Cancel ${shoot.name}? All its reservations will be released.`)) return
    setCancelling(true)
    try {
      await cancelShoot(shoot.id)
      pushToast({ title: 'Shoot cancelled', variant: 'success' })
      router.push('/lockup?tab=shoots')
      router.refresh()
    } catch (err) {
      pushToast({
        title: err instanceof Error ? err.message : 'Could not cancel the shoot',
        variant: 'error',
      })
      setCancelling(false)
    }
  }

  return (
    <div>
      <PageHeader title={shoot.name} subtitle="Shoot gear plan" />
      <div className="px-5 lg:px-8 py-5 max-w-3xl space-y-4">
        <Link
          href="/lockup?tab=shoots"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All shoots
        </Link>

        {/* Header card */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" />
                {fmtDay(shoot.starts_at)}
                {fmtDay(shoot.starts_at) !== fmtDay(shoot.ends_at) && <> to {fmtDay(shoot.ends_at)}</>}
              </span>
              {shoot.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" /> {shoot.location}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <User className="h-4 w-4" /> {shoot.owner_name}
              </span>
            </div>
            <Badge
              variant={
                shoot.effective_status === 'active'
                  ? 'success'
                  : shoot.effective_status === 'planned'
                    ? 'info'
                    : shoot.effective_status === 'cancelled'
                      ? 'danger'
                      : 'muted'
              }
            >
              {SHOOT_STATUS_LABELS[shoot.effective_status]}
            </Badge>
          </div>

          {/* Who can plan this shoot */}
          <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            <span className="rounded-full bg-muted px-2 py-0.5">
              {shoot.owner_name} (owner)
            </span>
            {shoot.editors.map((e) => (
              <span
                key={e.editor_row_id}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5"
              >
                {e.full_name}
                {canEdit && !closed && (
                  <button
                    type="button"
                    title={`Remove ${e.full_name}`}
                    className="text-muted-foreground hover:text-rose-600"
                    onClick={async () => {
                      try {
                        await removeShootEditor(e.editor_row_id)
                        pushToast({ title: `${e.full_name} removed`, variant: 'success' })
                        router.refresh()
                      } catch (err) {
                        pushToast({
                          title: err instanceof Error ? err.message : 'Failed',
                          variant: 'error',
                        })
                      }
                    }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
            {canEdit && !closed && (
              <button
                type="button"
                onClick={() => setEditorsOpen(true)}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 hover:bg-accent"
              >
                <UserPlus className="h-3 w-3" /> Add editor
              </button>
            )}
          </div>

          {/* Studio bookings (hard-held for this shoot) */}
          {(shoot.studio_blocks.length > 0 || (canEdit && !closed && studios.length > 0)) && (
            <div className="space-y-1.5 border-t border-border pt-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[12.5px] font-semibold">
                  <Clapperboard className="h-3.5 w-3.5 text-muted-foreground" /> Studio
                </div>
                {canEdit && !closed && studios.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setStudioOpen(true)}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[12px] text-muted-foreground hover:bg-accent"
                  >
                    <Plus className="h-3 w-3" /> Block a studio
                  </button>
                )}
              </div>
              {shoot.studio_blocks.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">
                  No studio held. Shooting outside? Then nothing to do here.
                </p>
              ) : (
                <ul className="space-y-1">
                  {shoot.studio_blocks.map((b) => (
                    <li
                      key={b.id}
                      className="flex items-center gap-2 text-[12.5px]"
                    >
                      <span className="font-medium">{b.studio_name}</span>
                      <span className="text-muted-foreground">
                        {fmtDay(b.starts_at)}, {fmtTime(b.starts_at)} to {fmtTime(b.ends_at)}
                      </span>
                      {canEdit && !closed && (
                        <button
                          type="button"
                          title="Release this booking"
                          className="text-muted-foreground hover:text-rose-600 disabled:opacity-50"
                          disabled={releasingBlockId === b.id}
                          onClick={async () => {
                            setReleasingBlockId(b.id)
                            try {
                              await removeStudioBlock(b.id)
                              pushToast({
                                title: `${b.studio_name} released`,
                                variant: 'success',
                              })
                              router.refresh()
                            } catch (err) {
                              pushToast({
                                title: err instanceof Error ? err.message : 'Failed',
                                variant: 'error',
                              })
                            } finally {
                              setReleasingBlockId(null)
                            }
                          }}
                        >
                          {releasingBlockId === b.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <X className="h-3 w-3" />
                          )}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {pickupOpen && !closed && shoot.reservations.some((r) => r.status === 'active') && (
            <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-[12.5px] text-blue-800">
              <ScanLine className="h-4 w-4 shrink-0" />
              Pickup is open: scan each item&apos;s QR at the shelf to convert reservations into
              checkouts. Unpicked reservations expire 24 hours after the shoot starts.
            </div>
          )}
        </div>

        {/* Conflicts, loud */}
        {conflicts.length > 0 && !closed && (
          <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 space-y-2">
            <div className="flex items-center gap-2 text-[14px] font-semibold text-rose-700">
              <AlertTriangle className="h-5 w-5" />
              {conflicts.length} item{conflicts.length === 1 ? ' needs' : 's need'} attention
            </div>
            <ul className="space-y-1 text-[13px] text-rose-700">
              {conflicts.map((r) => (
                <li key={r.id}>
                  <span className="font-medium">{r.item.name}</span>: {r.conflict?.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Reserved gear */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-semibold">
              Reserved gear ({shoot.reservations.length})
            </h2>
            {!closed && canEdit && (
              <Button size="sm" onClick={() => setPickerOpen(true)}>
                <Plus className="h-4 w-4" /> Add gear
              </Button>
            )}
          </div>

          {shoot.reservations.length === 0 && (
            <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center text-[13px] text-muted-foreground">
              Nothing reserved yet.
              {canEdit
                ? ' Add the gear this shoot needs so conflicts surface early.'
                : ' Only the owner, its editors, or the tech lead can reserve gear for this shoot.'}
            </div>
          )}

          <ul className="space-y-2">
            {shoot.reservations.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-3.5 rounded-xl border border-border bg-card px-3.5 py-3"
              >
                <CategoryIcon category={r.item.category} photoUrl={r.item.photo_url} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/e/${r.item.code}?src=app`}
                    className="flex items-center gap-2 hover:underline"
                  >
                    <span className="truncate text-[14px] font-semibold">{r.item.name}</span>
                    <CodeChip code={r.item.code} />
                  </Link>
                  <div className="truncate text-[12.5px] text-muted-foreground">
                    {r.status === 'picked_up'
                      ? `Picked up · ${itemStatusLine(r.item)}`
                      : itemStatusLine(r.item)}
                    {' · reserved by '}
                    {r.reserved_by === currentUserId ? 'you' : r.reserved_by_name}
                  </div>
                  {r.conflict && (
                    <div className="mt-0.5 flex items-center gap-1 text-[12px] font-medium text-rose-600">
                      <AlertTriangle className="h-3 w-3 shrink-0" /> {r.conflict.message}
                    </div>
                  )}
                </div>

                {r.status === 'picked_up' ? (
                  <Badge variant="success">Picked up</Badge>
                ) : (
                  <>
                    <StatusBadge status={r.item.status} className="hidden sm:inline-flex" />
                    {!closed && pickupOpen && r.item.status === 'available' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          startPickup({
                            id: r.item.id,
                            code: r.item.code,
                            name: r.item.name,
                            category: r.item.category,
                            photo_url: r.item.photo_url,
                            status: r.item.status,
                          })
                        }
                      >
                        Pick up
                      </Button>
                    )}
                    {!closed && (r.reserved_by === currentUserId || canEdit) && (
                      <button
                        type="button"
                        aria-label={`Remove ${r.item.name}`}
                        className="text-muted-foreground hover:text-rose-600 disabled:opacity-50"
                        disabled={removingId === r.id}
                        onClick={() => removeReservation(r.id, r.item.name)}
                      >
                        {removingId === r.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Danger zone */}
        {canCancel && (
          <div className="pt-2 flex flex-wrap gap-2">
            {!closed && (
              <Button
                variant="ghost"
                size="sm"
                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                disabled={cancelling || deleting}
                onClick={doCancelShoot}
              >
                {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                Cancel this shoot
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
              disabled={cancelling || deleting}
              onClick={async () => {
                if (
                  !window.confirm(
                    `Delete ${shoot.name} permanently? Its reservations, studio bookings and editor list are removed too. This cannot be undone.`
                  )
                )
                  return
                setDeleting(true)
                try {
                  await deleteShoot(shoot.id)
                  pushToast({ title: `${shoot.name} deleted`, variant: 'success' })
                  router.push('/lockup?tab=shoots')
                  router.refresh()
                } catch (err) {
                  pushToast({
                    title: err instanceof Error ? err.message : 'Could not delete the shoot',
                    variant: 'error',
                  })
                  setDeleting(false)
                }
              }}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete this shoot
            </Button>
          </div>
        )}
      </div>

      <ReservationPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        shootId={shoot.id}
        shootName={shoot.name}
        availability={availability}
      />
      {pickupScan && (
        <ScanConfirmDialog
          open
          onOpenChange={(o) => !o && setPickupScan(null)}
          expectCode={pickupScan.code}
          itemName={pickupScan.name}
          actionLabel="pick up"
          onVerified={() => {
            setPickupItem(pickupScan)
            setPickupScan(null)
          }}
        />
      )}
      {pickupItem && (
        <CheckoutDialog
          open
          onOpenChange={(o) => !o && setPickupItem(null)}
          initialItems={[pickupItem]}
          shootId={shoot.id}
          defaultDue={toLocalInput(shoot.ends_at)}
          onDone={() => setPickupItem(null)}
        />
      )}
      <StudioBlockDialog
        open={studioOpen}
        onOpenChange={setStudioOpen}
        shootId={shoot.id}
        shootName={shoot.name}
        shootStartsAt={shoot.starts_at}
        studios={studios}
      />
      <AddEditorDialog
        open={editorsOpen}
        onOpenChange={setEditorsOpen}
        shootId={shoot.id}
        shootName={shoot.name}
        people={people.filter(
          (p) =>
            p.id !== shoot.owner_id && !shoot.editors.some((e) => e.user_id === p.id)
        )}
      />
    </div>
  )
}

function AddEditorDialog({
  open,
  onOpenChange,
  shootId,
  shootName,
  people,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  shootId: string
  shootName: string
  people: { id: string; full_name: string }[]
}) {
  const router = useRouter()
  const { pushToast } = useStore()
  const [userId, setUserId] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      await addShootEditor({ shootId, userId })
      const person = people.find((p) => p.id === userId)
      pushToast({
        title: `${person?.full_name ?? 'Editor'} can now plan ${shootName}`,
        variant: 'success',
      })
      setUserId('')
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      pushToast({ title: err instanceof Error ? err.message : 'Failed', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add an editor</DialogTitle>
          <DialogDescription>
            Editors can reserve and remove gear for {shootName} and change its details. Everyone
            can already see the shoot.
          </DialogDescription>
        </DialogHeader>
        <Select value={userId} onValueChange={setUserId}>
          <SelectTrigger>
            <SelectValue placeholder="Pick a person..." />
          </SelectTrigger>
          <SelectContent>
            {people.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" className="flex-1" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" className="flex-1" disabled={busy || !userId} onClick={submit}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Add editor
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
