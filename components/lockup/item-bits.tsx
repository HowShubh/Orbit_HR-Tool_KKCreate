'use client'

import {
  Aperture,
  Battery,
  Box,
  Cable,
  Camera,
  Grip,
  HardDrive,
  Laptop,
  Mic,
  Package,
  Plane,
  Sun,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { EquipmentCategory, EquipmentStatus } from '@/lib/lockup/constants'
import { STATUS_LABELS } from '@/lib/lockup/constants'

export const CATEGORY_ICONS: Record<EquipmentCategory, LucideIcon> = {
  camera: Camera,
  lens: Aperture,
  light: Sun,
  audio: Mic,
  grip: Grip,
  drone: Plane,
  battery: Battery,
  storage: HardDrive,
  computer: Laptop,
  cable_adapter: Cable,
  accessory: Package,
  other: Box,
}

export function CategoryIcon({
  category,
  photoUrl,
  size = 'md',
  className,
}: {
  category: EquipmentCategory
  photoUrl?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const Icon = CATEGORY_ICONS[category] ?? Box
  const box = size === 'lg' ? 'h-20 w-20' : size === 'sm' ? 'h-9 w-9' : 'h-12 w-12'
  const icon = size === 'lg' ? 'h-8 w-8' : size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt=""
        className={cn(box, 'rounded-lg object-cover bg-muted border border-border', className)}
      />
    )
  }
  return (
    <div
      className={cn(
        box,
        'rounded-lg bg-muted border border-border grid place-items-center text-muted-foreground',
        className
      )}
    >
      <Icon className={icon} />
    </div>
  )
}

const STATUS_VARIANT: Record<EquipmentStatus, 'success' | 'info' | 'warning' | 'muted' | 'danger'> =
  {
    available: 'success',
    checked_out: 'info',
    in_repair: 'warning',
    retired: 'muted',
    lost: 'danger',
  }

export function StatusBadge({ status, className }: { status: EquipmentStatus; className?: string }) {
  return (
    <Badge variant={STATUS_VARIANT[status]} className={cn('whitespace-nowrap', className)}>
      {STATUS_LABELS[status]}
    </Badge>
  )
}

export function CodeChip({ code, className }: { code: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] tracking-widest text-muted-foreground',
        className
      )}
    >
      {code}
    </span>
  )
}

/** Small chip marking an assigned device (laptop/phone/SSD) vs pooled gear. */
export function AssignedChip({ className }: { className?: string }) {
  return (
    <Badge variant="info" className={cn('whitespace-nowrap', className)}>
      Assigned
    </Badge>
  )
}

// ---------- date formatting (IST, matches server copy) ----------

export function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  })
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  })
}

function istHM(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  })
}

/** Shoot window with times: "9 Aug, 10:00 am to 6:00 pm" or, across days,
 *  "9 Aug, 10:00 am to 12 Aug, 6:00 pm". Shoots saved before times existed
 *  (midnight to 23:59) render as plain day ranges. */
export function fmtShootWindow(startIso: string, endIso: string): string {
  const sameDay = fmtDay(startIso) === fmtDay(endIso)
  const wholeDay = istHM(startIso) === '00:00' && istHM(endIso) === '23:59'
  if (wholeDay) return sameDay ? fmtDay(startIso) : `${fmtDay(startIso)} to ${fmtDay(endIso)}`
  if (sameDay) return `${fmtDay(startIso)}, ${fmtTime(startIso)} to ${fmtTime(endIso)}`
  return `${fmtDayTime(startIso)} to ${fmtDayTime(endIso)}`
}

export function fmtDayTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  })
}

/** One-line live status, per the reference UX:
 *  "Available in L2" / "With Shubham Rao, due 10 Jul, 7:00 pm" / "In repair, back 11 Jul".
 *  Assigned devices read differently (they live with a person, not a cupboard). */
export function itemStatusLine(item: {
  status: EquipmentStatus
  holder_name?: string | null
  due_at?: string | null
  current_location_label?: string | null
  home_location_label?: string | null
  repair_expected_back_on?: string | null
  kind?: 'pooled' | 'assigned'
  assignee_name?: string | null
}): string {
  // Assigned devices rest with their owner, or are on loan to someone else.
  if (item.kind === 'assigned' && item.status !== 'in_repair') {
    if (item.status === 'checked_out') {
      const who = item.holder_name ?? 'someone'
      return item.assignee_name && item.assignee_name !== who
        ? `With ${who} · borrowed from ${item.assignee_name}`
        : `With ${who}`
    }
    if (item.status === 'available') {
      return item.assignee_name ? `With ${item.assignee_name} · assigned` : 'Unassigned'
    }
  }
  if (item.status === 'available') {
    const where = item.current_location_label ?? item.home_location_label
    return where ? `Available in ${where}` : 'Available'
  }
  if (item.status === 'checked_out') {
    const who = item.holder_name ?? 'someone'
    return item.due_at ? `With ${who}, due ${fmtDayTime(item.due_at)}` : `With ${who}`
  }
  if (item.status === 'in_repair') {
    return item.repair_expected_back_on
      ? `In repair, back ${fmtDay(item.repair_expected_back_on)}`
      : 'In repair'
  }
  return STATUS_LABELS[item.status]
}

/** Default return time: tomorrow 7:00 pm, as a datetime-local input value. */
export function defaultDueLocal(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(19, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
