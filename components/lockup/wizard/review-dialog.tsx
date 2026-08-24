'use client'

import { AlertTriangle, Check, Clapperboard, Loader2, MapPin, Users } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { AvailabilityRow } from '@/lib/queries/lockup'
import { cn } from '@/lib/utils'
import { CodeChip } from '../item-bits'

export type ReviewLine = { label: string; sub?: string }

/**
 * The last look before a shoot is created: the three steps laid out as three
 * sections, with every conflict stated plainly rather than left for the user
 * to discover on the shoot page afterwards.
 */
export function ReviewDialog({
  open,
  onOpenChange,
  name,
  windowLabel,
  editors,
  outsideAddress,
  studioLines,
  gear,
  busy,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  name: string
  windowLabel: string
  editors: string[]
  outsideAddress: string | null
  studioLines: string[]
  /** Chosen gear, each with the conflict (if any) computed for the window. */
  gear: AvailabilityRow[]
  busy: boolean
  onConfirm: () => void
}) {
  const clashing = gear.filter((g) => g.conflict)
  const approvals = gear.filter((g) => g.requires_approval)

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review your plan</DialogTitle>
          <DialogDescription>
            Everything below is created in one go. You can change any of it afterwards.
          </DialogDescription>
        </DialogHeader>

        <Section n={1} label="Details">
          <div className="text-[14px] font-semibold text-foreground">{name.trim() || 'Unnamed shoot'}</div>
          <div>{windowLabel}</div>
          {editors.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> {editors.join(', ')}
            </div>
          )}
          {outsideAddress && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" /> {outsideAddress}
            </div>
          )}
        </Section>

        <Section n={2} label="Studio">
          {studioLines.length === 0 ? (
            <div className="text-muted-foreground/70">No studio booked for this shoot.</div>
          ) : (
            studioLines.map((line, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Clapperboard className="h-3.5 w-3.5" /> {line}
              </div>
            ))
          )}
        </Section>

        <Section n={3} label={`Gear (${gear.length})`}>
          {gear.length === 0 ? (
            <div className="text-muted-foreground/70">No gear reserved.</div>
          ) : (
            <ul className="space-y-1.5">
              {gear.map((g) => (
                <li
                  key={g.item_id}
                  className={cn(
                    'flex items-start gap-2 rounded-lg border px-2.5 py-1.5',
                    g.conflict ? 'border-rose-200 bg-rose-50' : 'border-border'
                  )}
                >
                  {g.conflict ? (
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
                  ) : (
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-semibold text-foreground">
                        {g.name}
                      </span>
                      <CodeChip code={g.code} />
                      {g.requires_approval && (
                        <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-px text-[10px] font-semibold text-amber-700">
                          approval
                        </span>
                      )}
                    </div>
                    {g.conflict && (
                      <div className="text-[11.5px] text-rose-700">{g.conflict.message}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {(clashing.length > 0 || approvals.length > 0) && (
          <div className="space-y-1.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-[12.5px] text-amber-800">
            {clashing.length > 0 && (
              <div>
                <span className="font-semibold">{clashing.length} clash</span>
                {clashing.length === 1 ? 'es' : ''} with something already booked. You can still
                reserve; whoever booked it first gets notified.
              </div>
            )}
            {approvals.length > 0 && (
              <div>
                <span className="font-semibold">{approvals.length} item</span>
                {approvals.length === 1 ? '' : 's'} need the Tech Lead to approve before pickup.
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Keep editing
          </Button>
          <Button type="button" className="flex-1" disabled={busy} onClick={onConfirm}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Create shoot
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Section({
  n,
  label,
  children,
}: {
  n: number
  label: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-1.5 rounded-xl border border-border p-3">
      <div className="flex items-center gap-1.5">
        <span className="grid h-4 w-4 place-items-center rounded-full bg-primary/10 text-[9.5px] font-bold text-primary">
          {n}
        </span>
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="space-y-1 pl-[22px] text-[12.5px] text-muted-foreground">{children}</div>
    </section>
  )
}
