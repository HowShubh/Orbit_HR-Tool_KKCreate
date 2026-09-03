'use server'

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { seedDefaultBalances } from '@/lib/db/seed-balances'
import { todayIST, currentFiscalYearStart } from '@/lib/date'
import { requireCapability, writeAudit, revalidateHR } from './_helpers'

const OptionalStringSchema = z.string().trim().optional().default('')
const OptionalEmailSchema = z
  .string()
  .trim()
  .optional()
  .default('')
  .transform((value) => value.toLowerCase())
  .refine((value) => value === '' || /^[^@]+@[^@]+\.[^@]+$/.test(value), 'Invalid manager email')

const OptionalDateSchema = z
  .string()
  .trim()
  .optional()
  .default('')
  .refine((value) => value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value), 'Date must be YYYY-MM-DD')

const RowSchema = z.object({
  full_name: z.string().trim().min(1, 'Name required'),
  email: z.string().trim().email('Invalid email').transform((value) => value.toLowerCase()),
  role: z.enum(['employee', 'team_lead', 'hr', 'founder']),
  manager_email: OptionalEmailSchema,
  primary_team_name: OptionalStringSchema,
  designation: OptionalStringSchema,
  joined_at: OptionalDateSchema,
  date_of_birth: OptionalDateSchema,
  password: OptionalStringSchema.refine(
    (value) => value === '' || value.length >= 8,
    'Password must be at least 8 characters'
  ),
})

export async function importUsersCsv(rows: Record<string, string>[]) {
  const actor = await requireCapability('manage_users')
  const adminClient = createAdminClient()

  // Lookup managers and teams once
  const { data: existingUsers } = await adminClient.from('users').select('id, email')
  const userByEmail = new Map((existingUsers ?? []).map((u) => [u.email.toLowerCase(), u.id]))
  const { data: teams } = await adminClient.from('teams').select('id, name')
  const teamByName = new Map((teams ?? []).map((t) => [t.name.toLowerCase(), t.id]))

  const errors: { row: number; error: string }[] = []
  const normalizedRows: Array<{
    row: number
    full_name: string
    email: string
    role: 'employee' | 'team_lead' | 'hr' | 'founder'
    manager_email: string
    primary_team_name: string
    designation: string
    joined_at: string
    date_of_birth: string
    password: string
  }> = []
  const uploadedEmails = new Map<string, number>()

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNumber = Number(row.__row ?? row.row ?? i + 1)
    const parsed = RowSchema.safeParse(row)
    if (!parsed.success) {
      errors.push({ row: rowNumber, error: parsed.error.issues[0]?.message ?? 'Invalid row' })
      continue
    }

    const data = parsed.data
    if (userByEmail.has(data.email)) {
      errors.push({ row: rowNumber, error: `User already exists: ${data.email}` })
      continue
    }
    if (uploadedEmails.has(data.email)) {
      errors.push({ row: rowNumber, error: `Duplicate email in CSV; first seen on row ${uploadedEmails.get(data.email)}` })
      continue
    }
    uploadedEmails.set(data.email, rowNumber)
    normalizedRows.push({ row: rowNumber, ...data })
  }

  const knownEmails = new Set([...userByEmail.keys(), ...uploadedEmails.keys()])
  for (const row of normalizedRows) {
    if (row.manager_email && row.manager_email === row.email) {
      errors.push({ row: row.row, error: 'Manager email cannot be the same as user email' })
    }
    if (row.manager_email && !knownEmails.has(row.manager_email)) {
      errors.push({ row: row.row, error: `Manager not found: ${row.manager_email}` })
    }
    if (row.primary_team_name && !teamByName.has(row.primary_team_name.toLowerCase())) {
      errors.push({ row: row.row, error: `Team not found: ${row.primary_team_name}` })
    }
  }

  if (errors.length > 0) {
    await writeAudit(actor.id, 'user.import', 'user', 'batch', {
      after: { imported: 0, errors: errors.length },
    })
    return { imported: 0, errors, credentials: [] as Array<{ row: number; email: string; password: string }> }
  }

  const createdUsers: Array<{
    row: number
    id: string
    email: string
    password: string
    manager_email: string
    primary_team_name: string
  }> = []

  async function rollbackCreatedUsers() {
    const ids = createdUsers.map((user) => user.id)
    if (ids.length === 0) return

    await adminClient.from('team_members').delete().in('user_id', ids)
    await adminClient.from('users').delete().in('id', ids)
    await Promise.all(ids.map((id) => adminClient.auth.admin.deleteUser(id)))
  }

  for (const data of normalizedRows) {
    // Generate a temporary password for the user — they'll reset on first login
    const password = data.password || `Welcome${Math.random().toString(36).slice(2, 10)}!`

    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: data.email,
      password,
      email_confirm: true,
    })

    if (authError || !authData.user) {
      await rollbackCreatedUsers()
      errors.push({ row: data.row, error: authError?.message ?? 'Auth create failed' })
      return { imported: 0, errors, credentials: [] as Array<{ row: number; email: string; password: string }> }
    }

    const { error: insertError } = await adminClient.from('users').insert({
      id: authData.user.id,
      email: data.email,
      full_name: data.full_name,
      role: data.role,
      manager_id: null,
      designation: data.designation || null,
      joined_at: data.joined_at || todayIST(),
      date_of_birth: data.date_of_birth || null,
    })

    if (insertError) {
      await adminClient.auth.admin.deleteUser(authData.user.id)
      await rollbackCreatedUsers()
      errors.push({ row: data.row, error: insertError.message })
      return { imported: 0, errors, credentials: [] as Array<{ row: number; email: string; password: string }> }
    }

    await adminClient.rpc('recompute_role_bundles', {
      p_user_id: authData.user.id,
      p_new_role: data.role,
    })

    await seedDefaultBalances(
      adminClient,
      authData.user.id,
      currentFiscalYearStart(),
      todayIST()
    )

    createdUsers.push({
      row: data.row,
      id: authData.user.id,
      email: data.email,
      password,
      manager_email: data.manager_email,
      primary_team_name: data.primary_team_name,
    })
    userByEmail.set(data.email.toLowerCase(), authData.user.id)
  }

  for (const user of createdUsers) {
    const managerId = user.manager_email ? userByEmail.get(user.manager_email) ?? null : null
    if (managerId) {
      const { error } = await adminClient
        .from('users')
        .update({ manager_id: managerId })
        .eq('id', user.id)

      if (error) {
        await rollbackCreatedUsers()
        errors.push({ row: user.row, error: error.message })
        return { imported: 0, errors, credentials: [] as Array<{ row: number; email: string; password: string }> }
      }
    }

    const teamId = user.primary_team_name
      ? teamByName.get(user.primary_team_name.toLowerCase()) ?? null
      : null
    if (teamId) {
      const { error } = await adminClient.from('team_members').insert({
        user_id: user.id,
        team_id: teamId,
        is_primary: true,
      })

      if (error) {
        await rollbackCreatedUsers()
        errors.push({ row: user.row, error: error.message })
        return { imported: 0, errors, credentials: [] as Array<{ row: number; email: string; password: string }> }
      }
    }
  }

  await writeAudit(actor.id, 'user.import', 'user', 'batch', {
    after: { imported: createdUsers.length, errors: errors.length },
  })
  await revalidateHR()
  return {
    imported: createdUsers.length,
    errors,
    credentials: createdUsers.map((user) => ({
      row: user.row,
      email: user.email,
      password: user.password,
    })),
  }
}
