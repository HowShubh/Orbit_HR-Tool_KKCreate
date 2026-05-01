'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

const ERROR_MESSAGES: Record<string, string> = {
  not_onboarded:
    "Your account hasn't been set up yet. Please contact HR to get access.",
  account_exited: 'Your account has been deactivated. Contact HR for assistance.',
  wrong_domain: 'Please sign in with your company Google account.',
  exchange_failed: 'Sign-in failed. Please try again.',
  no_code: 'Sign-in was cancelled. Please try again.',
}

export default function LoginPage() {
  const searchParams = useSearchParams()
  const errorKey = searchParams.get('error')
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] : null

  const [loading, setLoading] = useState(false)

  async function handleGoogleSignIn() {
    setLoading(true)
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })
    // Page will redirect to Google — no need to setLoading(false)
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center shadow-xl">
            <Sparkles className="h-7 w-7 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">Orbit HR</h1>
            <p className="text-sm text-muted-foreground mt-1">KK Create · People & Culture</p>
          </div>
        </div>

        {/* Error message */}
        {errorMessage && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {errorMessage}
          </div>
        )}

        {/* Sign-in card */}
        <div className="rounded-2xl border bg-card p-6 shadow-sm space-y-4">
          <div className="text-center space-y-1">
            <h2 className="text-[15px] font-semibold">Sign in to continue</h2>
            <p className="text-[13px] text-muted-foreground">
              Use your KK Create Google account
            </p>
          </div>

          <Button
            className="w-full gap-3"
            onClick={handleGoogleSignIn}
            disabled={loading}
          >
            {/* Google icon SVG */}
            <svg viewBox="0 0 24 24" className="h-4 w-4">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            {loading ? 'Redirecting…' : 'Continue with Google'}
          </Button>
        </div>

        <p className="text-center text-[12px] text-muted-foreground">
          Access is managed by HR. Contact your HR team if you need an account.
        </p>
      </div>
    </div>
  )
}
