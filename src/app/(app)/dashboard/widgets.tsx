import { Amount } from '@/components/ui/amount'
import { MarkPaidButton } from './mark-paid'
import { Card, CardHeader, EmptyState, Muted, Row, Rows } from '@/components/ui/primitives'
import { monthName } from '@/lib/dates'
import type { BudgetVsActual, NoSpendDay } from '@/lib/db/types'
import { yearToDate } from '@/lib/domain/budget'

/** Bills landing in the next seven days, from the budget grid's due days. */
export function BillsDue({
  rows,
  today,
}: {
  rows: BudgetVsActual[]
  today: string
}) {
  const day = Number(today.slice(8, 10))
  const due = rows
    .filter((r) => r.due_day !== null && !r.is_paid && !r.is_archived)
    .filter((r) => {
      const dueDay = r.due_day as number
      // Wrap across the month end so the 2nd shows up on the 28th.
      const distance = dueDay >= day ? dueDay - day : dueDay + 30 - day
      return distance <= 7
    })
    .sort((a, b) => {
      const da = (a.due_day as number) >= day ? (a.due_day as number) - day : (a.due_day as number) + 30 - day
      const db = (b.due_day as number) >= day ? (b.due_day as number) - day : (b.due_day as number) + 30 - day
      return da - db
    })

  return (
    <Card>
      <CardHeader title="Due this week" hint="From the due days on your categories" />
      {due.length === 0 ? (
        <EmptyState title="Nothing due in the next seven days" />
      ) : (
        <Rows>
          {due.map((row) => (
            <Row key={row.category_id}>
              <span className="figure w-8 text-sm text-ink-45">{row.due_day}</span>
              <span className="flex-1 truncate text-sm">{row.category_name}</span>
              <Amount centavos={row.budget_centavos} size="sm" tone="none" />
              {/* Without this the list never clears, and a widget that always
                  shows the same four bills stops being read. */}
              <MarkPaidButton
                categoryId={row.category_id}
                year={row.year}
                month={row.month}
              />
            </Row>
          ))}
        </Rows>
      )}
    </Card>
  )
}

/**
 * No-spend days as a widget, not a screen.
 *
 * It is gamification, not information — a full screen would give it more room
 * than it earns.
 */
export function NoSpendWidget({
  days,
  goalDays,
  month,
}: {
  days: NoSpendDay[]
  goalDays: number
  month: number
}) {
  const elapsed = days.filter((d) => d.is_elapsed)
  const achieved = elapsed.filter((d) => d.is_no_spend).length

  return (
    <Card>
      <CardHeader title="No-spend days" hint={monthName(month)} />
      <div className="flex items-baseline gap-2 px-4 pt-3">
        <Amount centavos={achieved * 100} size="lg" tone="none" symbol={false} cents={false} />
        {goalDays > 0 ? <Muted className="text-sm">of {goalDays}</Muted> : null}
        <Muted className="ml-auto text-xs">{elapsed.length} days in</Muted>
      </div>
      <div className="flex flex-wrap gap-1 p-4 pt-3">
        {days.map((day) => (
          <span
            key={day.day}
            title={`${day.day}${day.is_no_spend ? ' — no spend' : ''}`}
            className={
              'h-3 w-3 rounded-[2px] ' +
              (!day.is_elapsed
                ? 'border border-rule'
                : day.is_no_spend
                  ? 'bg-jade'
                  : 'bg-rule-strong')
            }
          />
        ))}
      </div>
    </Card>
  )
}

/** Year to date, in compact figures. Replaces the spreadsheet's annual review. */
export function YtdStrip({
  rows,
  year,
  throughMonth,
}: {
  rows: BudgetVsActual[]
  year: number
  throughMonth: number
}) {
  const ytd = yearToDate(rows, year, throughMonth)
  const cells = [
    { label: 'Income', value: ytd.income, tone: 'none' as const },
    { label: 'Expenses', value: ytd.expenses, tone: 'none' as const },
    { label: 'Savings', value: ytd.savings, tone: 'none' as const },
    { label: 'Net', value: ytd.net, tone: 'auto' as const },
  ]

  return (
    <Card>
      <CardHeader title={`${year} to date`} hint={`Through ${monthName(throughMonth)}`} />
      <dl className="grid grid-cols-2 divide-x divide-y divide-rule sm:grid-cols-4 sm:divide-y-0">
        {cells.map((cell) => (
          <div key={cell.label} className="px-4 py-3">
            <dt className="text-xs uppercase tracking-[0.07em] text-ink-45">{cell.label}</dt>
            <dd className="mt-1">
              <Amount centavos={cell.value} size="md" tone={cell.tone} compact />
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}
