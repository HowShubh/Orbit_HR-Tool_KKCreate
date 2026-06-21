/**
 * Timezone-aware date helpers.
 *
 * KK Create operates in India (IST, UTC+5:30). Server code runs in UTC (Vercel),
 * so `new Date().toISOString().split('T')[0]` yields the *UTC* calendar date —
 * which is a day behind IST between 00:00 and 05:30 IST. That made "who's out
 * today", week ranges, and date guards wrong during early-morning hours.
 *
 * These helpers always resolve the calendar date in Asia/Kolkata. Use them for
 * any "today"/date-only computation on the server. (Full UTC timestamps such as
 * decided_at / read_at are correct as-is and should keep using toISOString().)
 */

export const APP_TIME_ZONE = 'Asia/Kolkata'

/** Current calendar date in IST as 'YYYY-MM-DD'. */
export function todayIST(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE }).format(new Date())
}

/** A Date anchored at UTC-midnight of the IST calendar date — safe for day math. */
function istAnchor(): Date {
  return new Date(`${todayIST()}T00:00:00Z`)
}

/** IST today offset by `n` days (may be negative), as 'YYYY-MM-DD'. */
export function istDatePlusDays(n: number): string {
  const d = istAnchor()
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Year and 0-based month of the current IST date. */
export function istYearMonth(): { year: number; month: number } {
  const [y, m] = todayIST().split('-').map(Number)
  return { year: y, month: m - 1 }
}

/** Month/day of IST today as 'MM-DD' (handy for anniversary/birthday matching). */
export function istMonthDay(): string {
  return todayIST().slice(5, 10)
}

/** Monday–Sunday range containing IST today, as 'YYYY-MM-DD' strings. */
export function istWeekRange(): { weekStart: string; weekEnd: string } {
  const d = istAnchor()
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay() // Mon=1 … Sun=7
  const start = new Date(d)
  start.setUTCDate(d.getUTCDate() - dow + 1)
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + 6)
  return { weekStart: start.toISOString().slice(0, 10), weekEnd: end.toISOString().slice(0, 10) }
}

/** First day (day 1) of the IST month shifted by `monthOffset`, as 'YYYY-MM-DD'. */
export function istMonthStart(monthOffset = 0): string {
  const { year, month } = istYearMonth()
  return new Date(Date.UTC(year, month + monthOffset, 1)).toISOString().slice(0, 10)
}

/** Last day of the IST month shifted by `monthOffset`, as 'YYYY-MM-DD'. */
export function istMonthEnd(monthOffset = 0): string {
  const { year, month } = istYearMonth()
  return new Date(Date.UTC(year, month + monthOffset + 1, 0)).toISOString().slice(0, 10)
}

// ── Fiscal year ───────────────────────────────────────────────────────────
// KK Create's fiscal year runs Jun 1 → May 31. We store a single integer
// `leave_year` = the FY's starting calendar year (e.g. 2026 means FY 2026-2027).

/** The FY start month (0-based): June. */
const FY_START_MONTH = 5

/** The starting calendar year of the fiscal year that contains IST today. */
export function currentFiscalYearStart(): number {
  const { year, month } = istYearMonth()
  return month >= FY_START_MONTH ? year : year - 1
}

/** Display label for a fiscal year, e.g. formatFiscalYear(2026) → "2026-2027". */
export function formatFiscalYear(startYear: number): string {
  return `${startYear}-${startYear + 1}`
}
