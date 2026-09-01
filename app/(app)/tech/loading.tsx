/**
 * Skeleton for the Tech Console. The page waits on a lot of data (inventory,
 * holds, shoots, approvals, overdue, activity), so without this the whole
 * route sat blank until every query returned. Mirrors the real layout: stat
 * row, tab strip, then content.
 */
export default function Loading() {
  return (
    <div className="space-y-5 px-5 py-5 lg:px-8">
      <div className="h-9 w-64 animate-pulse rounded-xl bg-muted" />

      {/* Stat cards: 2 rows of 4, matching the compact one-line cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-[52px] animate-pulse rounded-xl bg-muted" />
        ))}
      </div>

      {/* Tab strip */}
      <div className="flex flex-wrap gap-2">
        {[86, 78, 72, 66, 62, 84, 74, 68, 62, 66, 70, 56].map((w, i) => (
          <div key={i} className="h-8 animate-pulse rounded-lg bg-muted" style={{ width: w }} />
        ))}
      </div>

      {/* Content */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="h-64 animate-pulse rounded-2xl bg-muted lg:col-span-3" />
        <div className="h-64 animate-pulse rounded-2xl bg-muted lg:col-span-2" />
      </div>
    </div>
  )
}
