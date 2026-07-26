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
import { parseAmount } from '@/lib/money'
import { monthName } from '@/lib/dates'
import { deleteGoal, saveGoal, setNoSpendGoal } from '@/server/actions/savings'
import type { SavingsKind, SavingsProgress } from '@/lib/db/types'

interface Option {
  id: string
  name: string
}

export function GoalEditor({
  goals,
  categories,
  accounts,
  noSpendGoal,
  year,
  month,
}: {
  goals: SavingsProgress[]
  categories: Option[]
  accounts: Option[]
  noSpendGoal: number
  year: number
  month: number
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [days, setDays] = useState(String(noSpendGoal))

  const untaken = categories.filter((c) => !goals.some((g) => g.category_id === c.id))

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Goals" hint="Two types, with different maths" />
        <p className="border-b border-rule px-4 py-3 text-sm text-ink-45">
          A <strong className="font-medium text-ink">goal</strong> accumulates to a target and
          is then done — an emergency fund, a wedding. A{' '}
          <strong className="font-medium text-ink">sinking fund</strong> fills, gets spent, and
          refills — Christmas, yearly car expenses. A sinking fund at ₱0 in January is the
          cycle working, not a failure.
        </p>
        {goals.length === 0 ? (
          <EmptyState title="No goals yet">
            Tag one with a beneficiary and its balance appears on the dashboard, under
            safe-to-spend.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-rule">
            {goals.map((goal) => (
              <GoalRow key={goal.goal_id} goal={goal} accounts={accounts} />
            ))}
          </ul>
        )}
      </Card>

      {untaken.length > 0 ? (
        <NewGoal categories={untaken} accounts={accounts} />
      ) : (
        <Card>
          <CardHeader title="Add a goal" />
          <EmptyState title="Every savings category already has a goal">
            Add a category under the savings group first.
          </EmptyState>
        </Card>
      )}

      <Card>
        <CardHeader
          title="No-spend target"
          hint={`${monthName(month)} ${year}`}
        />
        <div className="flex flex-wrap items-end gap-2 p-4">
          <Field label="Days this month">
            <Input
              className="figure w-20"
              inputMode="numeric"
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          </Field>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await setNoSpendGoal(year, month, Number(days) || 0)
                router.refresh()
              })
            }
          >
            Save
          </Button>
          <Muted className="pb-2 text-xs">
            A day counts when nothing in the expenses group is logged. Bills landing on
            schedule don&rsquo;t break the streak.
          </Muted>
        </div>
      </Card>
    </div>
  )
}

function GoalRow({ goal, accounts }: { goal: SavingsProgress; accounts: Option[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [target, setTarget] = useState(
    goal.goal_amount_centavos ? (goal.goal_amount_centavos / 100).toFixed(2) : '',
  )
  const [monthly, setMonthly] = useState(
    goal.monthly_amount_centavos ? (goal.monthly_amount_centavos / 100).toFixed(2) : '',
  )
  const [beneficiary, setBeneficiary] = useState(goal.beneficiary ?? '')
  const [kind, setKind] = useState<SavingsKind>(goal.kind)
  const [accountId, setAccountId] = useState(goal.account_id ?? '')

  function save() {
    startTransition(async () => {
      await saveGoal({
        id: goal.goal_id,
        categoryId: goal.category_id,
        accountId: accountId || null,
        kind,
        goalAmountCentavos: target ? Math.abs(parseAmount(target) ?? 0) : null,
        startingAmountCentavos: 0,
        monthlyAmountCentavos: monthly ? Math.abs(parseAmount(monthly) ?? 0) : null,
        targetDate: goal.target_date,
        beneficiary: beneficiary || null,
      })
      router.refresh()
    })
  }

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex items-baseline gap-3">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {goal.category_name}
        </span>
        <span className="text-right">
          <Amount centavos={goal.saved_centavos} size="sm" tone="none" />
          {goal.percent_complete !== null ? (
            <Muted className="block text-xs">{goal.percent_complete}%</Muted>
          ) : null}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select
          aria-label="Type"
          className="w-32"
          value={kind}
          onChange={(e) => setKind(e.target.value as SavingsKind)}
        >
          <option value="goal">Goal</option>
          <option value="sinking">Sinking fund</option>
        </Select>
        <Input
          aria-label="Target"
          className="figure w-28"
          inputMode="decimal"
          placeholder="Target"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
        <Input
          aria-label="Monthly"
          className="figure w-28"
          inputMode="decimal"
          placeholder="Per month"
          value={monthly}
          onChange={(e) => setMonthly(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Select
          aria-label="Tracked account"
          className="w-44"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
        >
          <option value="">Track the category</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              Track {account.name}
            </option>
          ))}
        </Select>
        <Input
          aria-label="Beneficiary"
          className="w-32"
          placeholder="Beneficiary"
          value={beneficiary}
          onChange={(e) => setBeneficiary(e.target.value)}
        />
        <Button className="min-h-[2.25rem] px-3 text-xs" disabled={pending} onClick={save}>
          Save
        </Button>
        <Button
          variant="quiet"
          className="min-h-[2.25rem] px-3 text-xs"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await deleteGoal(goal.goal_id)
              router.refresh()
            })
          }
        >
          Remove
        </Button>
      </div>

      {goal.months_remaining !== null ? (
        <Muted className="block text-xs">
          About {goal.months_remaining} month{goal.months_remaining === 1 ? '' : 's'} to go at
          that rate.
        </Muted>
      ) : null}
    </li>
  )
}

function NewGoal({ categories, accounts }: { categories: Option[]; accounts: Option[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '')
  const [kind, setKind] = useState<SavingsKind>('goal')
  const [target, setTarget] = useState('')
  const [beneficiary, setBeneficiary] = useState('')
  const [accountId, setAccountId] = useState('')

  return (
    <Card>
      <CardHeader title="Add a goal" />
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap gap-2">
          <Select
            aria-label="Category"
            className="min-w-[9rem] flex-1"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Type"
            className="w-32"
            value={kind}
            onChange={(e) => setKind(e.target.value as SavingsKind)}
          >
            <option value="goal">Goal</option>
            <option value="sinking">Sinking fund</option>
          </Select>
          <Input
            aria-label="Target"
            className="figure w-28"
            inputMode="decimal"
            placeholder="Target"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Select
            aria-label="Tracked account"
            className="w-44"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="">Track the category</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                Track {account.name}
              </option>
            ))}
          </Select>
          <Input
            aria-label="Beneficiary"
            className="w-32"
            placeholder="e.g. 2AK"
            value={beneficiary}
            onChange={(e) => setBeneficiary(e.target.value)}
          />
          <Button
            variant="primary"
            disabled={pending || !categoryId}
            onClick={() =>
              startTransition(async () => {
                await saveGoal({
                  categoryId,
                  accountId: accountId || null,
                  kind,
                  goalAmountCentavos: target ? Math.abs(parseAmount(target) ?? 0) : null,
                  startingAmountCentavos: 0,
                  monthlyAmountCentavos: null,
                  targetDate: null,
                  beneficiary: beneficiary || null,
                })
                setTarget('')
                setBeneficiary('')
                router.refresh()
              })
            }
          >
            Add
          </Button>
        </div>

        <Muted className="block text-xs">
          Tag a goal <span className="figure">2AK</span> and its balance — with the change
          this month — appears on the dashboard, directly under safe-to-spend.
        </Muted>
      </div>
    </Card>
  )
}
