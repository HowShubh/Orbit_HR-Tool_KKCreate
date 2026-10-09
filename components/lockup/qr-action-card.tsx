'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRightLeft,
  CalendarClock,
  CheckCircle2,
  Flag,
  Handshake,
  History,
  Loader2,
  MapPin,
  UserRound,
  User,
  Wrench,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Tables } from '@/lib/supabase/database.types'
import type { EquipmentItemRow, ItemHistoryEvent } from '@/lib/queries/lockup'
import { borrowDevice, fetchItemHistory, handBackDevice } from '@/lib/actions/lockup'
import { useStore } from '@/lib/store'
import { CATEGORY_LABELS } from '@/lib/lockup/constants'
import {
  AssignedChip,
  CategoryIcon,
  CodeChip,
  StatusBadge,
  fmtDay,
  fmtDayTime,
  itemStatusLine,
} from './item-bits'
import { CheckoutDialog } from './checkout-dialog'
import { ReturnDialog } from './return-dialog'
import { TransferDialog } from './transfer-dialog'
import { ReportIssueDialog } from './report-issue-dialog'
import { ScanConfirmDialog } from './scan-confirm-dialog'
import { AssignDeviceDialog } from './assign-device-dialog'

/** Turn a shoot-end timestamp into a datetime-local default for pickups. */
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * The QR landing card: always shows the one action that makes sense right now.
 * available → Check out (or Pick up when reserved for an imminent shoot)
 * with me → Check in · with someone else → Take over · in repair → banner
 */
