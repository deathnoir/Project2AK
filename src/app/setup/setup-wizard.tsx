'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Muted,
  Select,
} from '@/components/ui/primitives'
import { formatCentavos } from '@/lib/money'
import type { Account, AccountType, Category, TrackingMode } from '@/lib/db/types'
import { completeSetup, saveAccounts, saveCategories, savePaydayConfig } from '@/server/actions/setup'
import { cn } from '@/lib/cn'

interface AccountDraft {
  id?: string
  name: string
  type: AccountType
  openingBalance: string
  apr: string
  dueDay: string
  creditLimit: string
  trackingMode: TrackingMode
}

const LIABILITY_TYPES: readonly AccountType[] = ['credit', 'loan']

/** Realistic PH starting points, so step one is editing rather than inventing. */
const SEED_HAVE: AccountDraft[] = [
  draft('BPI Savings', 'bank'),
  draft('GCash', 'ewallet'),
  draft('Cash on hand', 'cash'),
  draft('Seabank', 'bank'),
]
const SEED_OWE: AccountDraft[] = [draft('BillEase', 'credit'), draft('Atome', 'credit')]

function draft(name: string, type: AccountType): AccountDraft {
  return {
    name,
    type,
    openingBalance: '',
    apr: '',
    dueDay: '',
    creditLimit: '',
    trackingMode: 'itemized',
  }
}

function fromAccount(account: Account): AccountDraft {
  return {
    id: account.id,
    name: account.name,
    type: account.type,
    // Liabilities are stored negative; the wizard shows the magnitude,
    // because nobody thinks of what they owe as a negative number.
    openingBalance: (Math.abs(account.opening_balance_centavos) / 100).toString(),
    apr: account.apr?.toString() ?? '',
    dueDay: account.due_day?.toString() ?? '',
    creditLimit: account.credit_limit_centavos
      ? (Math.abs(account.credit_limit_centavos) / 100).toString()
      : '',
    trackingMode: account.tracking_mode,
  }
}

const STEPS = ['Where money sits', 'What you spend it on', 'When you get paid'] as const

