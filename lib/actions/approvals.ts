'use server'

import { z } from 'zod'
import { requireUser } from './_helpers'
import { listRosterContext } from '@/lib/queries/leave-requests'
import type { RosterCell } from '@/components/approvals/leave-request-types'

const Schema = z.object({
  team_id: z.string().uuid(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export async function fetchRosterContext(
  input: z.infer<typeof Schema>
): Promise<RosterCell[]> {
  await requireUser()                    // any authed user can call
  const parsed = Schema.parse(input)
  return listRosterContext(parsed.team_id, parsed.start_date, parsed.end_date)
}
