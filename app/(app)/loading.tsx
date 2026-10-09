import {
  TopbarSkeleton,
  CardSkeleton,
  StatTilesSkeleton,
  SkeletonBlock,
} from '@/components/layout/page-skeleton'

// Default dashboard skeleton — matches the dashboard grid layout
export default function DashboardLoading() {
  return (
    <>
      <TopbarSkeleton />
      <div className="px-5 lg:px-8 py-5 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <SkeletonBlock className="h-4 w-56" />
          <div className="flex gap-2">
            <SkeletonBlock className="h-9 w-32" />
            <SkeletonBlock className="h-9 w-40" />
          </div>
        </div>
        <StatTilesSkeleton count={4} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <CardSkeleton className="h-56" />
          <CardSkeleton className="h-56" />
          <CardSkeleton className="h-56" />
          <CardSkeleton className="lg:col-span-2 h-44" />
          <CardSkeleton className="h-44" />
        </div>
      </div>
    </>
  )
}
