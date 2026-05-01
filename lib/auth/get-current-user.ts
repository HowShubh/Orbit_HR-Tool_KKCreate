import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Tables } from '@/lib/supabase/database.types'

export type AppUser = Tables<'users'>

export async function getCurrentUser(): Promise<AppUser | null> {
  const supabase = createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) return null

  // Use admin client to bypass RLS for the layout check
  const adminClient = createAdminClient()
  const { data: user } = await adminClient
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single()

  return user ?? null
}
