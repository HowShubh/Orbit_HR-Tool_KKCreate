'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  // The reset email link creates a (recovery) session via /auth/callback.
  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setHasSession(Boolean(data.user)))
      .finally(() => setChecking(false))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    const { error: updateError } = await createClient().auth.updateUser({ password })
    setLoading(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setDone(true)
    setTimeout(() => {
      router.push('/')
      router.refresh()
    }, 1200)
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-3">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center shadow-xl">
            <Sparkles className="h-7 w-7 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">Orbit HR</h1>
            <p className="text-sm text-muted-foreground mt-1">Set a new password</p>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-sm space-y-4">
          {checking ? (
            <p className="text-center text-sm text-muted-foreground">Loading…</p>
          ) : !hasSession ? (
            <div className="space-y-3 text-center">
              <p className="text-sm text-muted-foreground">
                This reset link is invalid or has expired. Request a new one from the sign-in page.
              </p>
              <Button variant="outline" className="w-full" onClick={() => router.push('/login')}>
                Back to sign in
              </Button>
            </div>
          ) : done ? (
            <p className="text-center text-sm text-emerald-700">
              Password updated. Taking you to your dashboard…
            </p>
          ) : (
            <>
              {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                  {error}
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="new-password">New password</Label>
                  <Input id="new-password" type="password" placeholder="••••••••" value={password}
                    onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password">Confirm password</Label>
                  <Input id="confirm-password" type="password" placeholder="••••••••" value={confirm}
                    onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Updating…' : 'Update password'}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
