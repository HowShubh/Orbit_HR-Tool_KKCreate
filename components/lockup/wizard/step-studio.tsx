'use client'

import type { StudioScheduleEntry } from '@/lib/queries/lockup'
import type { Tables } from '@/lib/supabase/database.types'
import { StudioWeekPicker } from '../studio-week-picker'
import type { StudioSlot } from './shoot-wizard'

/** Step 2 is the shared studio picker with shoot-flavoured wording. */
export function StepStudio({
  studios,
  blocks,
  slots,
  onSlotsChange,
}: {
  studios: Tables<'equipment_studios'>[]
  blocks: StudioScheduleEntry[]
  slots: StudioSlot[]
  onSlotsChange: (slots: StudioSlot[]) => void
}) {
  return (
    <StudioWeekPicker
      studios={studios}
      blocks={blocks}
      slots={slots}
      onSlotsChange={onSlotsChange}
      slotsTitle="Studio slots on this shoot"
      emptyHint="No studio slot yet. That is fine: outdoor shoots skip this step entirely."
    />
  )
}