export function QrActionCard({
  item,
  locations,
  currentUserId,
  requireScan = false,
  knownItems,
  canManageEquipment = false,
  assignPeople,
}: {
  item: EquipmentItemRow
  locations: Tables<'equipment_locations'>[]
  currentUserId: string
  /** True when this page was reached from inside the app (not a physical QR
   *  scan) by a non-manager: taking or returning then requires scanning the
   *  sticker first. */
  requireScan?: boolean
  /** Items already loaded in the browser (e.g. the gear list), so cart scans
   *  resolve instantly without a server round trip. */
  knownItems?: EquipmentItemRow[]
  /** Viewer can manage equipment (assign devices, force actions). */
  canManageEquipment?: boolean
  /** Active users for the inline device-assign picker (managers only). When
   *  omitted, managers are pointed to the Tech Console instead. */
  assignPeople?: { id: string; full_name: string }[]
}) {
  const router = useRouter()
  const { pushToast } = useStore()
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [returnOpen, setReturnOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [issueOpen, setIssueOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  // History is fetched on demand: most visits never open it, so the page/sheet
  // renders without those queries.
  const [history, setHistory] = useState<ItemHistoryEvent[] | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  async function toggleHistory() {
    const next = !showHistory
    setShowHistory(next)
    if (next && history === null && !historyLoading) {
      setHistoryLoading(true)
      try {
        setHistory(await fetchItemHistory(item.id))
      } catch {
        setHistory([])
      } finally {
        setHistoryLoading(false)
      }
    }
  }
  // Once the sticker is scanned we don't ask again on this page view.
  const [scanVerified, setScanVerified] = useState(!requireScan)
  const [pendingAction, setPendingAction] = useState<
    null | { run: () => void; label: string }
  >(null)

  /** Runs the action directly, or routes through the scan gate first. */
  function gated(run: () => void, label: string) {
    if (scanVerified) run()
    else setPendingAction({ run, label })
  }

  async function runDeviceAction(fn: () => Promise<void>, done: string) {
    setBusy(true)
    try {
      await fn()
      pushToast({ title: done, variant: 'success' })
      router.refresh()
    } catch (err) {
      pushToast({ title: err instanceof Error ? err.message : 'Action failed', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const isAssigned = item.kind === 'assigned'
  const isAssigneeMe = item.assignee_id === currentUserId
  const heldByMe = item.status === 'checked_out' && item.current_holder_id === currentUserId
  const heldByOther = item.status === 'checked_out' && !heldByMe
  // Assigned device resting (available) with nobody actively holding beyond its owner.
  const deviceResting = isAssigned && item.status === 'available'

  // A reservation is "pickable" from 24h before the shoot starts until it
  // ends. Pending (unapproved) reservations never qualify.
  const pickupReservation = useMemo(() => {
    if (item.status !== 'available') return null
    const now = Date.now()
    return (
      item.active_reservations.find((r) => {
        if (r.status !== 'active') return false
        const start = new Date(r.shoot_starts_at).getTime()
        const end = new Date(r.shoot_ends_at).getTime()
        return now >= start - 24 * 60 * 60 * 1000 && now <= end
      }) ?? null
    )
  }, [item])

  // Approval-flagged gear leaves the cupboard only against an approved
  // reservation (the server enforces this; this banner explains it up front).
  const approvalBlocked =
    !isAssigned && item.requires_approval && !canManageEquipment && !pickupReservation

  return (
    <div className="space-y-4">
      {/* Identity */}
      <div className="flex items-start gap-4">
        <CategoryIcon category={item.category} photoUrl={item.photo_url} size="lg" />
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-[19px] font-semibold leading-tight">{item.name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <CodeChip code={item.code} />
            <span className="text-[12px] text-muted-foreground">
              {CATEGORY_LABELS[item.category]}
              {item.brand_model ? ` · ${item.brand_model}` : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={item.status} />
            {isAssigned && <AssignedChip />}
          </div>
        </div>
      </div>

      {/* Live state */}
      <div className="rounded-xl border border-border bg-card divide-y divide-border text-[13.5px]">
        <div className="flex items-center gap-2.5 px-4 py-2.5">
          {item.status === 'checked_out' || (isAssigned && item.status === 'available') ? (
            <User className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <span>{itemStatusLine(item)}</span>
        </div>
        {/* Assigned devices: show the owner when it is on loan to someone else */}
        {isAssigned && item.status === 'checked_out' && item.assignee_name && (
          <div className="flex items-center gap-2.5 px-4 py-2.5 text-muted-foreground">
            <UserRound className="h-4 w-4 shrink-0" />
            <span>Owner: {item.assignee_name}</span>
          </div>
        )}
        {/* Pooled gear: home-shelf line (hidden for assigned devices) */}
        {!isAssigned &&
          item.home_location_label &&
          (item.status !== 'available' ||
            (item.current_location_label !== null &&
              item.current_location_id !== item.home_location_id)) && (
            <div className="flex items-center gap-2.5 px-4 py-2.5 text-muted-foreground">
              <MapPin className="h-4 w-4 shrink-0" />
              <span>
                Home shelf: {item.home_location_label}
                {item.status === 'available' &&
                  item.current_location_id !== item.home_location_id &&
                  ' (currently kept elsewhere)'}
              </span>
            </div>
          )}
        {item.active_reservations.map((r) => (
          <div key={r.id} className="flex items-center gap-2.5 px-4 py-2.5 text-muted-foreground">
            <CalendarClock className="h-4 w-4 shrink-0" />
            <span>
              Reserved for <span className="font-medium text-foreground">{r.shoot_name}</span> by{' '}
              {r.reserved_by_name}, {fmtDay(r.shoot_starts_at)} to {fmtDay(r.shoot_ends_at)}
              {r.status === 'pending' && (
                <span className="text-amber-600"> (awaiting approval)</span>
              )}
            </span>
          </div>
        ))}
      </div>

      {/* In-repair / retired banners */}
      {item.status === 'in_repair' && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-800 flex items-center gap-2.5">
          <Wrench className="h-4 w-4 shrink-0" />
          <span>
            In repair{item.repair_vendor ? ` at ${item.repair_vendor}` : ''}
            {item.repair_expected_back_on
              ? `, expected back ${fmtDay(item.repair_expected_back_on)}`
              : ', no expected return date yet'}
            . The tech lead will mark it available when it is back.
          </span>
        </div>
      )}
      {(item.status === 'retired' || item.status === 'lost') && (
        <div className="rounded-xl border border-border bg-muted px-4 py-3 text-[13px] text-muted-foreground">
          This item is marked {item.status} and cannot be taken.
        </div>
      )}

      {/* Primary action — POOLED gear */}
      {!isAssigned && item.status === 'available' && approvalBlocked && (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          <CalendarClock className="h-4 w-4 shrink-0" />
          <span>
            This item needs tech lead approval. Reserve it through a shoot first; once approved,
            you can pick it up here.
          </span>
        </div>
      )}
      {!isAssigned && item.status === 'available' && !approvalBlocked && (
        <Button
          size="lg"
          className="w-full text-[15px]"
          onClick={() => gated(() => setCheckoutOpen(true), 'check out')}
        >
          <CheckCircle2 className="h-5 w-5" />
          {pickupReservation ? `Pick up for ${pickupReservation.shoot_name}` : 'Check out'}
        </Button>
      )}
      {!isAssigned && heldByMe && (
        <Button
          size="lg"
          className="w-full text-[15px]"
          onClick={() => gated(() => setReturnOpen(true), 'check in')}
        >
          <CheckCircle2 className="h-5 w-5" /> Check in
        </Button>
      )}

      {/* Primary action — ASSIGNED device */}
      {deviceResting && isAssigneeMe && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-[13px] text-blue-800 text-center">
          This device is assigned to you.
        </div>
      )}
      {deviceResting && !isAssigneeMe && item.assignee_id && (
        <Button
          size="lg"
          className="w-full text-[15px]"
          disabled={busy}
          onClick={() =>
            gated(
              () => runDeviceAction(() => borrowDevice(item.id), `${item.name} is with you`),
              'borrow'
            )
          }
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Handshake className="h-5 w-5" />}
          Borrow from {item.assignee_name ?? 'owner'}
        </Button>
      )}
      {deviceResting && !item.assignee_id && (
        canManageEquipment && assignPeople ? (
          <Button size="lg" className="w-full text-[15px]" onClick={() => setAssignOpen(true)}>
            <UserRound className="h-5 w-5" /> Assign this device
          </Button>
        ) : (
          <div className="rounded-xl border border-border bg-muted px-4 py-3 text-[13px] text-muted-foreground text-center">
            {canManageEquipment
              ? 'Assign this device from the Tech Console → Devices.'
              : 'This device has no owner yet. Ask the tech lead to assign it.'}
          </div>
        )
      )}
      {isAssigned && heldByMe && (
        <Button
          size="lg"
          className="w-full text-[15px]"
          disabled={busy}
          onClick={() =>
            gated(
              () =>
                runDeviceAction(
                  () => handBackDevice(item.id),
                  `Handed back${item.assignee_name ? ` to ${item.assignee_name}` : ''}`
                ),
              'hand back'
            )
          }
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Handshake className="h-5 w-5" />}
          Hand back{item.assignee_name ? ` to ${item.assignee_name}` : ''}
        </Button>
      )}

      {/* Take over works for both pooled gear and assigned-device loans */}
      {heldByOther && (
        <Button
          size="lg"
          className="w-full text-[15px]"
          onClick={() => gated(() => setTransferOpen(true), 'take over')}
        >
          <ArrowRightLeft className="h-5 w-5" /> Take over from {item.holder_name ?? 'holder'}
        </Button>
      )}

      {/* Reassign shortcut for managers on an already-assigned device */}
      {isAssigned && item.assignee_id && canManageEquipment && assignPeople && (
        <button
          type="button"
          onClick={() => setAssignOpen(true)}
          className="mx-auto block text-[12px] text-muted-foreground hover:text-foreground"
        >
          Reassign owner
        </button>
      )}

      {requireScan &&
        !scanVerified &&
        (item.status === 'available' || heldByMe || heldByOther) &&
        !(deviceResting && isAssigneeMe) && (
          <p className="text-center text-[11.5px] text-muted-foreground -mt-2">
            Taking or returning {isAssigned ? 'a device' : 'gear'} needs a scan of the sticker on the item.
          </p>
        )}

      {/* Secondary actions */}
      <div className="flex items-center justify-center gap-5 text-[12.5px] text-muted-foreground">
        <button
          type="button"
          onClick={() => setIssueOpen(true)}
          className="flex items-center gap-1.5 hover:text-foreground"
        >
          <Flag className="h-3.5 w-3.5" /> Report a problem
        </button>
        <button
          type="button"
          onClick={toggleHistory}
          className="flex items-center gap-1.5 hover:text-foreground"
        >
          <History className="h-3.5 w-3.5" /> {showHistory ? 'Hide history' : 'History'}
        </button>
      </div>

      {showHistory && historyLoading && (
        <div className="flex items-center justify-center gap-2 py-3 text-[12.5px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading history...
        </div>
      )}
      {showHistory && !historyLoading && history !== null && (
        <ol className="relative space-y-3 border-l border-border pl-4 ml-1.5">
          {history.length === 0 && (
            <li className="text-[12.5px] text-muted-foreground">No activity yet.</li>
          )}
          {history.map((e, i) => (
            <li key={i} className="text-[12.5px]">
              <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-border" />
              <div className="text-muted-foreground">{fmtDayTime(e.at)}</div>
              <div>{e.text}</div>
            </li>
          ))}
        </ol>
      )}

      {/* Dialogs */}
      <CheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        initialItems={[item]}
        knownItems={knownItems}
        shootId={pickupReservation?.shoot_id ?? undefined}
        defaultDue={pickupReservation ? toLocalInput(pickupReservation.shoot_ends_at) : undefined}
      />
      <ReturnDialog
        open={returnOpen}
        onOpenChange={setReturnOpen}
        item={item}
        locations={locations}
      />
      <TransferDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        item={{ id: item.id, name: item.name, holder_name: item.holder_name, due_at: item.due_at }}
      />
      <ReportIssueDialog open={issueOpen} onOpenChange={setIssueOpen} item={item} />
      {assignPeople && (
        <AssignDeviceDialog
          open={assignOpen}
          onOpenChange={setAssignOpen}
          item={{ id: item.id, name: item.name, assignee_id: item.assignee_id }}
          people={assignPeople}
        />
      )}
      {pendingAction && (
        <ScanConfirmDialog
          open
          onOpenChange={(o) => !o && setPendingAction(null)}
          expectCode={item.code}
          itemName={item.name}
          actionLabel={pendingAction.label}
          onVerified={() => {
            setScanVerified(true)
            const run = pendingAction.run
            setPendingAction(null)
            run()
          }}
        />
      )}
    </div>
  )
}
