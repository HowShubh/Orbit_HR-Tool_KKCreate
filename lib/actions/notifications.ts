'use server'

import { ActionError } from './errors'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from './_helpers'

/** Internal: create a notification row. Used by other server actions. */
export async function notifyUser(input: {
  user_id: string
  type: string
  title: string
  body: string
  link_url?: string
  related_entity_type?: string
  related_entity_id?: string
}): Promise<void> {
  const adminClient = createAdminClient()
  await adminClient.from('notifications').insert({
    user_id: input.user_id,
    type: input.type,
    title: input.title,
    body: input.body,
    link_url: input.link_url ?? null,
    related_entity_type: input.related_entity_type ?? null,
    related_entity_id: input.related_entity_id ?? null,
  })
}

export async function markNotificationRead(notificationId: string) {
  const user = await requireUser()
  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('user_id', user.id)
  if (error) throw new ActionError(error.message)
  revalidatePath('/')
}

export async function markAllNotificationsRead() {
  const user = await requireUser()
  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('read_at', null)
  if (error) throw new ActionError(error.message)
  revalidatePath('/')
}
