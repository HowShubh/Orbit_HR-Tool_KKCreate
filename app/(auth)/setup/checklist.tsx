'use client'

import { CheckCircle2, Clock, CircleDashed } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

type BootstrapState =
  | 'awaiting_root_admin'
  | 'awaiting_first_hr'
  | 'awaiting_first_team'
  | 'operational'

const STEPS = [
  {
    id: 'awaiting_root_admin',
    label: 'Create Root Admin',
    description:
      'The first person to sign in becomes the Root Admin (Founder role with full access).',
  },
  {
    id: 'awaiting_first_hr',
    label: 'Add first HR user',
    description: 'Add your HR person who will manage leaves, holidays, and onboarding.',
  },
  {
    id: 'awaiting_first_team',
    label: 'Create first team',
    description: 'Create at least one team before inviting the rest of the organisation.',
  },
]

const STATE_ORDER: BootstrapState[] = [
  'awaiting_root_admin',
  'awaiting_first_hr',
  'awaiting_first_team',
  'operational',
]

function stepStatus(
  stepId: string,
  currentState: BootstrapState
): 'done' | 'active' | 'pending' {
  const stepIdx = STATE_ORDER.indexOf(stepId as BootstrapState)
  const currentIdx = STATE_ORDER.indexOf(currentState)
  if (stepIdx < currentIdx) return 'done'
  if (stepIdx === currentIdx) return 'active'
  return 'pending'
}

export default function SetupChecklist({
  bootstrapState,
}: {
  bootstrapState: BootstrapState
}) {
  async function handleGoogleSignIn() {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm space-y-6">
      <div className="space-y-4">
        {STEPS.map((step, i) => {
          const status = stepStatus(step.id, bootstrapState)
          return (
            <div key={step.id} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div
                  className={
                    status === 'done'
                      ? 'text-emerald-500'
                      : status === 'active'
                      ? 'text-violet-500'
                      : 'text-muted-foreground/40'
                  }
                >
                  {status === 'done' ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : status === 'active' ? (
                    <Clock className="h-5 w-5" />
                  ) : (
                    <CircleDashed className="h-5 w-5" />
                  )}
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={`w-px flex-1 mt-1 ${
                      status === 'done' ? 'bg-emerald-200' : 'bg-border'
                    }`}
                  />
                )}
              </div>
              <div className="pb-4 min-w-0">
                <div
                  className={`text-[14px] font-semibold ${
                    status === 'pending' ? 'text-muted-foreground' : ''
                  }`}
                >
                  Step {i + 1}: {step.label}
                </div>
                <div className="text-[12.5px] text-muted-foreground mt-0.5">
                  {step.description}
                </div>
                {status === 'active' && step.id === 'awaiting_root_admin' && (
                  <Button className="mt-3 gap-2" onClick={handleGoogleSignIn}>
                    Sign in with Google to become Root Admin
                  </Button>
                )}
                {status === 'active' && step.id === 'awaiting_first_hr' && (
                  <p className="mt-2 text-[12.5px] text-violet-600 font-medium">
                    You're in! Go to HR Console → Users to add your first HR user.
                  </p>
                )}
                {status === 'active' && step.id === 'awaiting_first_team' && (
                  <p className="mt-2 text-[12.5px] text-violet-600 font-medium">
                    Go to HR Console → Teams to create your first team.
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
