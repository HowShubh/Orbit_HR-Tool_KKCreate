'use server'

import { z } from 'zod'
import { requireUser } from './_helpers'
import { listRosterContext } from '@/lib/queries/leave-requests'
import { createAdminClient } from '@/lib/supabase/admin'
import type { RosterCell } from '@/components/approvals/leave-request-types'

const Schema = z.object({
  team_id: z.string().uuid(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export async function fetchRosterContext(
  input: z.infer<typeof Schema>
): Promise<RosterCell[]> {
  const me = await requireUser()
  const parsed = Schema.parse(input)

  const adminClient = createAdminClient()
  const isPrivileged = me.role === 'hr' || me.role === 'founder'

  if (!isPrivileged) {
    // Allow if I lead this team or am a current member
    const [{ data: team }, { data: membership }] = await Promise.all([
      adminClient
        .from('teams')
        .select('team_lead_id')
        .eq('id', parsed.team_id)
        .maybeSingle(),
      adminClient
        .from('team_members')
        .select('user_id')
        .eq('team_id', parsed.team_id)
        .eq('user_id', me.id)
        .is('left_at', null)
        .maybeSingle(),
    ])
    const isLead = team?.team_lead_id === me.id
    const isMember = !!membership
    if (!isLead && !isMember) {
      throw new Error('Not authorized to view this team roster')
    }
  }

  return listRosterContext(parsed.team_id, parsed.start_date, parsed.end_date)
}