export function SetupWizard({
  categories,
  existingAccounts,
  paydayDays,
  activeYear,
}: {
  categories: Category[]
  existingAccounts: Account[]
  paydayDays: number[]
  activeYear: number
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const seededHave = existingAccounts.filter((a) => !LIABILITY_TYPES.includes(a.type))
  const seededOwe = existingAccounts.filter((a) => LIABILITY_TYPES.includes(a.type))

  const [have, setHave] = useState<AccountDraft[]>(
    seededHave.length ? seededHave.map(fromAccount) : SEED_HAVE,
  )
  const [owe, setOwe] = useState<AccountDraft[]>(
    seededOwe.length ? seededOwe.map(fromAccount) : SEED_OWE,
  )

  const [cats, setCats] = useState(
    categories.map((c) => ({
      id: c.id,
      name: c.name,
      group: c.group,
      dueDay: c.due_day?.toString() ?? '',
      rolloverEnabled: c.rollover_enabled,
      isArchived: c.is_archived,
    })),
  )

  const [days, setDays] = useState<number[]>(paydayDays)
  const [year, setYear] = useState(activeYear)

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk: () => void) {
    setError(null)
    startTransition(async () => {
      const result = await fn()
      if (!result.ok) setError(result.error ?? 'Something went wrong')
      else onOk()
    })
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 md:px-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Set up Project2AK</h1>
        <ol className="mt-3 flex gap-2 text-xs">
          {STEPS.map((label, index) => (
            <li
              key={label}
              className={cn(
                'flex-1 border-t-2 pt-2',
                index === step
                  ? 'border-ink font-medium text-ink'
                  : index < step
                    ? 'border-ink-45 text-ink-45'
                    : 'border-rule text-ink-25',
              )}
            >
              {label}
            </li>
          ))}
        </ol>
      </header>

      {error ? (
        <p className="mb-4 rounded-[6px] border border-rose/35 bg-rose-soft px-3 py-2 text-sm text-rose">
          {error}
        </p>
      ) : null}

      {step === 0 ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-45">
            Declare every place a running balance lives — not just the money you own.
            Balances are worked out from what you log after this; nothing here is ever typed
            again.
          </p>
          <AccountList
            title="Money I have"
            hint="Bank, e-wallet, cash"
            drafts={have}
            onChange={setHave}
            defaultType="bank"
          />
          <AccountList
            title="Money I owe"
            hint="Credit lines, BNPL, loans"
            drafts={owe}
            onChange={setOwe}
            defaultType="credit"
            liability
          />
          <p className="text-xs text-ink-45">
            Opening balances are as of today. There&rsquo;s no back-history to reconcile
            against, and last year&rsquo;s numbers are already in the spreadsheet if you ever
            need them.
          </p>
          <div className="flex justify-end">
            <Button
              variant="primary"
              disabled={pending}
              onClick={() =>
                run(
                  () => saveAccounts([...have, ...owe].filter((a) => a.name.trim() !== '')),
                  () => setStep(1),
                )
              }
            >
              Continue
            </Button>
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-45">
            These are already set up. Rename what doesn&rsquo;t fit, set a due day for the
            bills, and archive anything you don&rsquo;t need — you can change all of it later.
          </p>
          <Card>
            <CardHeader title="Categories" hint={`${cats.filter((c) => !c.isArchived).length} active`} />
            <ul className="divide-y divide-rule">
              {cats.map((category, index) => (
                <li key={category.id} className="flex items-center gap-2 px-3 py-2">
                  <Input
                    aria-label="Category name"
                    value={category.name}
                    className={cn('flex-1', category.isArchived && 'text-ink-25 line-through')}
                    onChange={(e) => {
                      const next = [...cats]
                      const row = next[index]
                      if (row) next[index] = { ...row, name: e.target.value }
                      setCats(next)
                    }}
                  />
                  <Input
                    aria-label="Due day"
                    className="w-16 text-center"
                    inputMode="numeric"
                    placeholder="Due"
                    value={category.dueDay}
                    onChange={(e) => {
                      const next = [...cats]
                      const row = next[index]
                      if (row) next[index] = { ...row, dueDay: e.target.value }
                      setCats(next)
                    }}
                  />
                  <Button
                    variant="quiet"
                    className="min-h-0 px-2 py-1 text-xs"
                    onClick={() => {
                      const next = [...cats]
                      const row = next[index]
                      if (row) next[index] = { ...row, isArchived: !row.isArchived }
                      setCats(next)
                    }}
                  >
                    {category.isArchived ? 'Restore' : 'Archive'}
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
          <div className="flex justify-between">
            <Button onClick={() => setStep(0)}>Back</Button>
            <Button
              variant="primary"
              disabled={pending}
              onClick={() => run(() => saveCategories(cats), () => setStep(2))}
            >
              Continue
            </Button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          <Card>
            <CardHeader title="Payday" hint="Used to project what's safe to spend" />
            <div className="space-y-4 p-4">
              <Field
                label="Days of the month you get paid"
                hint="Semi-monthly on the 15th and 30th is the usual PH pattern. A 30th or 31st lands on the last day in a short month."
              >
                <div className="flex flex-wrap gap-1.5">
                  {[5, 10, 15, 20, 25, 30, 31].map((day) => (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={days.includes(day)}
                      onClick={() =>
                        setDays((current) =>
                          current.includes(day)
                            ? current.filter((d) => d !== day)
                            : [...current, day].sort((a, b) => a - b),
                        )
                      }
                      className={cn(
                        'figure min-h-[2.5rem] w-12 rounded-[6px] border text-sm',
                        days.includes(day)
                          ? 'border-ink bg-ink text-paper'
                          : 'border-rule-strong bg-paper text-ink-70',
                      )}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Active year" hint="The year every screen filters to by default.">
                <Input
                  inputMode="numeric"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value) || year)}
                  className="w-28 figure"
                />
              </Field>
            </div>
          </Card>
          <div className="flex justify-between">
            <Button onClick={() => setStep(1)}>Back</Button>
            <Button
              variant="primary"
              disabled={pending || days.length === 0}
              onClick={() =>
                run(
                  async () => {
                    const saved = await savePaydayConfig({ paydayDays: days, activeYear: year })
                    if (!saved.ok) return saved
                    return completeSetup()
                  },
                  () => router.push('/'),
                )
              }
            >
              Finish
            </Button>
          </div>
        </div>
      ) : null}
    </main>
  )
}

function AccountList({
  title,
  hint,
  drafts,
  onChange,
  defaultType,
  liability = false,
}: {
  title: string
  hint: string
  drafts: AccountDraft[]
  onChange: (next: AccountDraft[]) => void
  defaultType: AccountType
  liability?: boolean
}) {
  function update(index: number, patch: Partial<AccountDraft>) {
    const next = [...drafts]
    const row = next[index]
    if (!row) return
    next[index] = { ...row, ...patch }
    onChange(next)
  }

  const total = drafts.reduce((sum, d) => {
    const value = Number(d.openingBalance.replace(/[^\d.]/g, '')) || 0
    return sum + Math.round(value * 100)
  }, 0)

  return (
    <Card>
      <CardHeader
        title={title}
        hint={hint}
        action={
          <span className="figure text-sm text-ink-45">
            {formatCentavos(liability ? -total : total)}
          </span>
        }
      />
      <ul className="divide-y divide-rule">
        {drafts.map((account, index) => (
          <li key={index} className="space-y-2 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <Input
                aria-label="Name"
                className="flex-1"
                value={account.name}
                placeholder="Name"
                onChange={(e) => update(index, { name: e.target.value })}
              />
              <Select
                aria-label="Type"
                className="w-28"
                value={account.type}
                onChange={(e) => update(index, { type: e.target.value as AccountType })}
              >
                {(liability
                  ? (['credit', 'loan'] as const)
                  : (['bank', 'ewallet', 'cash'] as const)
                ).map((type) => (
                  <option key={type} value={type}>
                    {type === 'ewallet' ? 'e-wallet' : type}
                  </option>
                ))}
              </Select>
              <Input
                aria-label={liability ? 'Amount owed' : 'Opening balance'}
                className="figure w-28"
                inputMode="decimal"
                placeholder="0.00"
                value={account.openingBalance}
                onChange={(e) => update(index, { openingBalance: e.target.value })}
              />
              <Button
                variant="quiet"
                aria-label={`Remove ${account.name || 'row'}`}
                className="min-h-0 px-2 py-1"
                onClick={() => onChange(drafts.filter((_, i) => i !== index))}
              >
                ✕
              </Button>
            </div>
            {liability ? (
              <div className="flex flex-wrap items-center gap-2 pl-1">
                <Input
                  aria-label="APR"
                  className="figure w-20"
                  inputMode="decimal"
                  placeholder="APR %"
                  value={account.apr}
                  onChange={(e) => update(index, { apr: e.target.value })}
                />
                <Input
                  aria-label="Due day"
                  className="figure w-20"
                  inputMode="numeric"
                  placeholder="Due day"
                  value={account.dueDay}
                  onChange={(e) => update(index, { dueDay: e.target.value })}
                />
                <Input
                  aria-label="Credit limit"
                  className="figure w-28"
                  inputMode="decimal"
                  placeholder="Limit"
                  value={account.creditLimit}
                  onChange={(e) => update(index, { creditLimit: e.target.value })}
                />
                <Select
                  aria-label="Tracking mode"
                  className="w-36"
                  value={account.trackingMode}
                  onChange={(e) => update(index, { trackingMode: e.target.value as TrackingMode })}
                >
                  <option value="itemized">Itemize purchases</option>
                  <option value="statement_only">Statement only</option>
                </Select>
                <Muted className="text-xs">
                  Statement only suits a mortgage or personal loan you don&rsquo;t itemize.
                </Muted>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="border-t border-rule px-3 py-2">
        <Button
          variant="quiet"
          className="px-2"
          onClick={() => onChange([...drafts, draft('', defaultType)])}
        >
          + Add another
        </Button>
      </div>
    </Card>
  )
}
