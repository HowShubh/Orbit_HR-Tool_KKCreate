import {
  TopbarSkeleton,
  SkeletonBlock,
} from '@/components/layout/page-skeleton'

export default function OrgLoading() {
  return (
    <>
      <TopbarSkeleton />
      <div className="px-8 py-6 flex flex-col items-center gap-4">
        <SkeletonBlock className="h-24 w-48 rounded-xl" />
        <SkeletonBlock className="h-px w-1" />
        <div className="flex gap-4">
          <SkeletonBlock className="h-24 w-44 rounded-xl" />
          <SkeletonBlock className="h-24 w-44 rounded-xl" />
          <SkeletonBlock className="h-24 w-44 rounded-xl" />
        </div>
        <div className="flex gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-20 w-32 rounded-xl" />
          ))}
        </div>
      </div>
    </>
  )
}
