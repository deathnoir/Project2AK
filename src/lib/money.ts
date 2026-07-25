/**
 * Money is bigint centavos, everywhere, always.
 *
 * Postgres `numeric` is exact but crosses into JavaScript as a string or a
 * float and drifts. Centavos as a JS `number` is safe up to 2^53 — about
 * ₱90 trillion — so a plain number is fine on this side of the wire as long
 * as nothing ever divides without rounding back to an integer.
 *
 * Formatting happens here and only here. A component that builds its own
 * "₱" + n.toFixed(2) is how a ledger starts disagreeing with itself.
 */

/** A signed amount in centavos. Negative means money left the account. */
export type Centavos = number

const PESO = '₱'
/** U+2212 MINUS SIGN — the same width as a digit in tabular figures. */
const MINUS = '−'

export function isCentavos(value: unknown): value is Centavos {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

/**
 * Coerce a value that came back from Postgres (bigint columns arrive as
 * numbers or numeric strings depending on the driver path) into centavos.
 */
export function toCentavos(value: number | string | null | undefined): Centavos {
  if (value === null || value === undefined) return 0
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round(n)
}

/** Centavos as a plain decimal number of pesos. Display only — never store. */
export function toPesos(centavos: Centavos): number {
  return centavos / 100
}

/** Pesos (as typed by a human) to centavos, rounded half-away-from-zero. */
export function pesosToCentavos(pesos: number): Centavos {
  if (!Number.isFinite(pesos)) return 0
  return Math.sign(pesos) * Math.round(Math.abs(pesos) * 100)
}

export interface FormatOptions {
  /** Show the ₱ symbol. Default true. */
  symbol?: boolean
  /** Show centavos. Default true; false rounds to whole pesos for display. */
  cents?: boolean
  /** Always show a sign, including a leading + on positives. Default false. */
  signed?: boolean
  /** Render the magnitude only, dropping any sign. Default false. */
  absolute?: boolean
}

/**
 * The canonical amount string. Uses a true minus sign rather than a hyphen so
 * negatives align with positives in a tabular-figures column.
 */
export function formatCentavos(centavos: Centavos, options: FormatOptions = {}): string {
  const { symbol = true, cents = true, signed = false, absolute = false } = options
  const value = absolute ? Math.abs(centavos) : centavos
  const negative = value < 0
  const magnitude = Math.abs(value)

  const digits = cents ? 2 : 0
  const body = (cents ? magnitude / 100 : Math.round(magnitude / 100)).toLocaleString(
    'en-PH',
    { minimumFractionDigits: digits, maximumFractionDigits: digits },
  )

  const sign = negative ? MINUS : signed && magnitude !== 0 ? '+' : ''
  return `${sign}${symbol ? PESO : ''}${body}`
}

/** Compact form for dense grids: ₱1.2k, ₱45k, ₱1.4M. */
export function formatCompact(centavos: Centavos, options: FormatOptions = {}): string {
  const { symbol = true, absolute = false } = options
  const value = absolute ? Math.abs(centavos) : centavos
  const negative = value < 0
  const pesos = Math.abs(value) / 100

  let body: string
  if (pesos >= 1_000_000) body = `${trim(pesos / 1_000_000)}M`
  else if (pesos >= 1_000) body = `${trim(pesos / 1_000)}k`
  else body = Math.round(pesos).toLocaleString('en-PH')

  return `${negative ? MINUS : ''}${symbol ? PESO : ''}${body}`
}

function trim(n: number): string {
  return n >= 100 ? Math.round(n).toString() : n.toFixed(1).replace(/\.0$/, '')
}

/**
 * Parse whatever a human typed into centavos. Tolerates the peso sign, commas,
 * spaces, a leading or trailing minus, and parenthesised negatives, because
 * all of those turn up when pasting from a banking app.
 *
 * Returns null on anything it can't read, so callers can distinguish "empty"
 * from "zero" — silently treating a typo as ₱0.00 is how a ledger gets a hole
 * in it.
 */
export function parseAmount(input: string): Centavos | null {
  // Strip currency noise FIRST, so a parenthesised negative is still
  // recognisable after a leading ₱ ("₱(1,234.56)" is how a statement paste
  // arrives).
  let cleaned = input
    .replace(new RegExp(`[${PESO}\\s,_]`, 'g'), '')
    .replace(/(?:php|peso[s]?)/gi, '')
    .replace(new RegExp(MINUS, 'g'), '-')

  if (cleaned === '') return null

  let negative = false
  if (/^\(.*\)$/.test(cleaned)) {
    negative = true
    cleaned = cleaned.slice(1, -1)
  }

  if (cleaned.startsWith('-')) {
    negative = !negative
    cleaned = cleaned.slice(1)
  } else if (cleaned.endsWith('-')) {
    negative = !negative
    cleaned = cleaned.slice(0, -1)
  } else if (cleaned.startsWith('+')) {
    cleaned = cleaned.slice(1)
  }

  const match = /^(\d*)(?:\.(\d*))?$/.exec(cleaned)
  if (!match || (match[1] === '' && (match[2] ?? '') === '')) return null

  const whole = match[1] ?? ''
  const fraction = match[2] ?? ''

  // Build centavos from the digit string rather than multiplying a float by
  // 100. `1.005 * 100` is 100.49999999999999 in IEEE 754, so the obvious
  // implementation silently rounds ₱1.005 down to ₱1.00.
  const centavoDigits = (fraction + '00').slice(0, 2)
  let centavos = Number(whole || '0') * 100 + Number(centavoDigits)

  // Anything past two decimal places rounds half-up on the third digit.
  const third = fraction[2]
  if (third !== undefined && Number(third) >= 5) centavos += 1

  if (!Number.isSafeInteger(centavos)) return null

  return negative ? -centavos : centavos
}

/** Which sign class an amount falls into, for the two colour tokens. */
export type Sign = 'positive' | 'negative' | 'zero'

export function signOf(centavos: Centavos): Sign {
  if (centavos > 0) return 'positive'
  if (centavos < 0) return 'negative'
  return 'zero'
}

export function sumCentavos(values: readonly Centavos[]): Centavos {
  let total = 0
  for (const v of values) total += v
  return total
}

/**
 * Split a total into `parts` whole centavos that sum back to exactly the
 * total. Used for installment schedules, where three equal thirds of ₱6,000
 * must not quietly become ₱5,999.99.
 */
export function splitEvenly(total: Centavos, parts: number): Centavos[] {
  if (parts <= 0) return []
  const sign = total < 0 ? -1 : 1
  const magnitude = Math.abs(total)
  const base = Math.floor(magnitude / parts)
  const remainder = magnitude - base * parts
  return Array.from({ length: parts }, (_, i) => sign * (base + (i < remainder ? 1 : 0)))
}

/** Percentage of `part` against `whole`, guarding the zero-denominator case. */
export function percentOf(part: Centavos, whole: Centavos): number | null {
  if (whole === 0) return null
  return (part / whole) * 100
}
