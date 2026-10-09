'use server'

import { ActionError } from './errors'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  requireUser,
  requireCapability,
  writeAudit,
  revalidateHR,
} from './_helpers'

const BUCKET = 'avatars'
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

function extFor(type: string) {
  if (type === 'image/png') return 'png'
  if (type === 'image/webp') return 'webp'
  if (type === 'image/gif') return 'gif'
  return 'jpg'
}

// Extract the storage object path from a public URL we previously generated,
// so we can delete the old file when a new one replaces it.
function pathFromPublicUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const marker = `/object/public/${BUCKET}/`
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  return url.slice(idx + marker.length)
}

// Uploads a new avatar, then deletes the previous file once the new one is in
// place. Returns the public URL of the new file.
async function uploadAndSwap(file: File, folder: string, prevUrl: string | null): Promise<string> {
  if (!file || file.size === 0) throw new ActionError('No image was provided.')
  if (file.size > MAX_BYTES) throw new ActionError('Image must be under 5 MB.')
  if (!ALLOWED.includes(file.type)) {
    throw new ActionError('Use a JPG, PNG, WebP, or GIF image.')
  }

  const admin = createAdminClient()
  const path = `${folder}/${Date.now()}.${extFor(file.type)}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false })
  if (uploadError) throw new ActionError(uploadError.message)

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)
  const publicUrl = pub.publicUrl

  const prevPath = pathFromPublicUrl(prevUrl)
  if (prevPath && prevPath !== path) {
    // Best-effort cleanup of the previous photo — don't fail the swap if it errors.
    await admin.storage.from(BUCKET).remove([prevPath])
  }

  return publicUrl
}

async function setUserPhoto(userId: string, formData: FormData, actorId: string): Promise<string> {
  const file = formData.get('file') as File | null
  if (!file) throw new ActionError('No image was provided.')

  const admin = createAdminClient()
  const { data: before } = await admin
    .from('users')
    .select('photo_url')
    .eq('id', userId)
    .maybeSingle()

  const publicUrl = await uploadAndSwap(file, `users/${userId}`, before?.photo_url ?? null)

  const { error } = await admin.from('users').update({ photo_url: publicUrl }).eq('id', userId)
  if (error) throw new ActionError(error.message)

  await writeAudit(actorId, 'user.photo_update', 'user', userId, {
    before: { photo_url: before?.photo_url ?? null },
    after: { photo_url: publicUrl },
  })
  await revalidateHR()
  return publicUrl
}

/** Update your own profile photo. */
export async function updateMyPhoto(formData: FormData): Promise<string> {
  const user = await requireUser()
  return setUserPhoto(user.id, formData, user.id)
}

/** HR/Founder: update any user's profile photo. */
export async function updateUserPhoto(userId: string, formData: FormData): Promise<string> {
  const actor = await requireCapability('manage_users')
  return setUserPhoto(userId, formData, actor.id)
}

/** Remove your own profile photo (reverts to the generated initials avatar). */
export async function removeMyPhoto(): Promise<void> {
  const user = await requireUser()
  const admin = createAdminClient()
  const { data: before } = await admin
    .from('users')
    .select('photo_url')
    .eq('id', user.id)
    .maybeSingle()

  const { error } = await admin.from('users').update({ photo_url: null }).eq('id', user.id)
  if (error) throw new ActionError(error.message)

  const prevPath = pathFromPublicUrl(before?.photo_url)
  if (prevPath) await admin.storage.from(BUCKET).remove([prevPath])

  await writeAudit(user.id, 'user.photo_remove', 'user', user.id)
  await revalidateHR()
}

/** HR/Founder: update a team's profile photo. */
export async function updateTeamPhoto(teamId: string, formData: FormData): Promise<string> {
  const actor = await requireCapability('manage_users')
  const file = formData.get('file') as File | null
  if (!file) throw new ActionError('No image was provided.')

  const admin = createAdminClient()
  const { data: before } = await admin
    .from('teams')
    .select('photo_url')
    .eq('id', teamId)
    .maybeSingle()

  const publicUrl = await uploadAndSwap(file, `teams/${teamId}`, before?.photo_url ?? null)

  const { error } = await admin.from('teams').update({ photo_url: publicUrl }).eq('id', teamId)
  if (error) throw new ActionError(error.message)

  await writeAudit(actor.id, 'team.photo_update', 'team', teamId, {
    before: { photo_url: before?.photo_url ?? null },
    after: { photo_url: publicUrl },
  })
  await revalidateHR()
  return publicUrl
}
