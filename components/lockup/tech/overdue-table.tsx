'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BellRing, Loader2, MessageSquare, PackageCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useStore } from '@/lib/store'
import { forceCheckin, nudgeOverdueHolder } from '@/lib/actions/lockup'
import type { OverdueGearRow } from '@/lib/queries/lockup'
import { cn } from '@/lib/utils'
import { CategoryIcon, CodeChip, fmtDayTime } from '../item-bits'

/**
 * Who is late with what, worst first. The console used to show only a red count
 * of overdue items, which tells you a problem exists but not who to ask.
 */
export function OverdueTable({ rows }: { rows: OverdueGearRow[] }) {
  const router = useRouter()
  const { pushToast } = useStore()
  const [busyId, setBusyId] = useState<string | null>(null)

  async function run(id: string, fn: () => Promise<unknown>, done: string) {
    setBusyId(id)
    try {
      await fn()
      pushToast({ title: done, variant: 'success' })
      router.refresh()
    } catch (err) {
      pushToast({
        title: err instanceof Error ? err.message : 'That did not work',
        variant: 'error',
      })
    } finally {
      setBusyId(null)
    }
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-5 py-12 text-center">
        <PackageCheck className="h-7 w-7 text-emerald-600" />
        <div className="text-[14px] font-medium">Nothing is overdue</div>
        <p className="text-[12.5px] text-muted-foreground">
          Everything checked out is still within its return date.
        </p>
      </div>
    )
  }

  // Group by person: chasing is a per-person conversation, not per-item.
  const byHolder = new Map<string, OverdueGearRow[]>()
  for (const r of rows) byHolder.set(r.holder_id, [...(byHolder.get(r.holder_id) ?? []), r])

  return (
    <div className="space-y-4">
      <p className="text-[12.5px] text-muted-foreground">
        {rows.length} item{rows.length === 1 ? '' : 's'} past the return date, held by{' '}
        {byHolder.size} {byHolder.size === 1 ? 'person' : 'people'}. The daily sweep already DMs
        them; nudge to ask again now.
      </p>

      {Array.from(byHolder.entries()).map(([holderId, items]) => {
        const worst = Math.max(...items.map((i) => i.days_late))
        const holder = items[0]
        return (
          <div key={holderId} className="overflow-hidden rounded-xl border border-border">
            <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/40 px-4 py-2.5">
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                {holder.holder_name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-semibold">{holder.holder_name}</div>
                <div className="text-[11.5px] text-muted-foreground">
                  {items.length} item{items.length === 1 ? '' : 's'} · worst {worst} day
                  {worst === 1 ? '' : 's'} late
                </div>
              </div>
              {holder.holder_slack_id && (
                <a
                  href={`https://slack.com/app_redirect?channel=${holder.holder_slack_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[12px] font-medium hover:bg-accent"
                >
                  <MessageSquare className="h-3.5 w-3.5" /> Slack
                </a>
              )}
            </div>

            <ul className="divide-y divide-border">
              {items
                .slice()
                .sort((a, b) => b.days_late - a.days_late)
                .map((r) => (
                  <li key={r.checkout_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <CategoryIcon category={r.category} photoUrl={r.photo_url} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/lockup/items/${r.code}`}
                          className="truncate text-[14px] font-semibold hover:underline"
                        >
                          {r.name}
                        </Link>
                        <CodeChip code={r.code} />
                      </div>
                      <div className="text-[12px] text-muted-foreground">
                        Due {fmtDayTime(r.due_at ?? '')}
                        {r.shoot_name ? ` · for ${r.shoot_name}` : ''}
                      </div>
                    </div>

                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold',
                        r.days_late >= 7
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-amber-100 text-amber-700'
                      )}
                    >
                      {r.days_late} day{r.days_late === 1 ? '' : 's'} late
                    </span>

                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === r.checkout_id}
                        onClick={() =>
                          run(
                            r.checkout_id,
                            () => nudgeOverdueHolder(r.checkout_id),
                            `${r.holder_name} nudged about ${r.name}`
                          )
                        }
                      >
                        {busyId === r.checkout_id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <BellRing className="h-4 w-4" />
                        )}
                        Nudge
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busyId === r.checkout_id}
                        onClick={() =>
                          run(
                            r.checkout_id,
                            () => forceCheckin(r.item_id),
                            `${r.name} marked back on the shelf`
                          )
                        }
                        title="Use when the item is physically back but was never checked in"
                      >
                        Force in
                      </Button>
                    </div>
                  </li>
                ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
