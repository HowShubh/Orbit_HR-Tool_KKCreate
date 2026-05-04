import {
  TopbarSkeleton,
  TabsSkeleton,
  TableSkeleton,
} from '@/components/layout/page-skeleton'

export default function HRLoading() {
  return (
    <>
      <TopbarSkeleton />
      <div className="px-5 lg:px-8 py-5">
        <TabsSkeleton count={7} />
        <TableSkeleton rows={8} />
      </div>
    </>
  )
}
