import {
  TopbarSkeleton,
  CardSkeleton,
  SkeletonBlock,
} from '@/components/layout/page-skeleton'

export default function TeamLoading() {
  return (
    <>
      <TopbarSkeleton />
      <div className="px-5 lg:px-8 py-5 space-y-5">
        <div className="flex items-center gap-3">
          <SkeletonBlock className="h-9 w-48" />
          <SkeletonBlock className="h-9 w-32" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <CardSkeleton className="h-32" />
          <CardSkeleton className="h-32" />
          <CardSkeleton className="h-32" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-4 flex items-center gap-3">
              <SkeletonBlock className="h-10 w-10 rounded-full" />
              <div className="space-y-2 flex-1">
                <SkeletonBlock className="h-3 w-24" />
                <SkeletonBlock className="h-2 w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
