'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Clock, CircleDashed } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
      'Create the first account — this becomes the Root Admin (Founder role with full access).',
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

function RootAdminForm() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const res = await fetch('/api/setup/root-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: fullName, email, password }),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Something went wrong. Please try again.')
      setLoading(false)
      return
    }

    // Sign in with the newly created credentials
    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setError('Account created but sign-in failed. Try signing in from the login page.')
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3">
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-800">
          {error}
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="setup-name" className="text-[12.5px]">Full name</Label>
        <Input
          id="setup-name"
          placeholder="Lokesh Sharma"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          className="h-8 text-sm"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="setup-email" className="text-[12.5px]">Email</Label>
        <Input
          id="setup-email"
          type="email"
          placeholder="lokesh@kkcreate.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="h-8 text-sm"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="setup-password" className="text-[12.5px]">Password</Label>
        <Input
          id="setup-password"
          type="password"
          placeholder="Min. 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          className="h-8 text-sm"
        />
      </div>
      <Button type="submit" size="sm" disabled={loading} className="w-full">
        {loading ? 'Creating account…' : 'Create Root Admin account'}
      </Button>
    </form>
  )
}

export default function SetupChecklist({
  bootstrapState,
}: {
  bootstrapState: BootstrapState
}) {
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
              <div className="pb-4 min-w-0 flex-1">
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
                  <RootAdminForm />
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
