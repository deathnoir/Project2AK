import type { Centavos } from '@/lib/money'
import type { DateString } from '@/lib/dates'

/**
 * Duplicate detection for receipts.
 *
 * Screenshots get uploaded twice — shared once from the notification and again
 * from the gallery, or re-shared after the app was closed mid-flow. Two
 * defences, in order of strength.
 */

/** Reference-number match: a hard duplicate, enforced by a unique index. */
export type DuplicateVerdict =
  | { kind: 'none' }
  | { kind: 'certain'; existingId: string; date: DateString; reason: 'reference_no' }
  | { kind: 'possible'; existingId: string; date: DateString; reason: 'amount_date_account' }

export interface CandidateRow {
  id: string
  date: DateString
  amount_centavos: Centavos
  account_id: string
  reference_no: string | null
  /** ISO timestamp of when the row was created — the 5-minute window anchor. */
  created_at: string
}

export interface IncomingRow {
  date: DateString
  amount_centavos: Centavos
  account_id: string
  reference_no: string | null
  /** When the incoming transaction happened, if the receipt printed a time. */
  occurredAt?: string
}

/** Two transactions this close together, otherwise identical, are suspicious. */
export const NEAR_DUPLICATE_WINDOW_MS = 5 * 60 * 1000

function normaliseReference(value: string | null): string | null {
  if (!value) return null
  // Providers pad and space reference numbers inconsistently between the
  // notification and the in-app receipt for the same transaction.
  const cleaned = value.replace(/[\s-]/g, '').toUpperCase()
  return cleaned === '' ? null : cleaned
}

/**
 * Decide whether an incoming transaction duplicates one already logged.
 *
 * A certain match is not an error. The caller shows "Already logged on 24 Jul"
 * with a link to the existing row and marks the receipt duplicate — erroring
 * here would make the fastest path in the app feel broken.
 *
 * A possible match is never auto-rejected. Same amount, same day, same
 * account, within five minutes is genuinely ambiguous: it is also what buying
 * two coffees on one run looks like. Flag it and let the user decide.
 */
export function findDuplicate(
  incoming: IncomingRow,
  candidates: readonly CandidateRow[],
): DuplicateVerdict {
  const incomingRef = normaliseReference(incoming.reference_no)

  if (incomingRef) {
    for (const candidate of candidates) {
      if (normaliseReference(candidate.reference_no) === incomingRef) {
        return {
          kind: 'certain',
          existingId: candidate.id,
          date: candidate.date,
          reason: 'reference_no',
        }
      }
    }
    // A reference number that matches nothing is proof of distinctness. Do not
    // fall through to the fuzzy heuristic and second-guess it.
    return { kind: 'none' }
  }

  const incomingAt = incoming.occurredAt ? Date.parse(incoming.occurredAt) : Number.NaN

  for (const candidate of candidates) {
    if (candidate.amount_centavos !== incoming.amount_centavos) continue
    if (candidate.account_id !== incoming.account_id) continue
    if (candidate.date !== incoming.date) continue

    if (Number.isNaN(incomingAt)) {
      // No time on either side: same amount, same day, same account is as
      // close as we can get. Still only "possible".
      return {
        kind: 'possible',
        existingId: candidate.id,
        date: candidate.date,
        reason: 'amount_date_account',
      }
    }

    const candidateAt = Date.parse(candidate.created_at)
    if (Number.isNaN(candidateAt)) continue
    if (Math.abs(candidateAt - incomingAt) <= NEAR_DUPLICATE_WINDOW_MS) {
      return {
        kind: 'possible',
        existingId: candidate.id,
        date: candidate.date,
        reason: 'amount_date_account',
      }
    }
  }

  return { kind: 'none' }
}
