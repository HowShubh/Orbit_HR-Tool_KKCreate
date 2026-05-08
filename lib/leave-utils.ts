import { addDays, eachDayOfInterval, formatISO, isSameDay, parseISO } from "date-fns";
import { Leave } from "./types";
import { holidays } from "./mock-data";

const holidayDates = new Set(holidays.map((h) => h.date));

export function isWeekend(d: Date) {
  const day = d.getDay();
  return day === 0 || day === 6;
}

export function isHoliday(d: Date) {
  return holidayDates.has(formatISO(d, { representation: "date" }));
}

export function computeDaysDeducted(opts: {
  start_date: string;
  end_date: string;
  half_day_start?: boolean;
  half_day_end?: boolean;
}): number {
  const { start_date, end_date, half_day_start, half_day_end } = opts;
  if (!start_date || !end_date) return 0;
  const start = parseISO(start_date);
  const end = parseISO(end_date);
  if (end < start) return 0;
  let total = 0;
  for (const d of eachDayOfInterval({ start, end })) {
    if (isWeekend(d) || isHoliday(d)) continue;
    if (isSameDay(d, start) && half_day_start) total += 0.5;
    else if (isSameDay(d, end) && half_day_end) total += 0.5;
    else total += 1;
  }
  return total;
}

export const LEAVE_TYPE_LABELS: Record<string, string> = {
  wfh: "WFH",
  leave: "Leave",
  compoff_wfh: "Comp-off WFH",
  compoff_leave: "Comp-off Leave",
};

export const LEAVE_TYPE_DOT: Record<string, string> = {
  wfh: "bg-leave-wfh",
  leave: "bg-leave-leave",
  compoff_wfh: "bg-leave-compwfh",
  compoff_leave: "bg-leave-compleave",
};

export const LEAVE_TYPE_PILL: Record<string, string> = {
  wfh: "bg-blue-50 text-blue-700 ring-blue-100",
  leave: "bg-orange-50 text-orange-700 ring-orange-100",
  compoff_wfh: "bg-cyan-50 text-cyan-700 ring-cyan-100",
  compoff_leave: "bg-amber-50 text-amber-700 ring-amber-100",
};

export function activeLeavesOnDate(leaves: Leave[], dateISO: string): Leave[] {
  return leaves.filter(
    (l) =>
      l.status === "active" && l.start_date <= dateISO && l.end_date >= dateISO
  );
}

export function rangeLabel(start: string, end: string): string {
  const s = parseISO(start);
  const e = parseISO(end);
  const fmt = (d: Date) =>
    `${d.toLocaleString("en-US", { month: "short" })} ${d.getDate()}`;
  if (start === end) return fmt(s);
  if (s.getMonth() === e.getMonth())
    return `${fmt(s)} – ${e.getDate()}`;
  return `${fmt(s)} – ${fmt(e)}`;
}

export function nextNDays(n: number, fromISO: string): string[] {
  const start = parseISO(fromISO);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(formatISO(addDays(start, i), { representation: "date" }));
  }
  return out;
}
