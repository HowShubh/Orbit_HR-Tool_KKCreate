'use server'

import { ActionError } from './errors'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser, writeAudit } from './_helpers'

const ProfileSchema = z.object({
  phone: z.string().nullable().optional(),
  notifications_muted: z.boolean().optional(),
})

export async function updateMyProfile(input: z.infer<typeof ProfileSchema>) {
  const user = await requireUser()
  const parsed = ProfileSchema.parse(input)

  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('users')
    .update(parsed)
    .eq('id', user.id)
    .select()
    .single()

  if (error || !data) throw new ActionError(error?.message ?? 'Update failed')

  await writeAudit(user.id, 'profile.update', 'user', user.id, { after: parsed })
  revalidatePath('/settings')
  revalidatePath('/profile')
  return data
}
