/**
 * Reusable skeleton primitives shown while server components stream.
 * Match the visual shape of common pages so the transition feels seamless.
 */

import { cn } from '@/lib/utils'

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn('rounded-md bg-muted animate-pulse', className)} />
}

export function TopbarSkeleton() {
  return (
    <div className="border-b border-border bg-card px-5 lg:px-8 py-4 flex items-center justify-between gap-4">
      <div className="space-y-2">
        <SkeletonBlock className="h-5 w-44" />
        <SkeletonBlock className="h-3 w-72 max-w-full" />
      </div>
      <SkeletonBlock className="h-9 w-9 rounded-full" />
    </div>
  )
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-xl border bg-card p-5 space-y-3', className)}>
      <SkeletonBlock className="h-4 w-32" />
      <SkeletonBlock className="h-3 w-full" />
      <SkeletonBlock className="h-3 w-5/6" />
      <SkeletonBlock className="h-3 w-3/4" />
    </div>
  )
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="p-4 border-b flex items-center gap-3">
        <SkeletonBlock className="h-9 flex-1 max-w-sm" />
        <SkeletonBlock className="h-9 w-24" />
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-3 flex items-center gap-3">
            <SkeletonBlock className="h-8 w-8 rounded-full" />
            <SkeletonBlock className="h-3.5 flex-1 max-w-[180px]" />
            <SkeletonBlock className="h-3.5 w-24" />
            <SkeletonBlock className="h-3.5 w-32" />
            <SkeletonBlock className="h-3.5 w-20" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function TabsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="flex gap-1 mb-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonBlock key={i} className="h-9 w-24" />
      ))}
    </div>
  )
}

export function StatTilesSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card p-4 space-y-2">
          <SkeletonBlock className="h-3 w-20" />
          <SkeletonBlock className="h-7 w-16" />
          <SkeletonBlock className="h-2 w-full" />
        </div>
      ))}
    </div>
  )
}
