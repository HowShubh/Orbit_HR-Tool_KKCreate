import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Tables } from '@/lib/supabase/database.types'

export type AppUser = Tables<'users'>

/**
 * Wrapped in React.cache so the layout and child pages share a single fetch
 * within the same request. Without this, every server component that calls
 * getCurrentUser triggers an independent auth + users-table round-trip to
 * Supabase. With it: 1 round-trip per navigation.
 */
export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  const supabase = createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) return null

  const adminClient = createAdminClient()
  const { data: user } = await adminClient
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single()

  return user ?? null
})

/** Same dedupe for the team-context fetched by both the layout and pages. */
export const getCurrentUserTeamContext = cache(
  async (
    userId: string
  ): Promise<{
    ledTeamIds: string[]
    membersByTeam: Record<string, string[]>
  }> => {
    const adminClient = createAdminClient()
    const [ledTeamsRes, membersRes] = await Promise.all([
      adminClient.from('teams').select('id').eq('team_lead_id', userId),
      adminClient.from('team_members').select('user_id, team_id').is('left_at', null),
    ])

    const ledTeamIds = (ledTeamsRes.data ?? []).map((t) => t.id)
    const membersByTeam: Record<string, string[]> = {}
    for (const m of membersRes.data ?? []) {
      if (!membersByTeam[m.team_id]) membersByTeam[m.team_id] = []
      membersByTeam[m.team_id].push(m.user_id)
    }

    return { ledTeamIds, membersByTeam }
  }
)
