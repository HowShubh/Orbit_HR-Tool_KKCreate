import {
  TopbarSkeleton,
  SkeletonBlock,
} from '@/components/layout/page-skeleton'

export default function AuditLoading() {
  return (
    <>
      <TopbarSkeleton />
      <div className="px-5 lg:px-8 py-5 space-y-4">
        <SkeletonBlock className="h-9 w-full max-w-md" />
        <div className="rounded-xl border bg-card divide-y">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="px-4 py-3 flex items-start gap-3">
              <SkeletonBlock className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="flex gap-2 items-center">
                  <SkeletonBlock className="h-3.5 w-32" />
                  <SkeletonBlock className="h-5 w-24 rounded-md" />
                  <SkeletonBlock className="h-3 w-20" />
                </div>
                <SkeletonBlock className="h-2.5 w-3/4" />
              </div>
              <SkeletonBlock className="h-4 w-4 mt-1" />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
