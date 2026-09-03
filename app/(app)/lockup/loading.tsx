export default function Loading() {
  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <div className="h-9 w-72 animate-pulse rounded-xl bg-muted" />
      <div className="h-11 animate-pulse rounded-xl bg-muted" />
      <div className="flex gap-2">
        {[64, 84, 72, 68].map((w, i) => (
          <div key={i} className="h-8 animate-pulse rounded-full bg-muted" style={{ width: w }} />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[66px] animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  )
}
