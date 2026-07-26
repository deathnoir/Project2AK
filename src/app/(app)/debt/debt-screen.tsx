'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { Amount } from '@/components/ui/amount'
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  Muted,
  Warn,
} from '@/components/ui/primitives'
import { formatCentavos, parseAmount } from '@/lib/money'
import { monthName, today } from '@/lib/dates'
import { comparePayoff, DEFAULT_STRATEGY, orderAccounts } from '@/lib/domain/payoff'
import {
  bookAdjustment,
  markAccountClosed,
  recordStatement,
  reopenAccount,
} from '@/server/actions/debt'
import type { DebtProgress } from '@/lib/db/types'
import { cn } from '@/lib/cn'

export function DebtScreen({ accounts }: { accounts: DebtProgress[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [budgetInput, setBudgetInput] = useState('5000')

  const open = accounts.filter((a) => a.closed_at === null)
  const closed = accounts.filter((a) => a.closed_at !== null)
  const totalOwed = open.reduce((sum, a) => sum + a.owed_centavos, 0)

  const monthlyBudget = parseAmount(budgetInput) ?? 0

  const comparison = useMemo(
    () =>
      comparePayoff(
        open
          .filter((a) => a.owed_centavos > 0)
          .map((a) => ({
            id: a.account_id,
            name: a.name,
            owed_centavos: a.owed_centavos,
            apr: a.apr,
          })),
        Math.abs(monthlyBudget),
      ),
    [open, monthlyBudget],
  )

  // Smallest balance first is the default — not for motivation, and not
  // because it is arithmetically optimal. It clears and CLOSES whole accounts
  // fastest, and a closed account is permanently one fewer line of credit.
  // Fewer open doors is worth more than the interest saved by paying
  // highest-rate-first. The avalanche comparison is offered, not defaulted to.
  const ordered = orderAccounts(
    open.map((a) => ({
      id: a.account_id,
      name: a.name,
      owed_centavos: a.owed_centavos,
      apr: a.apr,
    })),
    DEFAULT_STRATEGY,
  )
  const byId = new Map(accounts.map((a) => [a.account_id, a]))

  return (
    <div className="space-y-5">
      {/* The headline count is accounts closed, not amount paid. */}
      <section className="border-b border-rule pb-5">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-ink-45">
          Accounts closed
        </p>
        <p className="figure mt-1 text-[clamp(2.5rem,10vw,3.5rem)] font-medium leading-none tracking-tight">
          {closed.length}
          <span className="text-ink-25"> / {accounts.length}</span>
        </p>
        <p className="mt-2 text-sm text-ink-45">
          <Amount centavos={totalOwed} size="sm" tone="none" /> still owed across{' '}
          {open.length} open {open.length === 1 ? 'line' : 'lines'}.
        </p>
      </section>

      <Card>
        <CardHeader
          title="Order to clear"
          hint="Smallest balance first — closing whole accounts fastest"
        />
        {ordered.length === 0 ? (
          <EmptyState title="Nothing owed" />
        ) : (
          <ul className="divide-y divide-rule">
            {ordered.map((entry, index) => {
              const account = byId.get(entry.id)
              if (!account) return null
              return (
                <li key={entry.id} className="px-4 py-3">
                  <div className="flex items-baseline gap-3">
                    <span className="figure w-5 text-sm text-ink-25">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {account.name}
                        {account.needs_closing ? <span className="ml-2"><Warn>Open — close this</Warn></span> : null}
                      </p>
                      <p className="text-xs text-ink-45">
                        {account.apr ? `${account.apr}% APR` : 'No interest'}
                        {account.due_day ? ` · due the ${account.due_day}${ordinal(account.due_day)}` : ''}
                        {account.tracking_mode === 'statement_only' ? ' · statement only' : ''}
                        {account.months_to_payoff !== null
                          ? ` · ~${account.months_to_payoff} mo at current pace`
                          : ''}
                      </p>
                    </div>
                    <Amount centavos={-account.owed_centavos} size="md" />
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-8 text-xs text-ink-45">
                    <span>
                      paid <Amount centavos={account.payments_centavos} size="xs" tone="none" compact />
                    </span>
                    <span>
                      charged <Amount centavos={account.charges_centavos} size="xs" tone="none" compact />
                    </span>
                    {account.percent_paid !== null ? <span>{account.percent_paid}% settled</span> : null}
                  </div>

                  <StatementRow account={account} />

                  {account.needs_closing ? <CloseForm accountId={account.account_id} /> : null}
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Payoff comparison" hint="Arithmetic, not advice" />
        <div className="space-y-3 p-4">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-ink-45">Monthly budget</span>
            <Input
              className="figure w-28"
              inputMode="decimal"
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
            />
          </label>

          {comparison.snowball.neverClears || comparison.avalanche.neverClears ? (
            <p className="text-sm text-rose">
              At {formatCentavos(Math.abs(monthlyBudget))} a month the interest outruns the
              payments — the balance grows instead of clearing.
            </p>
          ) : (
            <dl className="grid grid-cols-2 gap-4">
              <Strategy
                label="Smallest balance first"
                sublabel="Default"
                months={comparison.snowball.months}
                interest={comparison.snowball.totalInterest}
                highlight
              />
              <Strategy
                label="Highest rate first"
                sublabel="Avalanche"
                months={comparison.avalanche.months}
                interest={comparison.avalanche.totalInterest}
              />
            </dl>
          )}

          {comparison.monthsSaved !== null && comparison.interestSaved !== null ? (
            <p className="text-sm text-ink-70">
              At {formatCentavos(Math.abs(monthlyBudget), { cents: false })} a month,
              highest-rate-first clears{' '}
              {comparison.monthsSaved === 0
                ? 'in the same time'
                : `${Math.abs(comparison.monthsSaved)} month${Math.abs(comparison.monthsSaved) === 1 ? '' : 's'} ${comparison.monthsSaved > 0 ? 'sooner' : 'later'}`}{' '}
              and saves{' '}
              <Amount centavos={comparison.interestSaved} size="sm" tone="none" absolute /> in
              interest.
            </p>
          ) : null}

          <Muted className="block text-xs">
            The default order is smallest balance first because it closes whole accounts
            fastest, and a closed account is one fewer line of credit that can be used
            again.
          </Muted>
        </div>
      </Card>

      <DueCalendar accounts={open} />

      {closed.length > 0 ? (
        <Card>
          <CardHeader title="Closed" hint="Confirmed closed with the provider" />
          <ul className="divide-y divide-rule">
            {closed.map((account) => (
              <li key={account.account_id} className="flex items-baseline gap-3 px-4 py-2.5">
                <span className="flex-1 truncate text-sm">{account.name}</span>
                {account.closure_note ? (
                  <Muted className="figure text-xs">{account.closure_note}</Muted>
                ) : null}
                <span className="text-xs text-jade">Closed</span>
                <Button
                  variant="quiet"
                  className="min-h-0 px-2 py-1 text-xs"
                  onClick={() =>
                    startTransition(async () => {
                      await reopenAccount(account.account_id)
                      router.refresh()
                    })
                  }
                >
                  Reopen
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  )

  function StatementRow({ account }: { account: DebtProgress }) {
    const [value, setValue] = useState('')
    const gap = account.statement_gap_centavos

    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 pl-8">
        <Input
          aria-label={`Statement balance for ${account.name}`}
          className="figure w-32"
          inputMode="decimal"
          placeholder="Statement owed"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button
          className="min-h-[2.25rem] px-3 text-xs"
          onClick={() => {
            const amount = parseAmount(value)
            if (amount === null) return
            startTransition(async () => {
              // Stored signed: a liability's statement balance is negative,
              // the same as its derived balance.
              await recordStatement({
                accountId: account.account_id,
                month: today(),
                statementBalanceCentavos: -Math.abs(amount),
              })
              setValue('')
              router.refresh()
            })
          }}
        >
          Record
        </Button>
        {gap !== null && gap !== 0 ? (
          <>
            <Muted className="text-xs">
              Gap <Amount centavos={gap} size="xs" tone="none" /> — unlogged interest or fees
            </Muted>
            <Button
              className="min-h-[2.25rem] px-3 text-xs"
              onClick={() =>
                startTransition(async () => {
                  await bookAdjustment(account.account_id, -gap)
                  router.refresh()
                })
              }
            >
              Book to Finance Charges
            </Button>
          </>
        ) : null}
      </div>
    )
  }

  function CloseForm({ accountId }: { accountId: string }) {
    const [reference, setReference] = useState('')
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 pl-8">
        <Input
          aria-label="Closure reference number"
          className="w-40"
          placeholder="Closure reference"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
        <Button
          variant="primary"
          className="min-h-[2.25rem] px-3 text-xs"
          onClick={() =>
            startTransition(async () => {
              await markAccountClosed(accountId, reference)
              router.refresh()
            })
          }
        >
          Mark closed
        </Button>
      </div>
    )
  }
}

function Strategy({
  label,
  sublabel,
  months,
  interest,
  highlight = false,
}: {
  label: string
  sublabel: string
  months: number | null
  interest: number
  highlight?: boolean
}) {
  return (
    <div className={cn('rounded-[6px] border p-3', highlight ? 'border-ink' : 'border-rule')}>
      <dt className="text-xs uppercase tracking-[0.07em] text-ink-45">{label}</dt>
      <dd className="mt-1">
        <span className="figure text-lg">{months === null ? '—' : `${months} mo`}</span>
        <p className="mt-1 text-xs text-ink-45">
          <Amount centavos={interest} size="xs" tone="none" compact /> interest · {sublabel}
        </p>
      </dd>
    </div>
  )
}

/**
 * BNPL due dates cluster. Seeing five land on the 15th is actionable in a way
 * a balance column is not.
 */
function DueCalendar({ accounts }: { accounts: DebtProgress[] }) {
  const now = today()
  const month = Number(now.slice(5, 7))
  const daysInMonth = new Date(Date.UTC(Number(now.slice(0, 4)), month, 0)).getUTCDate()

  const byDay = new Map<number, DebtProgress[]>()
  for (const account of accounts) {
    if (!account.due_day) continue
    const day = Math.min(account.due_day, daysInMonth)
    byDay.set(day, [...(byDay.get(day) ?? []), account])
  }

  if (byDay.size === 0) return null

  return (
    <Card>
      <CardHeader title="Due dates" hint={monthName(month)} />
      <div className="grid grid-cols-7 gap-1 p-4">
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const due = byDay.get(day) ?? []
          return (
            <div
              key={day}
              title={due.map((a) => a.name).join(', ')}
              className={cn(
                'flex min-h-[3rem] flex-col rounded-[4px] border p-1',
                due.length === 0
                  ? 'border-rule'
                  : due.length > 1
                    ? 'border-rose bg-rose-soft'
                    : 'border-rule-strong bg-paper-sunk',
              )}
            >
              <span className="figure text-[0.625rem] text-ink-45">{day}</span>
              {due.length > 0 ? (
                <span className="mt-auto truncate text-[0.625rem] font-medium">
                  {due.length > 1 ? `${due.length} due` : due[0]?.name}
                </span>
              ) : null}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function ordinal(day: number): string {
  if (day > 3 && day < 21) return 'th'
  const remainder = day % 10
  return remainder === 1 ? 'st' : remainder === 2 ? 'nd' : remainder === 3 ? 'rd' : 'th'
}
