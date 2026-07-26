import Link from 'next/link'
import { Amount } from '@/components/ui/amount'
import { Card, CardHeader, EmptyState, LinkButton, Muted } from '@/components/ui/primitives'
import { formatDate } from '@/lib/dates'
import type { SavingsProgress } from '@/lib/db/types'
import { cn } from '@/lib/cn'

/**
 * Savings.
 *
 * The spreadsheet conflated two things that need different maths and different
 * UI, so this screen keeps them visually apart:
 *
 *   A GOAL accumulates to a target and is then done. Progress toward the
 *   target is the story, so it gets a bar and a countdown.
 *
 *   A SINKING FUND fills, gets spent, and refills. It has no finish line, so
 *   giving it a progress bar would read as permanent failure. A sinking fund
 *   at ₱0 in January is the cycle working — Christmas happened.
 */
export function SavingsScreen({
  goals,
  beneficiaryTotals,
}: {
  goals: SavingsProgress[]
  beneficiaryTotals: Array<{ beneficiary: string; saved_centavos: number; change_this_month_centavos: number }>
}) {
  const targets = goals.filter((g) => g.kind === 'goal')
  const funds = goals.filter((g) => g.kind === 'sinking')
  const total = goals.reduce((sum, g) => sum + g.saved_centavos, 0)

  if (goals.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No goals yet"
          action={<LinkButton href="/settings/savings" variant="primary">Set one up</LinkButton>}
        >
          Add a goal for something you&rsquo;re saving toward, or a sinking fund for
          something that comes round every year.
        </EmptyState>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <section className="border-b border-rule pb-5">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-ink-45">Set aside</p>
        <div className="mt-1">
          <Amount centavos={total} size="hero" tone="none" />
        </div>
        {beneficiaryTotals.length > 0 ? (
          <div className="mt-3 space-y-1">
            {beneficiaryTotals.map((row) => (
              <p key={row.beneficiary} className="text-sm text-ink-70">
                <span className="text-ink-45">For {row.beneficiary}</span>{' '}
                <Amount centavos={row.saved_centavos} size="sm" tone="none" />
                {row.change_this_month_centavos !== 0 ? (
                  <>
                    {' '}
                    <span className="text-ink-45">this month</span>{' '}
                    <Amount centavos={row.change_this_month_centavos} size="sm" signed />
                  </>
                ) : null}
              </p>
            ))}
          </div>
        ) : null}
      </section>

      {targets.length > 0 ? (
        <Card>
          <CardHeader
            title="Goals"
            hint="Accumulate to a target, then done"
            action={
              <Amount
                centavos={targets.reduce((s, g) => s + g.saved_centavos, 0)}
                size="sm"
                tone="none"
              />
            }
          />
          <ul className="divide-y divide-rule">
            {targets.map((goal) => (
              <GoalRow key={goal.goal_id} goal={goal} />
            ))}
          </ul>
        </Card>
      ) : null}

      {funds.length > 0 ? (
        <Card>
          <CardHeader
            title="Sinking funds"
            hint="Fill, get spent, refill"
            action={
              <Amount
                centavos={funds.reduce((s, g) => s + g.saved_centavos, 0)}
                size="sm"
                tone="none"
              />
            }
          />
          <ul className="divide-y divide-rule">
            {funds.map((fund) => (
              <SinkingRow key={fund.goal_id} fund={fund} />
            ))}
          </ul>
        </Card>
      ) : null}

      <p className="text-center">
        <Link href="/settings/savings" className="text-sm text-ink-45 underline">
          Edit goals
        </Link>
      </p>
    </div>
  )
}

function GoalRow({ goal }: { goal: SavingsProgress }) {
  const percent = goal.percent_complete ?? null
  const complete = percent !== null && percent >= 100

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex items-baseline gap-3">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {goal.category_name}
          {goal.beneficiary ? (
            <span className="ml-2 text-xs font-normal text-ink-45">{goal.beneficiary}</span>
          ) : null}
        </span>
        <span className="text-right">
          <Amount centavos={goal.saved_centavos} size="sm" tone="none" />
          {goal.goal_amount_centavos ? (
            <Muted className="block text-xs">
              of <Amount centavos={goal.goal_amount_centavos} size="xs" tone="none" compact />
            </Muted>
          ) : null}
        </span>
      </div>

      {goal.goal_amount_centavos ? (
        <>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-paper-sunk"
            role="progressbar"
            aria-valuenow={Math.round(Math.min(percent ?? 0, 100))}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${goal.category_name} progress`}
          >
            <div
              className={cn('h-full', complete ? 'bg-jade' : 'bg-ink-45')}
              style={{ width: `${Math.min(percent ?? 0, 100)}%` }}
            />
          </div>
          <p className="text-xs text-ink-45">
            {complete ? (
              <span className="text-jade">Done.</span>
            ) : (
              <>
                <Amount centavos={goal.remaining_centavos ?? 0} size="xs" tone="none" /> to go
                {goal.months_remaining !== null && goal.monthly_amount_centavos ? (
                  <>
                    {' · about '}
                    {goal.months_remaining} month{goal.months_remaining === 1 ? '' : 's'} at{' '}
                    <Amount
                      centavos={goal.monthly_amount_centavos}
                      size="xs"
                      tone="none"
                      compact
                    />{' '}
                    a month
                  </>
                ) : null}
                {goal.target_date ? ` · by ${formatDate(goal.target_date)}` : ''}
              </>
            )}
          </p>
        </>
      ) : (
        <p className="text-xs text-ink-45">No target set — just accumulating.</p>
      )}
    </li>
  )
}

function SinkingRow({ fund }: { fund: SavingsProgress }) {
  const empty = fund.saved_centavos <= 0

  return (
    <li className="flex items-baseline gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{fund.category_name}</p>
        <p className="text-xs text-ink-45">
          {/*
            No progress bar and no warning colour. A sinking fund at ₱0 has
            done its job — the money was spent on the thing it was for. Showing
            that as 0% of a target would read as failure every January.
          */}
          {empty
            ? 'Emptied — refilling from here'
            : fund.monthly_amount_centavos
              ? 'Filling'
              : 'Set aside'}
          {fund.monthly_amount_centavos ? (
            <>
              {' · '}
              <Amount
                centavos={fund.monthly_amount_centavos}
                size="xs"
                tone="none"
                compact
              />{' '}
              a month
            </>
          ) : null}
        </p>
      </div>
      <Amount centavos={fund.saved_centavos} size="sm" tone="none" />
    </li>
  )
}
