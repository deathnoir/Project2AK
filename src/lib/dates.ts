/**
 * Date helpers.
 *
 * Everything the user sees is a calendar date in Manila. Dates are stored as
 * Postgres `date` and carried around as `YYYY-MM-DD` strings — never as
 * `Date` objects, which silently pick up a timezone and turn "the 1st" into
 * "the 31st at 4pm" on the way through JSON.
 *
 * The timezone matters more than it looks: a server running in UTC that does
 * `new Date().toISOString().slice(0, 10)` reports yesterday for every Manila
 * morning before 8am. Logging a jeepney fare on the way to work would land it
 * on the wrong day, every day.
 */

export const TIME_ZONE = 'Asia/Manila'

/** A calendar date as `YYYY-MM-DD`. */
export type DateString = string

const isoFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Today's calendar date in Manila, regardless of where the code is running. */
export function today(now: Date = new Date()): DateString {
  return isoFormatter.format(now)
}

export function parseDate(value: DateString): { year: number; month: number; day: number } {
  const [y, m, d] = value.split('-')
  return { year: Number(y), month: Number(m), day: Number(d) }
}

export function toDateString(year: number, month: number, day: number): DateString {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * The `day`th of the given month, clamped to the last day when the month is
 * short. A rule set for the 31st fires on the 30th in November and the 28th
 * in February — which is what every biller does, and what the user means.
 */
export function clampedDay(year: number, month: number, day: number): DateString {
  return toDateString(year, month, Math.min(day, daysInMonth(year, month)))
}

export function addMonths(date: DateString, months: number): DateString {
  const { year, month, day } = parseDate(date)
  const total = (year * 12 + (month - 1)) + months
  const nextYear = Math.floor(total / 12)
  const nextMonth = (total % 12) + 1
  return clampedDay(nextYear, nextMonth, day)
}

export function addDays(date: DateString, days: number): DateString {
  const { year, month, day } = parseDate(date)
  const d = new Date(Date.UTC(year, month - 1, day + days))
  return toDateString(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

export function compareDates(a: DateString, b: DateString): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function daysBetween(from: DateString, to: DateString): number {
  const a = parseDate(from)
  const b = parseDate(to)
  const ms =
    Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)
  return Math.round(ms / 86_400_000)
}

export function startOfMonth(date: DateString): DateString {
  const { year, month } = parseDate(date)
  return toDateString(year, month, 1)
}

export function endOfMonth(date: DateString): DateString {
  const { year, month } = parseDate(date)
  return toDateString(year, month, daysInMonth(year, month))
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

export const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

export function monthName(month: number, short = false): string {
  const list = short ? MONTH_ABBR : MONTH_NAMES
  return list[month - 1] ?? ''
}

/** "24 Jul", or "24 Jul 2025" when the year isn't the one being viewed. */
export function formatDate(date: DateString, activeYear?: number): string {
  const { year, month, day } = parseDate(date)
  const base = `${day} ${monthName(month, true)}`
  return activeYear === undefined || year === activeYear ? base : `${base} ${year}`
}

/** "Today", "Yesterday", or the short date — for transaction list headers. */
export function formatRelativeDay(date: DateString, from: DateString = today()): string {
  const diff = daysBetween(date, from)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff === -1) return 'Tomorrow'
  return formatDate(date, parseDate(from).year)
}

/**
 * The next payday strictly after `from`, given the days of the month salary
 * lands on. Mirrors the `next_payday()` SQL function; both exist because the
 * dashboard needs it server-side and the add screen needs it client-side
 * without a round trip.
 */
export function nextPayday(paydayDays: readonly number[], from: DateString = today()): DateString {
  const { year, month } = parseDate(from)
  const candidates: DateString[] = []
  for (let offset = 0; offset <= 2; offset++) {
    const total = year * 12 + (month - 1) + offset
    const y = Math.floor(total / 12)
    const m = (total % 12) + 1
    for (const day of paydayDays) candidates.push(clampedDay(y, m, day))
  }
  const future = candidates.filter((d) => d > from).sort()
  // A profile with an empty payday list still needs an answer; fall back to a
  // month out rather than returning undefined into the projection.
  return future[0] ?? addMonths(from, 1)
}

/**
 * Advance a recurring rule to its next occurrence after `after`.
 *
 * Yearly rules pin to `monthOfYear`; monthly and every-N-months step by the
 * interval. Day-of-month is clamped, so a 31st rule doesn't skip February.
 */
export function nextOccurrence(rule: {
  frequency: 'monthly' | 'yearly' | 'every_n_months'
  interval_months: number
  day_of_month: number
  month_of_year: number | null
  next_run: DateString
}, after: DateString = today()): DateString {
  const step =
    rule.frequency === 'yearly' ? 12
    : rule.frequency === 'every_n_months' ? Math.max(1, rule.interval_months)
    : 1

  let cursor = rule.next_run
  // A rule that has been dormant for months catches up rather than firing
  // once for a date long past.
  let guard = 0
  while (cursor <= after && guard < 600) {
    const { year, month } = parseDate(cursor)
    const total = year * 12 + (month - 1) + step
    const y = Math.floor(total / 12)
    const m = rule.frequency === 'yearly' && rule.month_of_year
      ? rule.month_of_year
      : (total % 12) + 1
    cursor = clampedDay(rule.frequency === 'yearly' ? y : y, m, rule.day_of_month)
    guard++
  }
  return cursor
}

/** Every month between two dates inclusive, as first-of-month date strings. */
export function monthsBetween(from: DateString, to: DateString): DateString[] {
  const out: DateString[] = []
  let cursor = startOfMonth(from)
  const last = startOfMonth(to)
  let guard = 0
  while (cursor <= last && guard < 1200) {
    out.push(cursor)
    cursor = addMonths(cursor, 1)
    guard++
  }
  return out
}
