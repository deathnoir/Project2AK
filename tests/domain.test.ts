import { describe, expect, it } from 'vitest'
import { allocationSummary, copyMonthForward, rolloverState, yearToDate } from '@/lib/domain/budget'
import { comparePayoff, orderAccounts, simulatePayoff } from '@/lib/domain/payoff'
import { findDuplicate, type CandidateRow } from '@/lib/extraction/dedupe'
import { EXTRACTION_JSON_SCHEMA, extractionSchema } from '@/lib/extraction/schema'
import type { BudgetVsActual } from '@/lib/db/types'

function row(partial: Partial<BudgetVsActual>): BudgetVsActual {
  return {
    user_id: 'u',
    category_id: 'c',
    category_group: 'expenses',
    category_name: 'Groceries',
    rollover_enabled: true,
    is_archived: false,
    due_day: null,
    sort_order: 0,
    year: 2026,
    month: 1,
    budget_centavos: 0,
    is_paid: false,
    actual_centavos: 0,
    txn_count: 0,
    rollover_in_centavos: 0,
    available_centavos: 0,
    remaining_centavos: 0,
    variance_centavos: 0,
    ...partial,
  }
}

describe('allocationSummary', () => {
  it('reaches exactly zero when every peso is assigned', () => {
    const rows = [
      row({ category_group: 'income', category_id: 'i', budget_centavos: 5_000_00 }),
      row({ category_id: 'a', budget_centavos: 3_000_00 }),
      row({ category_id: 'b', budget_centavos: 2_000_00 }),
    ]
    const summary = allocationSummary(rows, 2026, 1)
    // The signature bar turns jade only at exactly zero, so this must be an
    // exact integer — not "within a centavo".
    expect(summary.leftToBudget).toBe(0)
    expect(summary.isBalanced).toBe(true)
    expect(summary.isOverAllocated).toBe(false)
  })

  it('reports over-allocation as a negative, not an absolute', () => {
    const rows = [
      row({ category_group: 'income', category_id: 'i', budget_centavos: 5_000_00 }),
      row({ category_id: 'a', budget_centavos: 6_000_00 }),
    ]
    const summary = allocationSummary(rows, 2026, 1)
    expect(summary.leftToBudget).toBe(-1_000_00)
    expect(summary.isOverAllocated).toBe(true)
    expect(summary.isBalanced).toBe(false)
  })

  it('ignores archived categories and other months', () => {
    const rows = [
      row({ category_group: 'income', category_id: 'i', budget_centavos: 5_000_00 }),
      row({ category_id: 'a', budget_centavos: 9_999_00, is_archived: true }),
      row({ category_id: 'b', budget_centavos: 9_999_00, month: 2 }),
    ]
    expect(allocationSummary(rows, 2026, 1).leftToBudget).toBe(5_000_00)
  })

  it('is not balanced when nothing has been budgeted at all', () => {
    expect(allocationSummary([], 2026, 1).isBalanced).toBe(false)
  })
})

describe('rolloverState', () => {
  it('names the three states the grid labels', () => {
    expect(rolloverState({ rollover_in_centavos: 1_200_00 })).toBe('carried-over')
    expect(rolloverState({ rollover_in_centavos: -1_200_00 })).toBe('in-the-hole')
    expect(rolloverState({ rollover_in_centavos: 0 })).toBe('fresh')
  })
})

describe('copyMonthForward', () => {
  it('copies income too, or the budget never balances again', () => {
    const rows = [
      row({ category_group: 'income', category_id: 'i', month: 1, budget_centavos: 5_000_00 }),
      row({ category_id: 'a', month: 1, budget_centavos: 3_000_00 }),
    ]
    const writes = copyMonthForward(rows, 2026, 1)
    expect(writes).toHaveLength(2 * 11)
    expect(writes.filter((w) => w.month === 12)).toHaveLength(2)
    expect(writes.some((w) => w.category_id === 'i')).toBe(true)
    expect(writes.every((w) => w.month > 1)).toBe(true)
  })
})

