'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Boxes,
  Calendar,
  Check,
  Clock,
  Flag,
  MapPin,
  MessageSquare,
  Plus,
  Wrench,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Tables } from '@/lib/supabase/database.types'
import type { ItemProfile } from '@/lib/queries/lockup'
import { CATEGORY_LABELS } from '@/lib/lockup/constants'
import { useRouter } from 'next/navigation'
import { useCart } from '@/lib/lockup/cart'
import { cn } from '@/lib/utils'
import { CategoryIcon, CodeChip, fmtDay, fmtDayTime } from './item-bits'
import { ReportIssueDialog } from './report-issue-dialog'

/**
 * The item page. Answers, top to bottom and in this order:
 *   is it free → where is it → who has it → when do I get it → who do I ask.
 * Then the details, a month grid of free/busy days, and a timeline that runs
 * both backwards (what happened) and forwards (what is coming).
 */
export function ItemPage({
  profile,
  locations,
  currentUserId,
  canManageEquipment,
}: {
  profile: ItemProfile
  locations: Tables<'equipment_locations'>[]
  currentUserId: string
  canManageEquipment: boolean
}) {
  const { item, holder, holder_shoot: holderShoot, kits, history, upcoming, days } = profile
  const router = useRouter()
  const cart = useCart()
  const [issueOpen, setIssueOpen] = useState(false)

  const inCart = cart.has(item.id)
  const isFree = item.status === 'available'
  const isMine = holder?.id === currentUserId
  const dayState = useMemo(() => {
    const map = new Map<string, 'busy' | 'repair'>()
    for (const d of days) {
      // Repair wins: it is the harder block of the two.
      if (d.state === 'repair' || !map.has(d.day)) map.set(d.day, d.state)
    }
    return map
  }, [days])

  return (
    <div className="pb-10">
      {/* Breadcrumb header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card px-5 py-3.5 lg:px-8">
        <Link
          href="/lockup"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Back to gear"
        >
          <ArrowLeft className="h-[18px] w-[18px]" />
        </Link>
        <span className="hidden text-[13px] text-muted-foreground sm:inline">Gear</span>
        <span className="hidden text-muted-foreground/50 sm:inline">/</span>
        <span className="truncate text-[16px] font-bold lg:text-[17px]">{item.name}</span>
        <CodeChip code={item.code} />
        {item.requires_approval && (
          <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-700">
            approval
          </span>
        )}
      </div>

      <div className="grid gap-4 px-5 py-5 lg:grid-cols-[1fr_320px] lg:gap-5 lg:px-8">
        <div className="order-2 space-y-4 lg:order-1">
          {/* ---- The live answer ---- */}
          <StatusPanel
            item={item}
            holder={holder}
            holderShoot={holderShoot}
            isFree={isFree}
            isMine={isMine}
          />

          {/* ---- Month grid + timeline ---- */}
          <div className="grid gap-4 sm:grid-cols-2">
            <MonthGrid dayState={dayState} />
            <Timeline upcoming={upcoming} history={history} />
          </div>
        </div>

        {/* ---- Photo, actions, details ---- */}
        <div className="order-1 space-y-4 lg:order-2">
          <div className="grid h-44 place-items-center overflow-hidden rounded-2xl border border-border bg-card">
            {item.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.photo_url} alt={item.name} className="h-full w-full object-cover" />
            ) : (
              <CategoryIcon category={item.category} photoUrl={null} size="lg" />
            )}
          </div>

          <div className="space-y-2">
            {isFree ? (
              <Button
                className="w-full"
                variant={inCart ? 'soft' : 'default'}
                onClick={() => cart.toggle(item.id)}
              >
                {inCart ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {inCart ? 'In your cart' : 'Add to cart'}
              </Button>
            ) : (
              <>
                <Button
                  className="w-full"
                  variant="secondary"
                  onClick={() => {
                    // Put it in the cart and open the reserve panel, rather
                    // than dropping the person on a list of shoots to work out
                    // for themselves. Holding unavailable gear is the point
                    // here: the cart reserves, it never takes.
                    cart.add(item.id)
                    router.push('/lockup?cart=1')
                  }}
                >
                  <Calendar className="h-4 w-4" /> Book it for later
                </Button>
                <p className="text-center text-[12px] text-muted-foreground">
                  {item.status === 'in_repair'
                    ? 'It is in repair, so you cannot take it now.'
                    : isMine
                      ? 'You are holding this one.'
                      : `Out until ${item.due_at ? fmtDayTime(item.due_at) : 'further notice'}, so you cannot take it now.`}
                </p>
              </>
            )}
            <Button variant="outline" className="w-full" onClick={() => setIssueOpen(true)}>
              <Flag className="h-4 w-4" /> Report a problem
            </Button>
          </div>

          <div className="space-y-2.5 rounded-2xl border border-border bg-card p-4">
            <div className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">
              Details
            </div>
            <DetailRow label="Category" value={CATEGORY_LABELS[item.category]} />
            {item.brand_model && <DetailRow label="Brand / model" value={item.brand_model} />}
            {item.serial_number && <DetailRow label="Serial" value={item.serial_number} />}
            <DetailRow label="Home shelf" value={item.home_location_label ?? 'not set'} />
            {kits.length > 0 && (
              <DetailRow label={kits.length > 1 ? 'In kits' : 'In a kit'} value={kits.map((k) => k.name).join(', ')} accent />
            )}
            {item.notes && (
              <p className="border-t border-border pt-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
                {item.notes}
              </p>
            )}
          </div>
        </div>
      </div>

      <ReportIssueDialog
        open={issueOpen}
        onOpenChange={setIssueOpen}
        item={{ id: item.id, name: item.name }}
      />
    </div>
  )
}

function DetailRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={cn('text-right font-semibold', accent && 'text-primary')}>{value}</span>
    </div>
  )
}

function StatusPanel({
  item,
  holder,
  holderShoot,
  isFree,
  isMine,
}: {
  item: ItemProfile['item']
  holder: ItemProfile['holder']
  holderShoot: ItemProfile['holder_shoot']
  isFree: boolean
  isMine: boolean
}) {
  if (isFree) {
    const next = item.active_reservations[0]
    return (
      <div className="space-y-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-[16px] font-bold text-emerald-900">Free right now</span>
        </div>
        <div className="flex items-center gap-2 text-[13px] text-emerald-700">
          <MapPin className="h-4 w-4 shrink-0" />
          {item.current_location_label ?? item.home_location_label ?? 'location not set'}
        </div>
        {next && (
          <div className="flex items-center gap-2 text-[13px] text-emerald-700">
            <Calendar className="h-4 w-4 shrink-0" />
            Next reserved {fmtDay(next.shoot_starts_at)} for {next.shoot_name}
          </div>
        )}
      </div>
    )
  }

  if (item.status === 'in_repair') {
    return (
      <div className="space-y-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          <span className="text-[16px] font-bold text-amber-900">
            In repair{item.repair_vendor ? ` at ${item.repair_vendor}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[13px] text-amber-700">
          <Wrench className="h-4 w-4 shrink-0" />
          {item.repair_expected_back_on
            ? `Expected back ${fmtDay(item.repair_expected_back_on)}`
            : 'No return date yet'}
        </div>
      </div>
    )
  }

  // Someone has it. This block is the whole answer: who, until when, where.
  const slackHref = holder?.slack_user_id
    ? `https://slack.com/app_redirect?channel=${holder.slack_user_id}`
    : holder?.email
      ? `mailto:${holder.email}`
      : null

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2.5">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            <span className="text-[16px] font-bold text-blue-900">
              {isMine ? 'You have it' : `With ${holder?.full_name ?? 'someone'}`}
              {item.checked_out_at ? ` since ${fmtDayTime(item.checked_out_at)}` : ''}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[13px] text-blue-700">
            <Clock className="h-4 w-4 shrink-0" />
            {item.due_at ? `Free again ${fmtDayTime(item.due_at)}` : 'No return date set'}
          </div>
          {(holderShoot || item.checkout_shoot_name) && (
            <div className="flex items-center gap-2 text-[13px] text-blue-700">
              <MapPin className="h-4 w-4 shrink-0" />
              {holderShoot?.location
                ? `On location: ${holderShoot.location}, ${holderShoot.name}`
                : `On ${holderShoot?.name ?? item.checkout_shoot_name}`}
            </div>
          )}
        </div>

        {!isMine && holder && (
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 rounded-xl border border-blue-200 bg-card px-3.5 py-2">
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                {holder.full_name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-bold">{holder.full_name}</div>
                <div className="text-[11px] text-muted-foreground">has it now</div>
              </div>
            </div>
            {slackHref && (
              <a
                href={slackHref}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-blue-800"
              >
                <MessageSquare className="h-4 w-4" />
                {holder.slack_user_id ? 'Ask on Slack' : 'Email them'}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** Four weeks from this Monday, shaded free / busy / repair. */
function MonthGrid({ dayState }: { dayState: Map<string, 'busy' | 'repair'> }) {
  const weeks = useMemo(() => {
    const today = new Date()
    const monday = new Date(today)
    // getDay(): 0 = Sunday. Shift so weeks start on Monday.
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
    monday.setHours(0, 0, 0, 0)
    const out: { key: string; date: number; isPast: boolean; isToday: boolean }[][] = []
    const todayKey = today.toLocaleDateString('en-CA')
    for (let w = 0; w < 4; w++) {
      const row = []
      for (let d = 0; d < 7; d++) {
        const day = new Date(monday)
        day.setDate(monday.getDate() + w * 7 + d)
        const key = day.toLocaleDateString('en-CA')
        row.push({ key, date: day.getDate(), isPast: key < todayKey, isToday: key === todayKey })
      }
      out.push(row)
    }
    return out
  }, [])

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">
        Next 4 weeks
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="space-y-1">
        {weeks.map((row, i) => (
          <div key={i} className="grid grid-cols-7 gap-1">
            {row.map((day) => {
              const state = dayState.get(day.key)
              return (
                <div
                  key={day.key}
                  className={cn(
                    'grid aspect-square place-items-center rounded-md text-[11px] font-medium',
                    day.isPast && 'opacity-40',
                    state === 'repair'
                      ? 'bg-amber-100 text-amber-800'
                      : state === 'busy'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-emerald-50 text-emerald-700',
                    day.isToday && 'ring-2 ring-primary ring-offset-1'
                  )}
                >
                  {day.date}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 border-t border-border pt-2.5 text-[10.5px] text-muted-foreground">
        <Legend className="bg-emerald-50 ring-1 ring-emerald-200" label="Free" />
        <Legend className="bg-blue-100" label="Booked" />
        <Legend className="bg-amber-100" label="Repair" />
      </div>
    </div>
  )
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('h-2.5 w-2.5 rounded-sm', className)} />
      {label}
    </span>
  )
}

const UPCOMING_ICON = {
  reservation: Calendar,
  repair_due: Wrench,
  due_back: Clock,
} as const

function Timeline({
  upcoming,
  history,
}: {
  upcoming: ItemProfile['upcoming']
  history: ItemProfile['history']
}) {
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? history : history.slice(0, 4)

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between">
        <div className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">
          Timeline
        </div>
        <span className="text-[11px] text-muted-foreground/70">last 90 days</span>
      </div>

      <ol className="space-y-0">
        {upcoming.map((e, i) => {
          const Icon = UPCOMING_ICON[e.kind]
          return (
            <li key={`u-${i}`} className="flex gap-2.5">
              <div className="flex flex-col items-center">
                <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-primary/15">
                  <Icon className="h-2.5 w-2.5 text-primary" />
                </span>
                <span className="w-px flex-1 bg-border" />
              </div>
              <div className="pb-3">
                <div className="text-[12.5px] font-semibold">{e.text}</div>
                <div className="text-[11.5px] text-muted-foreground">
                  {e.ends_at ? `${fmtDayTime(e.at)} to ${fmtDayTime(e.ends_at)}` : fmtDayTime(e.at)}
                  {e.sub ? ` · ${e.sub}` : ''}
                </div>
              </div>
            </li>
          )
        })}

        {shown.map((e, i) => (
          <li key={`h-${i}`} className="flex gap-2.5">
            <div className="flex flex-col items-center">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40" />
              {i < shown.length - 1 && <span className="w-px flex-1 bg-border" />}
            </div>
            <div className="pb-3">
              <div className="text-[12.5px] font-medium">{e.text}</div>
              <div className="text-[11.5px] text-muted-foreground">{fmtDayTime(e.at)}</div>
            </div>
          </li>
        ))}
        {history.length === 0 && upcoming.length === 0 && (
          <li className="text-[12.5px] text-muted-foreground">Nothing has happened to this yet.</li>
        )}
      </ol>

      {history.length > 4 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="w-full border-t border-border pt-2.5 text-center text-[12px] font-semibold text-primary"
        >
          {showAll ? 'Show less' : `Show ${history.length - 4} more from the last 90 days`}
        </button>
      )}
    </div>
  )
}
