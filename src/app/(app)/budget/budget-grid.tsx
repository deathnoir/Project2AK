'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Amount } from '@/components/ui/amount'
import { AllocationBar, Button, Card, CardHeader, Muted } from '@/components/ui/primitives'
import { MONTH_ABBR, monthName } from '@/lib/dates'
import { formatCentavos, parseAmount } from '@/lib/money'
import { allocationSummary, byGroup, GROUP_LABEL, GROUP_ORDER, rolloverState } from '@/lib/domain/budget'
import { copyMonthToRestOfYear, setBudget } from '@/server/actions/budgets'
import type { BudgetVsActual } from '@/lib/db/types'
import { cn } from '@/lib/cn'

export function BudgetGrid({
  rows,
  year,
  currentMonth,
}: {
  rows: BudgetVsActual[]
  year: number
  currentMonth: number
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [month, setMonth] = useState(currentMonth)
  // A 12-wide grid on a 390px screen is unusable, so phones get one month with
  // a stepper and can opt into the full grid.
  const [wide, setWide] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const summary = allocationSummary(rows, year, month)
  const grouped = byGroup(rows.filter((r) => r.month === month && !r.is_archived))

  function commit(categoryId: string, targetMonth: number, raw: string) {
    const amount = parseAmount(raw)
    if (amount === null) return
    setError(null)
    startTransition(async () => {
      const result = await setBudget({
        categoryId,
        year,
        month: targetMonth,
        amountCentavos: Math.abs(amount),
      })
      if (!result.ok) setError(result.error)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Left to budget"
          hint={`${monthName(month)} ${year}`}
          action={
            <Button
              variant="quiet"
              className="min-h-0 px-2 py-1 text-xs"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await copyMonthToRestOfYear({ year, fromMonth: month })
                  if (!result.ok) setError(result.error)
                  router.refresh()
                })
              }
            >
              Copy to rest of year
            </Button>
          }
        />
        <div className="space-y-3 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <Amount
              centavos={summary.leftToBudget}
              size="lg"
              tone={summary.isBalanced ? 'none' : 'auto'}
              className={summary.isBalanced ? 'text-jade' : undefined}
            />
            <Muted className="text-xs">
              {formatCentavos(summary.assigned, { cents: false })} of{' '}
              {formatCentavos(summary.incomeBudgeted, { cents: false })} assigned
            </Muted>
          </div>
          {/* The signature element: fills as each peso is assigned, and turns
              jade only at exactly zero left to budget. */}
          <AllocationBar allocated={summary.assigned} income={summary.incomeBudgeted} />
          <p className="text-xs text-ink-45">
            {summary.isBalanced
              ? 'Every peso is assigned.'
              : summary.isOverAllocated
                ? 'Assigned more than you expect to earn.'
                : 'Keep assigning until this reaches exactly zero.'}
          </p>
        </div>
      </Card>

      {error ? (
        <p className="rounded-[6px] border border-rose/35 bg-rose-soft px-3 py-2 text-sm text-rose">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <div className="scroll-x flex flex-1 gap-1">
          {MONTH_ABBR.map((label, index) => (
            <button
              key={label}
              type="button"
              aria-pressed={month === index + 1}
              onClick={() => setMonth(index + 1)}
              className={cn(
                'min-h-[2.25rem] shrink-0 rounded-[6px] border px-2.5 text-xs',
                month === index + 1
                  ? 'border-ink bg-ink text-paper'
                  : 'border-rule text-ink-45',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Button
          variant="quiet"
          className="hidden min-h-0 px-2 py-1 text-xs md:inline-flex"
          onClick={() => setWide((w) => !w)}
        >
          {wide ? 'Single month' : 'Full year'}
        </Button>
      </div>

      {GROUP_ORDER.map((group) => {
        const groupRows = grouped.get(group) ?? []
        if (groupRows.length === 0) return null
        const budgetTotal = groupRows.reduce((s, r) => s + r.budget_centavos, 0)
        const actualTotal = groupRows.reduce((s, r) => s + r.actual_centavos, 0)

        return (
          <Card key={group}>
            <CardHeader
              title={GROUP_LABEL[group]}
              action={
                <span className="flex items-baseline gap-3">
                  <Amount centavos={budgetTotal} size="sm" tone="none" compact />
                  <Muted className="text-xs">
                    <Amount centavos={actualTotal} size="xs" tone="none" compact />
                  </Muted>
                </span>
              }
            />
            {wide ? (
              <WideRows rows={rows} group={group} year={year} onCommit={commit} />
            ) : (
              <ul className="divide-y divide-rule">
                {groupRows.map((row) => (
                  <BudgetRow key={row.category_id} row={row} onCommit={commit} />
                ))}
              </ul>
            )}
          </Card>
        )
      })}
    </div>
  )
}

function BudgetRow({
  row,
  onCommit,
}: {
  row: BudgetVsActual
  onCommit: (categoryId: string, month: number, raw: string) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const state = rolloverState(row)

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{row.category_name}</p>
        <p className="flex items-center gap-2 text-xs text-ink-45">
          <span>
            spent <Amount centavos={row.actual_centavos} size="xs" tone="none" compact />
          </span>
          {/* Rollover is what makes this zero-based budgeting rather than
              twelve unrelated budgets, so say it out loud. */}
          {state === 'in-the-hole' ? (
            <span className="text-rose">
              <Amount centavos={row.rollover_in_centavos} size="xs" tone="none" compact /> carried in
            </span>
          ) : state === 'carried-over' ? (
            <span className="text-jade">
              <Amount centavos={row.rollover_in_centavos} size="xs" tone="none" compact /> carried in
            </span>
          ) : null}
        </p>
      </div>

      <input
        aria-label={`Budget for ${row.category_name}`}
        inputMode="decimal"
        className="figure w-24 rounded-[6px] border border-rule bg-paper px-2 py-1.5 text-sm focus:border-ink focus:outline-none"
        value={draft ?? (row.budget_centavos / 100).toFixed(2)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== null) onCommit(row.category_id, row.month, draft)
          setDraft(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setDraft(null)
        }}
      />

      <span className="w-20 text-right">
        <Amount
          centavos={row.remaining_centavos}
          size="sm"
          tone={row.remaining_centavos < 0 ? 'auto' : 'none'}
          compact
        />
      </span>
    </li>
  )
}

function WideRows({
  rows,
  group,
  year,
  onCommit,
}: {
  rows: BudgetVsActual[]
  group: BudgetVsActual['category_group']
  year: number
  onCommit: (categoryId: string, month: number, raw: string) => void
}) {
  const categories = [
    ...new Map(
      rows
        .filter((r) => r.category_group === group && !r.is_archived && r.year === year)
        .map((r) => [r.category_id, r]),
    ).values(),
  ].sort((a, b) => a.sort_order - b.sort_order)

  return (
    // Wide content scrolls inside its own container; the page body never does.
    <div className="scroll-x">
      <table className="w-full min-w-[52rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-rule">
            <th className="sticky left-0 z-10 bg-paper px-4 py-2 text-left text-xs font-medium uppercase tracking-[0.07em] text-ink-45">
              Category
            </th>
            {MONTH_ABBR.map((label) => (
              <th key={label} className="px-2 py-2 text-right text-xs font-medium text-ink-45">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {categories.map((category) => (
            <tr key={category.category_id}>
              <th
                scope="row"
                className="sticky left-0 z-10 max-w-[10rem] truncate bg-paper px-4 py-2 text-left font-normal"
              >
                {category.category_name}
              </th>
              {MONTH_ABBR.map((label, index) => {
                const cell = rows.find(
                  (r) =>
                    r.category_id === category.category_id &&
                    r.year === year &&
                    r.month === index + 1,
                )
                return (
                  <td key={label} className="px-1 py-1 text-right">
                    <input
                      aria-label={`${category.category_name} ${label}`}
                      inputMode="decimal"
                      defaultValue={((cell?.budget_centavos ?? 0) / 100).toFixed(0)}
                      onBlur={(e) => onCommit(category.category_id, index + 1, e.target.value)}
                      className="figure w-16 rounded-[4px] border border-transparent bg-transparent px-1 py-1 text-right hover:border-rule focus:border-ink focus:outline-none"
                    />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
