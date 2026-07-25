import type { Centavos } from '@/lib/money'

/**
 * Debt payoff simulation.
 *
 * Pure arithmetic, deliberately. The screen presents the comparison as
 * numbers — "₱2,000 extra per month, highest-rate-first clears 7 months
 * sooner and saves ₱X" — and stops there. It does not tell the user what to
 * do with that.
 */

export interface PayoffAccount {
  id: string
  name: string
  /** Positive magnitude of what is owed. */
  owed_centavos: Centavos
  /** Annual percentage rate, e.g. 36 for 36%. Null is treated as zero. */
  apr: number | null
  /** The contractual minimum, if there is one. */
  minimum_centavos?: Centavos
}

export type Strategy = 'snowball' | 'avalanche'

export interface PayoffResult {
  strategy: Strategy
  /** Null when the budget can't cover the interest and the debt never clears. */
  months: number | null
  totalInterest: Centavos
  totalPaid: Centavos
  /** The order accounts hit zero, with the month each one cleared. */
  clearedOrder: Array<{ id: string; name: string; month: number }>
  /** True when the monthly budget doesn't cover accrued interest. */
  neverClears: boolean
}

const MAX_MONTHS = 600

/**
 * Order accounts for payment.
 *
 * `snowball` is smallest balance first, `avalanche` is highest rate first.
 * Ties break on the other dimension so the ordering is deterministic.
 */
export function orderAccounts(
  accounts: readonly PayoffAccount[],
  strategy: Strategy,
): PayoffAccount[] {
  const list = [...accounts]
  if (strategy === 'avalanche') {
    list.sort(
      (a, b) => (b.apr ?? 0) - (a.apr ?? 0) || a.owed_centavos - b.owed_centavos,
    )
  } else {
    list.sort(
      (a, b) => a.owed_centavos - b.owed_centavos || (b.apr ?? 0) - (a.apr ?? 0),
    )
  }
  return list
}

/**
 * Simulate month-by-month payoff under a fixed total monthly budget.
 *
 * Each month: interest accrues on every outstanding balance at apr/12, every
 * account takes its minimum, and whatever is left of the budget goes entirely
 * to the first account in strategy order. As accounts clear, their minimums
 * free up — which is the whole reason either strategy beats paying minimums.
 */
export function simulatePayoff(
  accounts: readonly PayoffAccount[],
  monthlyBudgetCentavos: Centavos,
  strategy: Strategy,
): PayoffResult {
  const ordered = orderAccounts(
    accounts.filter((a) => a.owed_centavos > 0),
    strategy,
  )

  const balances = new Map<string, number>()
  for (const account of ordered) balances.set(account.id, account.owed_centavos)

  const clearedOrder: PayoffResult['clearedOrder'] = []
  let totalInterest = 0
  let totalPaid = 0
  let month = 0

  while (month < MAX_MONTHS) {
    const live = ordered.filter((a) => (balances.get(a.id) ?? 0) > 0)
    if (live.length === 0) {
      return {
        strategy,
        months: month,
        totalInterest,
        totalPaid,
        clearedOrder,
        neverClears: false,
      }
    }

    month++

    // Interest first — paying after accrual is how every provider does it,
    // and doing it the other way understates the cost of a slow payoff.
    let accrued = 0
    for (const account of live) {
      const balance = balances.get(account.id) ?? 0
      const monthlyRate = (account.apr ?? 0) / 100 / 12
      const interest = Math.round(balance * monthlyRate)
      balances.set(account.id, balance + interest)
      accrued += interest
    }
    totalInterest += accrued

    let budget = monthlyBudgetCentavos

    // Minimums on everything but the target, so nothing goes delinquent while
    // the snowball is aimed elsewhere.
    const target = live[0]
    if (!target) break
    for (const account of live) {
      if (account.id === target.id) continue
      const balance = balances.get(account.id) ?? 0
      const minimum = Math.min(account.minimum_centavos ?? 0, balance, budget)
      if (minimum <= 0) continue
      balances.set(account.id, balance - minimum)
      budget -= minimum
      totalPaid += minimum
    }

    // Everything left goes at the target.
    const targetBalance = balances.get(target.id) ?? 0
    const payment = Math.min(budget, targetBalance)
    if (payment > 0) {
      balances.set(target.id, targetBalance - payment)
      totalPaid += payment
      budget -= payment
    }

    // Spillover: the target cleared and there is budget left this month.
    if (budget > 0) {
      for (const account of live) {
        if (budget <= 0) break
        const balance = balances.get(account.id) ?? 0
        if (balance <= 0) continue
        const extra = Math.min(budget, balance)
        balances.set(account.id, balance - extra)
        totalPaid += extra
        budget -= extra
      }
    }

    for (const account of live) {
      if ((balances.get(account.id) ?? 0) <= 0 && !clearedOrder.some((c) => c.id === account.id)) {
        clearedOrder.push({ id: account.id, name: account.name, month })
      }
    }

    // The non-terminating case: the budget doesn't cover accrued interest, so
    // the balance grows every month. Bail with a clear answer rather than
    // spinning to MAX_MONTHS and reporting a number nobody can act on.
    if (accrued >= monthlyBudgetCentavos && monthlyBudgetCentavos > 0) {
      const totalOwed = [...balances.values()].reduce((a, b) => a + b, 0)
      const startOwed = ordered.reduce((a, b) => a + b.owed_centavos, 0)
      if (totalOwed >= startOwed) {
        return {
          strategy,
          months: null,
          totalInterest,
          totalPaid,
          clearedOrder,
          neverClears: true,
        }
      }
    }
  }

  return { strategy, months: null, totalInterest, totalPaid, clearedOrder, neverClears: true }
}

export interface PayoffComparison {
  snowball: PayoffResult
  avalanche: PayoffResult
  /** Months the avalanche saves. Negative means snowball is faster. */
  monthsSaved: number | null
  /** Interest the avalanche saves. */
  interestSaved: Centavos | null
}

export function comparePayoff(
  accounts: readonly PayoffAccount[],
  monthlyBudgetCentavos: Centavos,
): PayoffComparison {
  const snowball = simulatePayoff(accounts, monthlyBudgetCentavos, 'snowball')
  const avalanche = simulatePayoff(accounts, monthlyBudgetCentavos, 'avalanche')
  const monthsSaved =
    snowball.months !== null && avalanche.months !== null
      ? snowball.months - avalanche.months
      : null
  const interestSaved =
    snowball.months !== null && avalanche.months !== null
      ? snowball.totalInterest - avalanche.totalInterest
      : null
  return { snowball, avalanche, monthsSaved, interestSaved }
}

/**
 * The default order the Debt screen uses.
 *
 * Smallest balance first — NOT for motivation, and not because it is
 * arithmetically optimal (it isn't). It clears and closes whole accounts
 * fastest, and a closed account is permanently one fewer line of credit.
 * Fewer open doors is worth more than the interest saved by paying
 * highest-rate-first, because a credit line at ₱0 is exactly when the
 * operator invites you to use it again.
 *
 * The avalanche comparison is offered alongside. It is not the default.
 */
export const DEFAULT_STRATEGY: Strategy = 'snowball'
