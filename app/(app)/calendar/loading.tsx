import {
  TopbarSkeleton,
  SkeletonBlock,
} from '@/components/layout/page-skeleton'

export default function CalendarLoading() {
  return (
    <>
      <TopbarSkeleton />
      <div className="px-5 lg:px-8 py-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-2">
            <SkeletonBlock className="h-9 w-9" />
            <SkeletonBlock className="h-9 w-32" />
            <SkeletonBlock className="h-9 w-9" />
          </div>
          <SkeletonBlock className="h-9 w-44" />
        </div>
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="grid grid-cols-7 border-b">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="p-2 border-r last:border-r-0">
                <SkeletonBlock className="h-3 w-12" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: 35 }).map((_, i) => (
              <div
                key={i}
                className="min-h-[100px] p-2 border-r border-b last:border-r-0 space-y-1.5"
              >
                <SkeletonBlock className="h-3 w-5 ml-auto" />
                <SkeletonBlock className="h-4 w-full" />
                <SkeletonBlock className="h-4 w-3/4" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
