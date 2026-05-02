'use server'

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  ActionError,
  requireCapability,
  revalidateHR,
  writeAudit,
} from './_helpers'

const HolidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  name: z.string().min(1),
})

export async function createHoliday(input: z.infer<typeof HolidaySchema>) {
  const actor = await requireCapability('manage_holidays')
  const parsed = HolidaySchema.parse(input)

  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('holidays')
    .insert(parsed)
    .select()
    .single()

  if (error || !data) throw new ActionError(error?.message ?? 'Create failed')
  await writeAudit(actor.id, 'holiday.create', 'holiday', data.id, { after: data })
  await revalidateHR()
  return data
}

export async function updateHoliday(input: { id: string; date?: string; name?: string }) {
  const actor = await requireCapability('manage_holidays')
  const adminClient = createAdminClient()

  const { id, ...updates } = input
  const { data, error } = await adminClient
    .from('holidays')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new ActionError(error.message)

  await writeAudit(actor.id, 'holiday.update', 'holiday', id, { after: data })
  await revalidateHR()
  return data
}

export async function deleteHoliday(id: string) {
  const actor = await requireCapability('manage_holidays')
  const adminClient = createAdminClient()
  const { error } = await adminClient.from('holidays').delete().eq('id', id)
  if (error) throw new ActionError(error.message)
  await writeAudit(actor.id, 'holiday.delete', 'holiday', id)
  await revalidateHR()
}

const CsvRowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().min(1),
})

export async function importHolidaysCsv(rows: { date: string; name: string }[]) {
  const actor = await requireCapability('manage_holidays')
  const adminClient = createAdminClient()
  const errors: { row: number; error: string }[] = []
  const valid: { date: string; name: string }[] = []

  rows.forEach((row, i) => {
    const parsed = CsvRowSchema.safeParse(row)
    if (parsed.success) valid.push(parsed.data)
    else errors.push({ row: i + 1, error: parsed.error.message })
  })

  if (valid.length > 0) {
    const { error } = await adminClient
      .from('holidays')
      .upsert(valid, { onConflict: 'date' })
    if (error) errors.push({ row: -1, error: error.message })
  }

  await writeAudit(actor.id, 'holiday.import', 'holiday', 'batch', {
    after: { imported: valid.length, errors: errors.length },
  })
  await revalidateHR()
  return { imported: valid.length, errors }
}
