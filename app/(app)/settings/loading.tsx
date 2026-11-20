import {
  TopbarSkeleton,
  CardSkeleton,
} from '@/components/layout/page-skeleton'

export default function SettingsLoading() {
  return (
    <>
      <TopbarSkeleton />
      <div className="px-5 lg:px-8 py-5 max-w-2xl space-y-4">
        <CardSkeleton className="h-44" />
        <CardSkeleton className="h-32" />
        <CardSkeleton className="h-32" />
        <CardSkeleton className="h-24" />
      </div>
    </>
  )
}
