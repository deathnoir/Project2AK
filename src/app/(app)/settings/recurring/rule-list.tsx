'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Amount } from '@/components/ui/amount'
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Muted,
  Select,
} from '@/components/ui/primitives'
import { clampedDay, formatDate, today } from '@/lib/dates'
import { parseAmount } from '@/lib/money'
import { deleteRule, saveRule } from '@/server/actions/recurring'
import type { RecurringRule, Recurrence } from '@/lib/db/types'

interface Option {
  id: string
  name: string
}

export function RuleList({
  rules,
  accounts,
  categories,
}: {
  rules: RecurringRule[]
  accounts: Option[]
  categories: Option[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState<string | null>(null)

  const accountName = new Map(accounts.map((a) => [a.id, a.name]))
  const categoryName = new Map(categories.map((c) => [c.id, c.name]))

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Rules"
          hint="Roughly 70% of a month's rows are known in advance"
        />
        <p className="border-b border-rule px-4 py-3 text-sm text-ink-45">
          A rule generates a <em>pending</em> row on its due date for you to confirm, edit or
          skip. It never posts on its own — an unconfirmed bill that silently posted is worse
          than one that didn&rsquo;t.
        </p>
        {rules.length === 0 ? (
          <EmptyState title="No rules yet">
            Add your mortgage, utilities, subscriptions and any BNPL installments.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-rule">
            {rules.map((rule) => (
              <li key={rule.id} className="px-4 py-3">
                <div className="flex items-baseline gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{rule.name}</p>
                    <p className="truncate text-xs text-ink-45">
                      {rule.to_account_id
                        ? // A rule with a destination is a transfer, which is
                          // how installments work: cash down, liability down.
                          `Transfer · ${accountName.get(rule.account_id) ?? '—'} → ${accountName.get(rule.to_account_id) ?? '—'}`
                        : `${rule.category_id ? (categoryName.get(rule.category_id) ?? '—') : 'Uncategorised'} · ${accountName.get(rule.account_id) ?? '—'}`}
                      {' · next '}
                      {formatDate(rule.next_run)}
                      {rule.is_active ? '' : ' · paused'}
                    </p>
                  </div>
                  {rule.amount_centavos === null ? (
                    <Muted className="text-xs">same as last time</Muted>
                  ) : (
                    <Amount centavos={rule.amount_centavos} size="sm" tone="expense" />
                  )}
                </div>
                <div className="mt-2 flex gap-2">
                  <Button
                    className="min-h-[2.25rem] px-3 text-xs"
                    onClick={() => setEditing(editing === rule.id ? null : rule.id)}
                  >
                    {editing === rule.id ? 'Close' : 'Edit'}
                  </Button>
                  <Button
                    variant="danger"
                    className="min-h-[2.25rem] px-3 text-xs"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await deleteRule(rule.id)
                        router.refresh()
                      })
                    }
                  >
                    Delete
                  </Button>
                </div>
                {editing === rule.id ? (
                  <RuleEditor
                    rule={rule}
                    accounts={accounts}
                    categories={categories}
                    onSaved={() => {
                      setEditing(null)
                      router.refresh()
                    }}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Add a rule" />
        <div className="p-4">
          <RuleEditor
            rule={null}
            accounts={accounts}
            categories={categories}
            onSaved={() => router.refresh()}
          />
        </div>
      </Card>
    </div>
  )
}

function RuleEditor({
  rule,
  accounts,
  categories,
  onSaved,
}: {
  rule: RecurringRule | null
  accounts: Option[]
  categories: Option[]
  onSaved: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(rule?.name ?? '')
  const [isTransfer, setIsTransfer] = useState(Boolean(rule?.to_account_id))
  const [accountId, setAccountId] = useState(rule?.account_id ?? accounts[0]?.id ?? '')
  const [toAccountId, setToAccountId] = useState(rule?.to_account_id ?? '')
  const [categoryId, setCategoryId] = useState(rule?.category_id ?? '')
  const [amount, setAmount] = useState(
    rule?.amount_centavos !== null && rule?.amount_centavos !== undefined
      ? (Math.abs(rule.amount_centavos) / 100).toFixed(2)
      : '',
  )
  const [sameAsLast, setSameAsLast] = useState(rule?.amount_centavos === null)
  const [frequency, setFrequency] = useState<Recurrence>(rule?.frequency ?? 'monthly')
  const [intervalMonths, setIntervalMonths] = useState(rule?.interval_months ?? 1)
  const [dayOfMonth, setDayOfMonth] = useState(rule?.day_of_month ?? 1)
  const [endDate, setEndDate] = useState(rule?.end_date ?? '')

  function submit() {
    setError(null)
    const parsedAmount = sameAsLast ? null : parseAmount(amount)
    if (!sameAsLast && parsedAmount === null) {
      setError('Enter an amount, or use "same as last time".')
      return
    }

    const now = today()
    const year = Number(now.slice(0, 4))
    const month = Number(now.slice(5, 7))
    const nextRun = rule?.next_run ?? clampedDay(year, month, dayOfMonth)

    startTransition(async () => {
      const result = await saveRule({
        ...(rule ? { id: rule.id } : {}),
        name,
        categoryId: isTransfer ? null : categoryId || null,
        accountId,
        toAccountId: isTransfer ? toAccountId || null : null,
        amountCentavos: parsedAmount,
        direction: 'expense',
        frequency,
        intervalMonths,
        dayOfMonth,
        monthOfYear: frequency === 'yearly' ? Number(now.slice(5, 7)) : null,
        nextRun,
        endDate: endDate || null,
        isActive: true,
      })
      if (!result.ok) setError(result.error)
      else onSaved()
    })
  }

  return (
    <div className="mt-3 space-y-3 border-t border-rule pt-3">
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Electricity" />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isTransfer}
          className="size-4 accent-[#10182B]"
          onChange={(e) => setIsTransfer(e.target.checked)}
        />
        This is a transfer (BNPL installment, loan payment, moving to savings)
      </label>

      <div className="grid grid-cols-2 gap-3">
        <Field label={isTransfer ? 'From' : 'Account'}>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
        </Field>
        {isTransfer ? (
          <Field
            label="To"
            hint="A transfer rule has no category — the expense already happened at purchase."
          >
            <Select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
              <option value="">Choose…</option>
              {accounts
                .filter((a) => a.id !== accountId)
                .map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
            </Select>
          </Field>
        ) : (
          <Field label="Category">
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Choose…</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount">
          <Input
            className="figure"
            inputMode="decimal"
            disabled={sameAsLast}
            value={sameAsLast ? '' : amount}
            placeholder={sameAsLast ? 'same as last time' : '0.00'}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Day of month" hint="A 31st rule lands on the last day in a short month.">
          <Input
            className="figure"
            inputMode="numeric"
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(Number(e.target.value) || 1)}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={sameAsLast}
          className="size-4 accent-[#10182B]"
          onChange={(e) => setSameAsLast(e.target.checked)}
        />
        Same as last time (for bills that vary)
      </label>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Frequency">
          <Select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as Recurrence)}
          >
            <option value="monthly">Monthly</option>
            <option value="every_n_months">Every N months</option>
            <option value="yearly">Yearly</option>
          </Select>
        </Field>
        {frequency === 'every_n_months' ? (
          <Field label="Every N months">
            <Input
              className="figure"
              inputMode="numeric"
              value={intervalMonths}
              onChange={(e) => setIntervalMonths(Number(e.target.value) || 1)}
            />
          </Field>
        ) : (
          <Field label="Ends" hint="Installments have a known end date.">
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        )}
      </div>

      {error ? <p className="text-sm text-rose">{error}</p> : null}

      <Button variant="primary" disabled={pending || name.trim() === ''} onClick={submit}>
        {rule ? 'Save rule' : 'Add rule'}
      </Button>
    </div>
  )
}
