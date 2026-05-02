import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Sparkles } from 'lucide-react'
import SetupChecklist from './checklist'

export default async function SetupPage() {
  const adminClient = createAdminClient()
  const { data: stateRow } = await adminClient
    .from('system_state')
    .select('bootstrap_state')
    .single()

  const state = stateRow?.bootstrap_state ?? 'awaiting_root_admin'

  // Already operational — nothing to do here
  if (state === 'operational') {
    redirect('/')
  }

  // Detect: signed-in user without a public.users row (e.g. created via Supabase dashboard)
  const supabase = createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  let orphanedAuthUser: { id: string; email: string } | null = null
  if (authUser) {
    const { data: existingUser } = await adminClient
      .from('users')
      .select('id')
      .eq('id', authUser.id)
      .single()

    if (!existingUser && authUser.email) {
      orphanedAuthUser = { id: authUser.id, email: authUser.email }
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-8">
        <div className="flex flex-col items-center gap-3">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center shadow-xl">
            <Sparkles className="h-7 w-7 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">Set up Orbit HR</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Let's get KK Create HR up and running
            </p>
          </div>
        </div>

        <SetupChecklist
          bootstrapState={state}
          orphanedAuthUser={orphanedAuthUser}
        />
      </div>
    </div>
  )
}
