'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const ERROR_MESSAGES: Record<string, string> = {
  not_onboarded:
    "Your account hasn't been set up yet. Please contact HR to get access.",
  account_exited: 'Your account has been deactivated. Contact HR for assistance.',
  invalid_credentials: 'Incorrect email or password.',
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginShell />}>
      <LoginForm />
    </Suspense>
  )
}

function LoginShell({ children }: { children?: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-3">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center shadow-xl">
            <Sparkles className="h-7 w-7 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">Orbit HR</h1>
            <p className="text-sm text-muted-foreground mt-1">KK Create · People & Culture</p>
          </div>
        </div>

        {children ?? (
          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <div className="h-5 w-32 rounded bg-muted mx-auto" />
            <div className="mt-6 space-y-4">
              <div className="h-10 rounded-lg bg-muted" />
              <div className="h-10 rounded-lg bg-muted" />
              <div className="h-10 rounded-lg bg-muted" />
            </div>
          </div>
        )}

        <p className="text-center text-[12px] text-muted-foreground">
          Access is managed by HR. Contact your HR team if you need an account.
        </p>
      </div>
    </div>
  )
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const errorKey = searchParams.get('error')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(
    errorKey ? (ERROR_MESSAGES[errorKey] ?? null) : null
  )
  const [loading, setLoading] = useState(false)

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setError(
        signInError.message.toLowerCase().includes('invalid')
          ? ERROR_MESSAGES.invalid_credentials
          : signInError.message
      )
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <LoginShell>
        {/* Sign-in card */}
        <div className="rounded-2xl border bg-card p-6 shadow-sm space-y-4">
          <div className="text-center space-y-1">
            <h2 className="text-[15px] font-semibold">Sign in to continue</h2>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {error}
            </div>
          )}

          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@kkcreate.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </div>
    </LoginShell>
  )
}
