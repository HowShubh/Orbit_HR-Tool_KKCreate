import {
  TopbarSkeleton,
  CardSkeleton,
  SkeletonBlock,
} from '@/components/layout/page-skeleton'

export default function ProfileLoading() {
  return (
    <>
      <TopbarSkeleton />
      <div className="px-5 lg:px-8 py-5 max-w-3xl space-y-4">
        <div className="rounded-xl border bg-card p-5 flex items-center gap-4">
          <SkeletonBlock className="h-16 w-16 rounded-full" />
          <div className="space-y-2 flex-1">
            <SkeletonBlock className="h-5 w-48" />
            <SkeletonBlock className="h-3 w-32" />
          </div>
        </div>
        <CardSkeleton className="h-40" />
        <CardSkeleton className="h-40" />
      </div>
    </>
  )
}
