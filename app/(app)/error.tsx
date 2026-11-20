'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Surface to the console for local debugging; wire to a logger later.
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-[18px] font-semibold tracking-tight">
          Something went wrong
        </h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          {error.message || 'An unexpected error occurred while loading this page.'}
        </p>
        {error.digest && (
          <p className="mt-1 text-[11px] text-muted-foreground/70">
            Reference: {error.digest}
          </p>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" asChild>
            <a href="/">Go to dashboard</a>
          </Button>
        </div>
      </div>
    </div>
  )
}
