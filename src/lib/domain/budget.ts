import type { BudgetVsActual, CategoryGroup } from '@/lib/db/types'
import type { Centavos } from '@/lib/money'

/**
 * Pure calculations over the budget grid.
 *
 * The numbers themselves — budget, actual, rollover, available, remaining —
 * come out of v_budget_vs_actual. Nothing here recomputes them; these are the
 * aggregations and classifications the grid needs on top.
 */

export const GROUP_ORDER: readonly CategoryGroup[] = [
  'income',
  'bills',
  'subscriptions',
  'expenses',
  'savings',
  'debt',
]

export const GROUP_LABEL: Record<CategoryGroup, string> = {
  income: 'Income',
  bills: 'Bills',
  subscriptions: 'Subscriptions',
  expenses: 'Expenses',
  savings: 'Savings',
  debt: 'Debt',
}

export function byGroup(rows: readonly BudgetVsActual[]): Map<CategoryGroup, BudgetVsActual[]> {
  const map = new Map<CategoryGroup, BudgetVsActual[]>()
  for (const group of GROUP_ORDER) map.set(group, [])
  for (const row of rows) {
    const list = map.get(row.category_group)
    if (list) list.push(row)
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order || a.category_name.localeCompare(b.category_name))
  }
  return map
}

export function monthRows(rows: readonly BudgetVsActual[], month: number): BudgetVsActual[] {
  return rows.filter((r) => r.month === month)
}

export interface AllocationSummary {
  incomeBudgeted: Centavos
  assigned: Centavos
  /** Exactly zero is the target. Not "close to zero" — exactly. */
  leftToBudget: Centavos
  isBalanced: boolean
  isOverAllocated: boolean
}

/**
 * Zero-based allocation for one month.
 *
 * Returns exact centavo integers. The signature element of the Budget screen
 * is a bar that turns jade only at exactly zero left to budget, so a rounding
 * error of one centavo would make it unreachable.
 */
export function allocationSummary(
  rows: readonly BudgetVsActual[],
  year: number,
  month: number,
): AllocationSummary {
  let incomeBudgeted = 0
  let assigned = 0
  for (const row of rows) {
    if (row.year !== year || row.month !== month || row.is_archived) continue
    if (row.category_group === 'income') incomeBudgeted += row.budget_centavos
    else assigned += row.budget_centavos
  }
  const leftToBudget = incomeBudgeted - assigned
  return {
    incomeBudgeted,
    assigned,
    leftToBudget,
    isBalanced: incomeBudgeted > 0 && leftToBudget === 0,
    isOverAllocated: leftToBudget < 0,
  }
}

/**
 * What to write into every month after `fromMonth` when the user copies a
 * month across the rest of the year. Income is copied too — a budget where
 * only the outgoings carry forward never balances again.
 */
export function copyMonthForward(
  rows: readonly BudgetVsActual[],
  year: number,
  fromMonth: number,
): Array<{ category_id: string; year: number; month: number; amount_centavos: Centavos }> {
  const source = rows.filter((r) => r.year === year && r.month === fromMonth && !r.is_archived)
  const out: Array<{ category_id: string; year: number; month: number; amount_centavos: Centavos }> = []
  for (let month = fromMonth + 1; month <= 12; month++) {
    for (const row of source) {
      out.push({
        category_id: row.category_id,
        year,
        month,
        amount_centavos: row.budget_centavos,
      })
    }
  }
  return out
}

export type RolloverState = 'carried-over' | 'in-the-hole' | 'fresh'

/**
 * Overspend carrying forward as negative is the whole point of rollover —
 * without it this is twelve unrelated budgets rather than zero-based
 * budgeting. Classify it so the UI can say so out loud.
 */
export function rolloverState(row: Pick<BudgetVsActual, 'rollover_in_centavos'>): RolloverState {
  if (row.rollover_in_centavos > 0) return 'carried-over'
  if (row.rollover_in_centavos < 0) return 'in-the-hole'
  return 'fresh'
}

export interface GroupTotals {
  group: CategoryGroup
  budget: Centavos
  actual: Centavos
  remaining: Centavos
}

export function groupTotals(rows: readonly BudgetVsActual[]): GroupTotals[] {
  return GROUP_ORDER.map((group) => {
    let budget = 0
    let actual = 0
    let remaining = 0
    for (const row of rows) {
      if (row.category_group !== group || row.is_archived) continue
      budget += row.budget_centavos
      actual += row.actual_centavos
      remaining += row.remaining_centavos
    }
    return { group, budget, actual, remaining }
  })
}

export interface YearToDate {
  income: Centavos
  expenses: Centavos
  savings: Centavos
  net: Centavos
}

/**
 * The dashboard's YTD strip. Expenses roll up bills, subscriptions, expenses
 * and debt — a mortgage payment and a jeepney fare are both money out.
 */
export function yearToDate(
  rows: readonly BudgetVsActual[],
  year: number,
  throughMonth: number,
): YearToDate {
  let income = 0
  let expenses = 0
  let savings = 0
  for (const row of rows) {
    if (row.year !== year || row.month > throughMonth) continue
    if (row.category_group === 'income') income += row.actual_centavos
    else if (row.category_group === 'savings') savings += row.actual_centavos
    else expenses += row.actual_centavos
  }
  return { income, expenses, savings, net: income - expenses - savings }
}