describe('yearToDate', () => {
  it('rolls bills, subscriptions, expenses and debt into one outflow', () => {
    const rows = [
      row({ category_group: 'income', month: 1, actual_centavos: 50_000_00 }),
      row({ category_group: 'bills', month: 1, actual_centavos: 15_000_00 }),
      row({ category_group: 'debt', month: 1, actual_centavos: 300_00 }),
      row({ category_group: 'savings', month: 1, actual_centavos: 5_000_00 }),
      row({ category_group: 'expenses', month: 6, actual_centavos: 9_999_00 }),
    ]
    const ytd = yearToDate(rows, 2026, 3)
    expect(ytd.income).toBe(50_000_00)
    expect(ytd.expenses).toBe(15_300_00)
    expect(ytd.savings).toBe(5_000_00)
    expect(ytd.net).toBe(29_700_00)
  })
})

describe('payoff', () => {
  const accounts = [
    { id: 'atome', name: 'Atome', owed_centavos: 4_200_00, apr: 0 },
    { id: 'billease', name: 'BillEase', owed_centavos: 12_000_00, apr: 42 },
    { id: 'revi', name: 'REVI', owed_centavos: 2_500_00, apr: 60 },
  ]

  it('orders snowball by balance and avalanche by rate', () => {
    expect(orderAccounts(accounts, 'snowball').map((a) => a.id)).toEqual([
      'revi',
      'atome',
      'billease',
    ])
    expect(orderAccounts(accounts, 'avalanche').map((a) => a.id)).toEqual([
      'revi',
      'billease',
      'atome',
    ])
  })

  it('clears everything and reports the order accounts close', () => {
    const result = simulatePayoff(accounts, 5_000_00, 'snowball')
    expect(result.neverClears).toBe(false)
    expect(result.months).toBeGreaterThan(0)
    expect(result.clearedOrder).toHaveLength(3)
    expect(result.clearedOrder[0]?.id).toBe('revi')
  })

  it('costs no interest when every rate is zero', () => {
    const zero = [{ id: 'a', name: 'A', owed_centavos: 6_000_00, apr: 0 }]
    const result = simulatePayoff(zero, 2_000_00, 'snowball')
    expect(result.totalInterest).toBe(0)
    expect(result.months).toBe(3)
  })

  it('bails instead of spinning when the budget cannot cover the interest', () => {
    const underwater = [{ id: 'a', name: 'A', owed_centavos: 100_000_00, apr: 60 }]
    const result = simulatePayoff(underwater, 100_00, 'avalanche')
    expect(result.neverClears).toBe(true)
    expect(result.months).toBeNull()
  })

  it('treats an already-cleared account as nothing to do', () => {
    const cleared = [{ id: 'a', name: 'A', owed_centavos: 0, apr: 36 }]
    const result = simulatePayoff(cleared, 1_000_00, 'snowball')
    expect(result.months).toBe(0)
    expect(result.totalInterest).toBe(0)
  })

  it('lets avalanche beat snowball on interest, which is the whole comparison', () => {
    const comparison = comparePayoff(accounts, 5_000_00)
    expect(comparison.avalanche.totalInterest).toBeLessThanOrEqual(
      comparison.snowball.totalInterest,
    )
    expect(comparison.interestSaved).not.toBeNull()
  })
})

