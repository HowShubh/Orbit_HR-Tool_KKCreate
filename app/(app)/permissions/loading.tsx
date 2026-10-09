import {
  TopbarSkeleton,
  TabsSkeleton,
  TableSkeleton,
} from '@/components/layout/page-skeleton'

export default function PermissionsLoading() {
  return (
    <>
      <TopbarSkeleton />
      <div className="px-5 lg:px-8 py-5">
        <TabsSkeleton count={2} />
        <TableSkeleton rows={6} />
      </div>
    </>
  )
}
