export default function Loading() {
  return (
    <div className="px-5 lg:px-8 py-6 space-y-4">
      <div className="h-6 w-52 animate-pulse rounded-lg bg-muted" />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="h-28 animate-pulse rounded-2xl bg-muted" />
          <div className="h-72 animate-pulse rounded-2xl bg-muted" />
        </div>
        <div className="space-y-4">
          <div className="h-44 animate-pulse rounded-2xl bg-muted" />
          <div className="h-56 animate-pulse rounded-2xl bg-muted" />
        </div>
      </div>
    </div>
  )
}