describe('findDuplicate', () => {
  const base: CandidateRow = {
    id: 'existing',
    date: '2026-07-24',
    amount_centavos: -45_000,
    account_id: 'gcash',
    reference_no: '1029384756',
    created_at: '2026-07-24T14:32:00.000Z',
  }

  it('treats a matching reference number as certain', () => {
    const verdict = findDuplicate(
      { date: '2026-07-24', amount_centavos: -45_000, account_id: 'gcash', reference_no: '1029384756' },
      [base],
    )
    expect(verdict.kind).toBe('certain')
    if (verdict.kind === 'certain') expect(verdict.existingId).toBe('existing')
  })

  it('matches through the padding providers add between screens', () => {
    const verdict = findDuplicate(
      { date: '2026-07-24', amount_centavos: -45_000, account_id: 'gcash', reference_no: ' 1029-384756 ' },
      [base],
    )
    expect(verdict.kind).toBe('certain')
  })

  it('trusts a non-matching reference number instead of second-guessing it', () => {
    // Same amount, day and account, but a different reference: two real
    // purchases. Falling through to the fuzzy check here would flag every
    // second coffee.
    const verdict = findDuplicate(
      { date: '2026-07-24', amount_centavos: -45_000, account_id: 'gcash', reference_no: '9999999999' },
      [base],
    )
    expect(verdict.kind).toBe('none')
  })

  it('flags a near-miss inside the five-minute window, never rejects it', () => {
    const noRef = { ...base, reference_no: null }
    const within = findDuplicate(
      {
        date: '2026-07-24',
        amount_centavos: -45_000,
        account_id: 'gcash',
        reference_no: null,
        occurredAt: '2026-07-24T14:36:00.000Z', // 4 minutes
      },
      [noRef],
    )
    expect(within.kind).toBe('possible')

    const outside = findDuplicate(
      {
        date: '2026-07-24',
        amount_centavos: -45_000,
        account_id: 'gcash',
        reference_no: null,
        occurredAt: '2026-07-24T14:38:00.000Z', // 6 minutes
      },
      [noRef],
    )
    expect(outside.kind).toBe('none')
  })

  it('does not confuse the same amount on a different account', () => {
    const noRef = { ...base, reference_no: null }
    const verdict = findDuplicate(
      {
        date: '2026-07-24',
        amount_centavos: -45_000,
        account_id: 'bpi',
        reference_no: null,
        occurredAt: '2026-07-24T14:33:00.000Z',
      },
      [noRef],
    )
    expect(verdict.kind).toBe('none')
  })
})

describe('extraction schema', () => {
  // Typed loosely on purpose: these fixtures exist to feed the runtime
  // validator invalid values, which a precisely-typed literal would forbid.
  const valid: Record<string, unknown> & {
    transactions: Array<Record<string, unknown>>
  } = {
    transactions: [
      {
        amount_centavos: 45000,
        currency: 'PHP',
        date: '2026-07-24',
        time: '14:32',
        merchant: 'Jollibee SM Dasmariñas',
        reference_no: '1029384756',
        source_account_hint: 'GCash',
        type: 'payment',
        fee_centavos: 1500,
        confidence: { amount: 0.98, date: 0.95, merchant: 0.8 },
      },
    ],
    image_kind: 'ewallet_receipt',
    notes: null,
  }

  it('accepts a well-formed extraction', () => {
    expect(extractionSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects a float amount, because money is integer centavos', () => {
    const floaty = structuredClone(valid)
    floaty.transactions[0]!.amount_centavos = 450.5
    expect(extractionSchema.safeParse(floaty).success).toBe(false)
  })

  it('rejects a malformed date rather than letting it reach a ledger', () => {
    const bad = structuredClone(valid)
    bad.transactions[0]!.date = '24/07/2026'
    expect(extractionSchema.safeParse(bad).success).toBe(false)
  })

  it('accepts a null merchant and a null reference number', () => {
    const sparse = structuredClone(valid)
    sparse.transactions[0]!.merchant = null
    sparse.transactions[0]!.reference_no = null
    sparse.transactions[0]!.time = null
    sparse.transactions[0]!.fee_centavos = null
    expect(extractionSchema.safeParse(sparse).success).toBe(true)
  })

  it('keeps the JSON Schema and the Zod schema from drifting apart', () => {
    // The model is constrained by one and the response is validated by the
    // other. If they disagree, every extraction fails validation in
    // production and nowhere else.
    const jsonKeys = Object.keys(EXTRACTION_JSON_SCHEMA.properties).sort()
    const zodKeys = Object.keys(extractionSchema.shape).sort()
    expect(jsonKeys).toEqual(zodKeys)

    const txSchema = EXTRACTION_JSON_SCHEMA.properties.transactions.items
    const txJsonKeys = Object.keys(txSchema.properties).sort()
    const txZodKeys = Object.keys(extractionSchema.shape.transactions.element.shape).sort()
    expect(txJsonKeys).toEqual(txZodKeys)
    expect([...txSchema.required].sort()).toEqual(txZodKeys)
  })
})
