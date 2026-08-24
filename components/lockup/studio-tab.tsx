'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Clapperboard, Loader2, Plus, Trash2 } from 'lucide-react'
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
import { useStore } from '@/lib/store'
import { createStudioHold, removeStudioBlock } from '@/lib/actions/lockup'
import type { StudioScheduleEntry } from '@/lib/queries/lockup'
import type { Tables } from '@/lib/supabase/database.types'
import { cn } from '@/lib/utils'

/** Grid runs 8 AM to 9 PM; anything outside is rare enough to type by hand. */
const DAY_START_HOUR = 8
const DAY_END_HOUR = 21

function startOfWeek(offsetWeeks: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offsetWeeks * 7)
  d.setHours(0, 0, 0, 0)
  return d
}

function isoDay(d: Date): string {
  return d.toLocaleDateString('en-CA')
}

function hm(iso: string): number {
  const d = new Date(iso)
  return d.getHours() + d.getMinutes() / 60
}

/**
 * The Studio tab: a week grid per room, showing shoot blocks and standalone
 * holds side by side. Booking here needs no shoot — the room is the thing being
 * booked, and the database's no-overlap rule keeps the two kinds honest.
 */
export function StudioTab({
  studios,
  entries,
  currentUserId,
  canManageEquipment,
}: {
  studios: Tables<'equipment_studios'>[]
  entries: StudioScheduleEntry[]
  currentUserId: string
  canManageEquipment: boolean
}) {
  const router = useRouter()
  const { pushToast } = useStore()
  const [studioId, setStudioId] = useState(studios[0]?.id ?? '')
  const [weekOffset, setWeekOffset] = useState(0)
  const [bookOpen, setBookOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const weekStart = useMemo(() => startOfWeek(weekOffset), [weekOffset])
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart)
        d.setDate(weekStart.getDate() + i)
        return d
      }),
    [weekStart]
  )

  const studio = studios.find((s) => s.id === studioId) ?? studios[0]
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 7)

  const blocks = entries.filter(
    (e) =>
      e.studio_id === studio?.id &&
      new Date(e.ends_at) > weekStart &&
      new Date(e.starts_at) < weekEnd
  )

  async function release(id: string) {
    setBusyId(id)
    try {
      await removeStudioBlock(id)
      pushToast({ title: 'Slot released', variant: 'success' })
      router.refresh()
    } catch (err) {
      pushToast({
        title: err instanceof Error ? err.message : 'Could not release it',
        variant: 'error',
      })
    } finally {
      setBusyId(null)
    }
  }

  if (studios.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-5 py-12 text-center text-[13px] text-muted-foreground">
        No studios yet. An equipment manager can add one in the Tech Console.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        {studios.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStudioId(s.id)}
            className={cn(
              'rounded-xl border px-4 py-2 text-[13.5px] font-semibold transition-colors',
              s.id === studio?.id
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card hover:bg-accent'
            )}
          >
            {s.name}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setWeekOffset((w) => w - 1)}>
            Prev
          </Button>
          <span className="min-w-[132px] text-center text-[13px] font-semibold">
            {days[0].toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} to{' '}
            {days[6].toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </span>
          <Button variant="outline" size="sm" onClick={() => setWeekOffset((w) => w + 1)}>
            Next
          </Button>
          <Button size="sm" onClick={() => setBookOpen(true)}>
            <Plus className="h-4 w-4" /> Book the studio
          </Button>
        </div>
      </div>

      {/* Week grid */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex border-b border-border pl-12">
          {days.map((d, i) => {
            const today = isoDay(d) === isoDay(new Date())
            return (
              <div
                key={i}
                className={cn(
                  'flex-1 py-2 text-center text-[11.5px] font-semibold',
                  today ? 'text-primary' : i > 4 ? 'text-muted-foreground/50' : 'text-muted-foreground'
                )}
              >
                {d.toLocaleDateString('en-IN', { weekday: 'short' })} {d.getDate()}
              </div>
            )
          })}
        </div>

        <div className="relative flex" style={{ height: 420 }}>
          <div className="flex w-12 shrink-0 flex-col justify-between py-1 pr-1.5 text-right text-[10px] text-muted-foreground">
            {Array.from({ length: 5 }, (_, i) => {
              const hour = DAY_START_HOUR + Math.round((i * (DAY_END_HOUR - DAY_START_HOUR)) / 4)
              return <span key={i}>{hour > 12 ? `${hour - 12} PM` : `${hour} AM`}</span>
            })}
          </div>
          <div className="flex flex-1">
            {days.map((d, i) => {
              const dayKey = isoDay(d)
              const dayBlocks = blocks.filter((b) => isoDay(new Date(b.starts_at)) === dayKey)
              return (
                <div
                  key={i}
                  className={cn(
                    'relative flex-1 border-l border-border/60',
                    i > 4 && 'bg-muted/30'
                  )}
                >
                  {dayBlocks.map((b) => {
                    const top = ((hm(b.starts_at) - DAY_START_HOUR) / (DAY_END_HOUR - DAY_START_HOUR)) * 100
                    const height = ((hm(b.ends_at) - hm(b.starts_at)) / (DAY_END_HOUR - DAY_START_HOUR)) * 100
                    const mine = b.created_by === currentUserId
                    const isHold = !b.shoot_id
                    return (
                      <div
                        key={b.id}
                        className={cn(
                          'absolute inset-x-0.5 overflow-hidden rounded-lg border-l-[3px] px-1.5 py-1',
                          mine
                            ? 'border-l-primary bg-primary/15'
                            : isHold
                              ? 'border-l-sky-500 bg-sky-50'
                              : 'border-l-amber-500 bg-amber-50'
                        )}
                        style={{
                          top: `${Math.max(0, top)}%`,
                          height: `${Math.max(6, Math.min(height, 100 - Math.max(0, top)))}%`,
                        }}
                        title={`${b.shoot_name} · ${new Date(b.starts_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} to ${new Date(b.ends_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} · ${b.created_by_name}`}
                      >
                        {b.shoot_id ? (
                          <Link
                            href={`/lockup/shoots/${b.shoot_id}`}
                            className="block truncate text-[10.5px] font-bold hover:underline"
                          >
                            {b.shoot_name}
                          </Link>
                        ) : (
                          <div className="truncate text-[10.5px] font-bold">{b.shoot_name}</div>
                        )}
                        <div className="truncate text-[9.5px] text-muted-foreground">
                          {b.created_by_name}
                        </div>
                        {(mine || canManageEquipment) && (
                          <button
                            type="button"
                            aria-label="Release this slot"
                            disabled={busyId === b.id}
                            onClick={() => release(b.id)}
                            className="absolute right-0.5 top-0.5 text-muted-foreground hover:text-rose-600"
                          >
                            {busyId === b.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-border px-4 py-2.5 text-[11.5px] text-muted-foreground">
          <Legend className="bg-primary/20" label="Yours" />
          <Legend className="bg-amber-100" label="Shoot" />
          <Legend className="bg-sky-100" label="Hold, no shoot" />
          <span className="ml-auto">Overlapping bookings are refused automatically.</span>
        </div>
      </div>

      <BookStudioDialog
        open={bookOpen}
        onOpenChange={setBookOpen}
        studios={studios}
        defaultStudioId={studio?.id ?? ''}
      />
    </div>
  )
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('h-2.5 w-2.5 rounded-sm', className)} />
      {label}
    </span>
  )
}

function BookStudioDialog({
  open,
  onOpenChange,
  studios,
  defaultStudioId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  studios: Tables<'equipment_studios'>[]
  defaultStudioId: string
}) {
  const router = useRouter()
  const { pushToast } = useStore()
  const [studioId, setStudioId] = useState(defaultStudioId)
  const [title, setTitle] = useState('')
  const [startLocal, setStartLocal] = useState('')
  const [endLocal, setEndLocal] = useState('')
  const [busy, setBusy] = useState(false)

  // Reset per open, defaulting to the next round hour today.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      const start = new Date()
      start.setMinutes(0, 0, 0)
      start.setHours(start.getHours() + 1)
      const end = new Date(start)
      end.setHours(end.getHours() + 2)
      const fmt = (d: Date) => {
        const pad = (n: number) => String(n).padStart(2, '0')
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
      }
      setStudioId(defaultStudioId)
      setTitle('')
      setStartLocal(fmt(start))
      setEndLocal(fmt(end))
    }
  }

  async function submit() {
    setBusy(true)
    try {
      await createStudioHold({
        studioId,
        title,
        startsAt: new Date(startLocal).toISOString(),
        endsAt: new Date(endLocal).toISOString(),
      })
      pushToast({ title: 'Studio booked', variant: 'success' })
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      pushToast({
        title: err instanceof Error ? err.message : 'Could not book the studio',
        variant: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Book the studio</DialogTitle>
          <DialogDescription>
            No shoot needed. Hold the room for an edit, a quick record, whatever it is.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>Studio</Label>
          <div className="flex flex-wrap gap-2">
            {studios.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStudioId(s.id)}
                className={cn(
                  'rounded-lg border px-3.5 py-2 text-[13px] font-semibold transition-colors',
                  s.id === studioId
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:bg-accent'
                )}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="hold-title">What for?</Label>
          <Input
            id="hold-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Edit session, client call, quick record..."
          />
        </div>

        <div className="flex gap-3">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="hold-start">From</Label>
            <Input
              id="hold-start"
              type="datetime-local"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
            />
          </div>
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="hold-end">To</Label>
            <Input
              id="hold-end"
              type="datetime-local"
              value={endLocal}
              onChange={(e) => setEndLocal(e.target.value)}
            />
          </div>
        </div>

        <Button
          className="w-full"
          disabled={busy || !title.trim() || !studioId || !startLocal || !endLocal}
          onClick={submit}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
          Hold the room
        </Button>
      </DialogContent>
    </Dialog>
  )
}
