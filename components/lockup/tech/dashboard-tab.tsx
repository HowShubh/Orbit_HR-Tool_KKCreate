'use client'

import { useState } from 'react'
import { ArrowRight, ChevronRight, Pencil, Sparkles, Upload } from 'lucide-react'
import type { TechConsoleData } from '@/lib/queries/lockup'
import { cn } from '@/lib/utils'
import { fmtDayTime } from '../item-bits'
import { ItemDialog } from './item-dialog'
import { ImportDialog } from './import-dialog'
import { SnapExtractDialog } from './snap-extract-dialog'

type AddMethod = 'snap' | 'csv' | 'manual' | null

/**
 * The Tech Console's landing: the fastest ways to add gear up top, with recent
 * activity beside them, so a tech lead lands on "what can I do / what just
 * happened" rather than a raw table.
 */
export function DashboardTab({
  data,
  people,
  onNavigate,
}: {
  data: TechConsoleData
  people: { id: string; full_name: string }[]
  onNavigate: (tab: string) => void
}) {
  const [method, setMethod] = useState<AddMethod>(null)
  const recent = data.activity.slice(0, 6)

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      {/* Add equipment */}
      <section className="space-y-3 rounded-2xl border border-border bg-card p-5 lg:col-span-3">
        <div>
          <h2 className="text-[15px] font-semibold">Add equipment</h2>
          <p className="text-[12.5px] text-muted-foreground">
            Snap a few photos and let AI draft the list, bulk-import a sheet, or add one by hand.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <MethodCard
            highlight
            icon={Sparkles}
            title="Snap & extract"
            sub="Photograph the gear, AI drafts the list, you confirm."
            onClick={() => setMethod('snap')}
          />
          <MethodCard
            icon={Upload}
            title="Import a sheet"
            sub="Bulk-add from a CSV with a preview first."
            onClick={() => setMethod('csv')}
          />
          <MethodCard
            icon={Pencil}
            title="Add manually"
            sub="Fill one item's details in a form."
            onClick={() => setMethod('manual')}
          />
        </div>

        <p className="text-[11.5px] text-muted-foreground">
          Everything created here gets a QR code you print from the inventory.
        </p>
      </section>

      {/* Recent activity */}
      <section className="space-y-3 rounded-2xl border border-border bg-card p-5 lg:col-span-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Recent activity</h2>
          <button
            type="button"
            onClick={() => onNavigate('activity')}
            className="flex items-center gap-0.5 text-[12.5px] font-medium text-primary hover:underline"
          >
            View all <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {recent.length === 0 ? (
          <p className="py-6 text-center text-[12.5px] text-muted-foreground">
            Nothing yet. Checkouts, returns and reservations show up here.
          </p>
        ) : (
          <ul className="space-y-3">
            {recent.map((e, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary/60" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">{e.item_name}</div>
                  <div className="truncate text-[12px] text-muted-foreground">
                    {e.actor_name} {e.detail}
                  </div>
                </div>
                <span className="shrink-0 text-[11.5px] text-muted-foreground">
                  {fmtDayTime(e.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Dialogs */}
      <SnapExtractDialog
        open={method === 'snap'}
        onOpenChange={(o) => !o && setMethod(null)}
        locations={data.locations}
      />
      <ImportDialog open={method === 'csv'} onOpenChange={(o) => !o && setMethod(null)} />
      {method === 'manual' && (
        <ItemDialog
          open
          onOpenChange={(o) => !o && setMethod(null)}
          item={null}
          privateData={null}
          locations={data.locations}
          people={people}
          kind="pooled"
        />
      )}
    </div>
  )
}

function MethodCard({
  icon: Icon,
  title,
  sub,
  highlight,
  onClick,
}: {
  icon: typeof Sparkles
  title: string
  sub: string
  highlight?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex flex-col gap-2 rounded-xl border p-4 text-left transition-colors',
        highlight
          ? 'border-primary/40 bg-primary/5 hover:bg-primary/10'
          : 'border-border hover:bg-accent'
      )}
    >
      <span
        className={cn(
          'grid h-9 w-9 place-items-center rounded-lg',
          highlight ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-[13.5px] font-semibold">{title}</span>
      <span className="text-[11.5px] leading-snug text-muted-foreground">{sub}</span>
      <ArrowRight className="mt-0.5 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  )
}
