import {
  TopbarSkeleton,
  StatTilesSkeleton,
  TabsSkeleton,
  TableSkeleton,
} from '@/components/layout/page-skeleton'

export default function LeavesLoading() {
  return (
    <>
      <TopbarSkeleton />
      <div className="px-5 lg:px-8 py-5 space-y-5">
        <StatTilesSkeleton count={4} />
        <TabsSkeleton count={2} />
        <TableSkeleton rows={6} />
      </div>
    </>
  )
}
