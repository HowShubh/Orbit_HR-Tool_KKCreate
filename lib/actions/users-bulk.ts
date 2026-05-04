'use server'

import { ActionError } from './errors'

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { seedDefaultBalances } from '@/lib/db/seed-balances'
import { requireCapability, writeAudit, revalidateHR } from './_helpers'

const CURRENT_LEAVE_YEAR = 2026

const RowSchema = z.object({
  full_name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(['employee', 'team_lead', 'hr', 'founder']),
  manager_email: z.string().email().optional().or(z.literal('')),
  primary_team_name: z.string().optional().or(z.literal('')),
  designation: z.string().optional().or(z.literal('')),
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
  let imported = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const parsed = RowSchema.safeParse(row)
    if (!parsed.success) {
      errors.push({ row: i + 1, error: parsed.error.issues[0]?.message ?? 'Invalid row' })
      continue
    }

    const data = parsed.data
    const managerId = data.manager_email
      ? userByEmail.get(data.manager_email.toLowerCase()) ?? null
      : null
    const teamId = data.primary_team_name
      ? teamByName.get(data.primary_team_name.toLowerCase()) ?? null
      : null

    // Generate a temporary password for the user — they'll reset on first login
    const tempPassword = `Welcome${Math.random().toString(36).slice(2, 10)}!`

    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: data.email,
      password: tempPassword,
      email_confirm: true,
    })

    if (authError || !authData.user) {
      errors.push({ row: i + 1, error: authError?.message ?? 'Auth create failed' })
      continue
    }

    const { error: insertError } = await adminClient.from('users').insert({
      id: authData.user.id,
      email: data.email,
      full_name: data.full_name,
      role: data.role,
      manager_id: managerId,
      designation: data.designation || null,
      joined_at: new Date().toISOString().split('T')[0],
    })

    if (insertError) {
      await adminClient.auth.admin.deleteUser(authData.user.id)
      errors.push({ row: i + 1, error: insertError.message })
      continue
    }

    await adminClient.rpc('recompute_role_bundles', {
      p_user_id: authData.user.id,
      p_new_role: data.role,
    })

    await seedDefaultBalances(adminClient, authData.user.id, CURRENT_LEAVE_YEAR)

    if (teamId) {
      await adminClient.from('team_members').insert({
        user_id: authData.user.id,
        team_id: teamId,
        is_primary: true,
      })
    }

    imported++
    userByEmail.set(data.email.toLowerCase(), authData.user.id)
  }

  await writeAudit(actor.id, 'user.import', 'user', 'batch', {
    after: { imported, errors: errors.length },
  })
  await revalidateHR()
  return { imported, errors }
}
