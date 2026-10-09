'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Box, Sparkles } from 'lucide-react'
import type { SiteFlavor } from '@/lib/lockup/site'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const ERROR_MESSAGES: Record<string, string> = {
  not_onboarded:
    "Your account hasn't been set up yet. Please contact HR to get access.",
  account_exited: 'Your account has been deactivated. Contact HR for assistance.',
  invalid_credentials: 'Incorrect email or password.',
  no_code: 'That link is invalid or has expired. Please request a new one.',
  exchange_failed: 'That link is invalid or has expired. Please request a new one.',
  user_create_failed: 'Something went wrong setting up your account. Contact HR.',
}

type Mode = 'password' | 'magic' | 'forgot'

export function LoginClient({ site, next }: { site: SiteFlavor; next: string | null }) {
  return (
    <Suspense fallback={<LoginShell site={site} />}>
      <LoginForm site={site} next={next} />
    </Suspense>
  )
}

function LoginShell({ site, children }: { site: SiteFlavor; children?: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-3">
          {site === 'lockup' ? (
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 grid place-items-center shadow-xl">
              <Box className="h-7 w-7 text-white" />
            </div>
          ) : (
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center shadow-xl">
              <Sparkles className="h-7 w-7 text-white" />
            </div>
          )}
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">
              {site === 'lockup' ? 'Lockup' : 'Orbit HR'}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {site === 'lockup' ? 'KK Create · Gear tracker' : 'KK Create · People & Culture'}
            </p>
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

function LoginForm({ site, next }: { site: SiteFlavor; next: string | null }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const errorKey = searchParams.get('error')
  const destination = next ?? (site === 'lockup' ? '/lockup' : '/')

  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(
    errorKey ? (ERROR_MESSAGES[errorKey] ?? null) : null
  )
  const [sent, setSent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setSent(null)
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: signInError } = await createClient().auth.signInWithPassword({ email, password })
    if (signInError) {
      setError(
        signInError.message.toLowerCase().includes('invalid')
          ? ERROR_MESSAGES.invalid_credentials
          : signInError.message
      )
      setLoading(false)
      return
    }
    router.push(destination)
    router.refresh()
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: otpError } = await createClient().auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false, // access is managed by HR — don't create new accounts
        emailRedirectTo: `${window.location.origin}/auth/callback${
          next ? `?next=${encodeURIComponent(next)}` : ''
        }`,
      },
    })
    setLoading(false)
    if (otpError) {
      setError(otpError.message)
      return
    }
    setSent(`We've emailed a sign-in link to ${email}. Click it to log in.`)
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: resetError } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })
    setLoading(false)
    if (resetError) {
      setError(resetError.message)
      return
    }
    setSent(`If an account exists for ${email}, we've sent a password reset link.`)
  }

  const heading =
    mode === 'magic' ? 'Sign in with a magic link' : mode === 'forgot' ? 'Reset your password' : 'Sign in to continue'

  return (
    <LoginShell site={site}>
      <div className="rounded-2xl border bg-card p-6 shadow-sm space-y-4">
        <div className="text-center space-y-1">
          <h2 className="text-[15px] font-semibold">{heading}</h2>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        )}
        {sent && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {sent}
          </div>
        )}

        {mode === 'password' && (
          <>
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@kkcreate.com" value={email}
                  onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <button type="button" onClick={() => switchMode('forgot')}
                    className="text-[12px] text-muted-foreground hover:text-foreground">
                    Forgot password?
                  </button>
                </div>
                <Input id="password" type="password" placeholder="••••••••" value={password}
                  onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
            <div className="text-center">
              <button type="button" onClick={() => switchMode('magic')}
                className="text-[13px] text-primary hover:underline">
                Email me a magic link instead
              </button>
            </div>
          </>
        )}

        {mode === 'magic' && (
          <>
            <form onSubmit={handleMagicLink} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="magic-email">Email</Label>
                <Input id="magic-email" type="email" placeholder="you@kkcreate.com" value={email}
                  onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Sending…' : 'Send magic link'}
              </Button>
            </form>
            <div className="text-center">
              <button type="button" onClick={() => switchMode('password')}
                className="text-[13px] text-muted-foreground hover:text-foreground">
                Back to password sign-in
              </button>
            </div>
          </>
        )}

        {mode === 'forgot' && (
          <>
            <form onSubmit={handleForgot} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="forgot-email">Email</Label>
                <Input id="forgot-email" type="email" placeholder="you@kkcreate.com" value={email}
                  onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Sending…' : 'Send reset link'}
              </Button>
            </form>
            <div className="text-center">
              <button type="button" onClick={() => switchMode('password')}
                className="text-[13px] text-muted-foreground hover:text-foreground">
                Back to sign in
              </button>
            </div>
          </>
        )}
      </div>
    </LoginShell>
  )
}
