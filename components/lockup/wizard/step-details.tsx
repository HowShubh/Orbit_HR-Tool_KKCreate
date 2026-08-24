'use client'

import { useState } from 'react'
import { MapPin, Pencil, UserPlus, X } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import {
  END_SLOTS,
  RangeCalendar,
  START_SLOTS,
  TimeSlotColumn,
  isoDay,
  nextRange,
  slotLabel,
} from '../schedule-picker'
import { dayLabel, type Person } from './shoot-wizard'

export function StepDetails({
  name,
  onNameChange,
  locationType,
  onLocationTypeChange,
  outsideAddress,
  onOutsideAddressChange,
  notes,
  onNotesChange,
  editorIds,
  onEditorIdsChange,
  people,
  window: win,
  onWindowChange,
  windowAdoptedFromStudio,
}: {
  name: string
  onNameChange: (v: string) => void
  locationType: 'studio' | 'outside'
  onLocationTypeChange: (v: 'studio' | 'outside') => void
  outsideAddress: string
  onOutsideAddressChange: (v: string) => void
  notes: string
  onNotesChange: (v: string) => void
  editorIds: string[]
  onEditorIdsChange: (v: string[]) => void
  people: Person[]
  window: { startDate: string; startTime: string; endDate: string; endTime: string }
  onWindowChange: (v: {
    startDate: string
    startTime: string
    endDate: string
    endTime: string
  }) => void
  windowAdoptedFromStudio: boolean
}) {
  const [whenOpen, setWhenOpen] = useState(false)

  const sameDay = win.startDate === win.endDate
  const endSlots = sameDay ? END_SLOTS.filter((s) => s > win.startTime) : END_SLOTS
  const windowLabel = sameDay
    ? `${dayLabel(win.startDate)}, ${slotLabel(win.startTime)} to ${slotLabel(win.endTime)}`
    : `${dayLabel(win.startDate)}, ${slotLabel(win.startTime)} to ${dayLabel(win.endDate)}, ${slotLabel(win.endTime)}`

  const addableEditors = people.filter((p) => !editorIds.includes(p.id))

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="wizard-name">Shoot name</Label>
        <Input
          id="wizard-name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder='e.g. "Podcast Ep 42"'
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <Label>Shoot location</Label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onLocationTypeChange('studio')}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors',
              locationType === 'studio'
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border hover:bg-muted'
            )}
          >
            Studio
          </button>
          <button
            type="button"
            onClick={() => onLocationTypeChange('outside')}
            className={cn(
              'flex items-center gap-1 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors',
              locationType === 'outside'
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border hover:bg-muted'
            )}
          >
            <MapPin className="h-3.5 w-3.5" /> Outside
          </button>
          {locationType === 'outside' && (
            <Input
              value={outsideAddress}
              onChange={(e) => onOutsideAddressChange(e.target.value)}
              placeholder="outside address..."
              className="min-w-[200px] flex-1"
            />
          )}
        </div>
        {locationType === 'studio' && (
          <p className="text-[12px] text-muted-foreground">
            Pick which studio (and its time) in the next step. Booking one fills the location in.
          </p>
        )}
      </div>

      {/* When: collapsed summary by default so the step stays light */}
      <div className="space-y-1.5">
        <Label>When</Label>
        {whenOpen ? (
          <div className="space-y-3 rounded-xl border border-border p-3">
            <RangeCalendar
              start={win.startDate}
              end={win.endDate}
              minDay={isoDay(new Date())}
              onPick={(iso) => {
                const r = nextRange(win.startDate, win.endDate, iso)
                onWindowChange({ ...win, startDate: r.start, endDate: r.end })
              }}
            />
            <p className="text-[12px] text-muted-foreground">
              Tap a day for a one-day shoot; tap a later day to stretch it into a range.
            </p>
            <div className="flex gap-3">
              <TimeSlotColumn
                label={sameDay ? 'Starts at' : `Starts (${dayLabel(win.startDate)})`}
                slots={START_SLOTS}
                value={win.startTime}
                onChange={(hm) => {
                  const next = { ...win, startTime: hm }
                  if (sameDay && next.endTime <= hm) {
                    next.endTime = END_SLOTS.find((s) => s > hm) ?? '23:59'
                  }
                  onWindowChange(next)
                }}
              />
              <TimeSlotColumn
                label={sameDay ? 'Ends at' : `Ends (${dayLabel(win.endDate)})`}
                slots={endSlots}
                value={win.endTime}
                onChange={(hm) => onWindowChange({ ...win, endTime: hm })}
              />
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setWhenOpen(true)}
            className="flex w-full items-center justify-between rounded-xl border border-border px-3 py-2.5 text-left text-[13px] hover:bg-muted"
          >
            <span>
              {windowLabel}{' '}
              <span className="text-muted-foreground">
                {windowAdoptedFromStudio ? '(from your studio slot)' : ''}
              </span>
            </span>
            <span className="flex items-center gap-1 text-[12.5px] text-muted-foreground">
              <Pencil className="h-3.5 w-3.5" /> Change
            </span>
          </button>
        )}
        <p className="text-[12px] text-muted-foreground">
          This window is what blocks the gear: reservations expire against it and due dates
          default to its end.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>
          Who else can plan this shoot?{' '}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        {editorIds.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {editorIds.map((id) => {
              const person = people.find((p) => p.id === id)
              return (
                <span
                  key={id}
                  className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[12.5px]"
                >
                  {person?.full_name ?? 'Unknown'}
                  <button
                    type="button"
                    aria-label={`Remove ${person?.full_name ?? 'editor'}`}
                    onClick={() => onEditorIdsChange(editorIds.filter((x) => x !== id))}
                    className="rounded p-0.5 hover:bg-background"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )
            })}
          </div>
        )}
        {addableEditors.length > 0 && (
          <Select
            value=""
            onValueChange={(id) => id && onEditorIdsChange([...editorIds, id])}
          >
            <SelectTrigger className="w-full">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <UserPlus className="h-3.5 w-3.5" />
                <SelectValue placeholder="Add an editor..." />
              </span>
            </SelectTrigger>
            <SelectContent>
              {addableEditors.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <p className="text-[12px] text-muted-foreground">
          Editors can reserve gear and change this shoot, same as you.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="wizard-notes">
          Notes <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="wizard-notes"
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Anything the crew should know..."
          rows={2}
        />
      </div>
    </div>
  )
}
