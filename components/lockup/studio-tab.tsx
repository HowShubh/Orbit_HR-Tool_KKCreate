'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Clapperboard, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useStore } from '@/lib/store'
import { createStudioHold, removeStudioBlock } from '@/lib/actions/lockup'
import type { StudioScheduleEntry } from '@/lib/queries/lockup'
import type { Tables } from '@/lib/supabase/database.types'
import { StudioWeekPicker } from './studio-week-picker'
import { dayLabel, slotLabel, type StudioSlot } from './schedule-picker'


/**
 * The Studio tab. Booking here is the SAME surface as step 2 of shoot
 * planning: tap free time on the week grid, adjust below, name it, done.
 * It used to be a dialog of raw datetime fields that defaulted to midnight
 * and could not see the grid behind it.
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
  const [slots, setSlots] = useState<StudioSlot[]>([])
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [releasingId, setReleasingId] = useState<string | null>(null)

  const studioNameOf = (id: string) => studios.find((s) => s.id === id)?.name ?? 'Studio'

  // Bookings this person can clear: their own, or anything if they manage gear.
  const mine = entries.filter(
    (e) => e.created_by === currentUserId || canManageEquipment
  )

  async function hold() {
    if (slots.length === 0 || !title.trim()) return
    setBusy(true)
    try {
      for (const sl of slots) {
        await createStudioHold({
          studioId: sl.studioId,
          title: title.trim(),
          startsAt: new Date(`${sl.date}T${sl.startHM}`).toISOString(),
          endsAt: new Date(`${sl.date}T${sl.endHM}`).toISOString(),
        })
      }
      pushToast({
        title:
          slots.length === 1
            ? `${studioNameOf(slots[0].studioId)} is yours`
            : `${slots.length} studio slots booked`,
        variant: 'success',
      })
      setSlots([])
      setTitle('')
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

  async function release(id: string) {
    setReleasingId(id)
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
      setReleasingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <StudioWeekPicker
        studios={studios}
        blocks={entries}
        slots={slots}
        onSlotsChange={setSlots}
        slotsTitle="Booking"
        emptyHint="Tap any free time on the grid to hold a room. No shoot needed."
      />

      {/* Name and confirm, shown only once something is picked */}
      {slots.length > 0 && (
        <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="hold-title">What is the room for?</Label>
            <Input
              id="hold-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Edit session, client call, quick record..."
              autoFocus
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={busy || !title.trim()} onClick={hold}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
              Hold {slots.length === 1 ? 'the room' : `all ${slots.length} slots`}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setSlots([])}>
              Clear
            </Button>
            <span className="text-[12px] text-muted-foreground">
              Planning a whole shoot instead?{' '}
              <Link href="/lockup/shoots/new" className="font-medium text-primary hover:underline">
                Plan a shoot
              </Link>
            </span>
          </div>
        </div>
      )}

      {/* Your existing bookings, so they can be released without hunting the grid */}
      {mine.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">
            {canManageEquipment ? 'All bookings' : 'Your bookings'}
          </div>
          <ul className="space-y-2">
            {mine
              .slice()
              .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
              .map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5"
                >
                  <Clapperboard className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-semibold">
                      {e.shoot_id ? (
                        <Link href={`/lockup/shoots/${e.shoot_id}`} className="hover:underline">
                          {e.shoot_name}
                        </Link>
                      ) : (
                        e.shoot_name
                      )}
                    </div>
                    <div className="text-[12px] text-muted-foreground">
                      {e.studio_name} · {fmtBlock(e.starts_at, e.ends_at)} · {e.created_by_name}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Release this slot"
                    disabled={releasingId === e.id}
                    onClick={() => release(e.id)}
                    className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-rose-600"
                  >
                    {releasingId === e.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function fmtBlock(startsAt: string, endsAt: string): string {
  const s = new Date(startsAt)
  const e = new Date(endsAt)
  const hm = (d: Date) =>
    slotLabel(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
  const day = dayLabel(s.toLocaleDateString('en-CA'))
  return `${day}, ${hm(s)} to ${hm(e)}`
}
