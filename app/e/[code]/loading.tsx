import { Box } from 'lucide-react'

/** Instant skeleton while the item page loads after a QR scan. */
export default function QrLandingLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-lg px-4 py-5 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-slate-900 grid place-items-center">
              <Box className="h-4 w-4 text-white" />
            </div>
            <span className="text-[15px] font-semibold tracking-tight">Lockup</span>
          </div>
        </div>
        <div className="flex items-start gap-4 animate-pulse">
          <div className="h-20 w-20 rounded-lg bg-muted" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-5 w-2/3 rounded bg-muted" />
            <div className="h-4 w-1/3 rounded bg-muted" />
            <div className="h-5 w-20 rounded-full bg-muted" />
          </div>
        </div>
        <div className="h-24 rounded-xl bg-muted animate-pulse" />
        <div className="h-12 rounded-lg bg-muted animate-pulse" />
      </div>
    </div>
  )
}
