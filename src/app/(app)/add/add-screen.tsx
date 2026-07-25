'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { AmountPad, digitsToCentavos } from './amount-pad'
import { MerchantInput } from './merchant-input'
import { Capture } from './capture'
import { Button, Field, Input, Select } from '@/components/ui/primitives'
import { formatDate, today } from '@/lib/dates'
import { createTransaction, createTransfer } from '@/server/actions/transactions'
import type { AccountBalance, Category } from '@/lib/db/types'
import { cn } from '@/lib/cn'

type Mode = 'expense' | 'income' | 'transfer'

const MODES: Array<{ id: Mode; label: string }> = [
  { id: 'expense', label: 'Expense' },
  { id: 'income', label: 'Income' },
  { id: 'transfer', label: 'Transfer' },
]

export function AddScreen({
  accounts,
  categories,
  defaultAccountId,
  extractionAvailable,
}: {
  accounts: AccountBalance[]
  categories: Category[]
  defaultAccountId: string | null
  extractionAvailable: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [mode, setMode] = useState<Mode>('expense')
  const [digits, setDigits] = useState('')
  const [detail, setDetail] = useState('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [accountId, setAccountId] = useState(defaultAccountId ?? accounts[0]?.account_id ?? '')
  const [toAccountId, setToAccountId] = useState('')
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [duplicate, setDuplicate] = useState<{ id: string; date: string } | null>(null)

  const centavos = digitsToCentavos(digits)
  const liquid = accounts.filter((a) => a.is_liquid)
  const liabilities = accounts.filter((a) => a.is_liability)

  // A transfer has no category — it is neither income nor expense. Paying a
  // BNPL installment settles what you already owe; the expense happened at
  // purchase, when the liability was recognised.
  const relevantCategories = categories.filter((c) =>
    mode === 'income' ? c.group === 'income' : c.group !== 'income',
  )

  function reset() {
    setDigits('')
    setDetail('')
    setNote('')
    setDuplicate(null)
  }

  function submit() {
    setError(null)
    setDuplicate(null)

    if (centavos <= 0) {
      setError('Enter an amount')
      return
    }

    startTransition(async () => {
      const result =
        mode === 'transfer'
          ? await createTransfer({
              date,
              amountCentavos: centavos,
              fromAccountId: accountId,
              toAccountId,
              note: note || null,
            })
          : await createTransaction({
              date,
              detail,
              amountCentavos: centavos,
              direction: mode,
              categoryId: categoryId || null,
              accountId,
              note: note || null,
            })

      if (result.ok) {
        reset()
        router.refresh()
        return
      }
      if ('duplicate' in result && result.duplicate) {
        setDuplicate({ id: result.existingId, date: result.existingDate })
        return
      }
      setError(result.error)
    })
  }

  const canSubmit =
    centavos > 0 && accountId !== '' && (mode !== 'transfer' || toAccountId !== '')

  return (
    <div className="space-y-5">
      <Capture extractionAvailable={extractionAvailable} />

      <div
        role="tablist"
        aria-label="Entry type"
        className="grid grid-cols-3 rounded-[6px] border border-rule p-0.5"
      >
        {MODES.map((option) => (
          <button
            key={option.id}
            role="tab"
            aria-selected={mode === option.id}
            type="button"
            onClick={() => {
              setMode(option.id)
              setCategoryId('')
            }}
            className={cn(
              'min-h-[2.25rem] rounded-[4px] text-sm transition-colors',
              mode === option.id ? 'bg-ink font-medium text-paper' : 'text-ink-45',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <AmountPad digits={digits} onChange={setDigits} sign={mode} />

      <div className="space-y-3">
        {mode !== 'transfer' ? (
          <>
            <Field label="Detail">
              <MerchantInput
                value={detail}
                onChange={setDetail}
                onCategoryInferred={(id) => {
                  // Only fill an empty picker — never overwrite a choice the
                  // user just made by hand.
                  setCategoryId((current) => current || id)
                }}
              />
            </Field>

            <Field label="Category">
              <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Uncategorised</option>
                {relevantCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        ) : null}

        <Field label={mode === 'transfer' ? 'From' : 'Account'}>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <optgroup label="Money I have">
              {liquid.map((account) => (
                <option key={account.account_id} value={account.account_id}>
                  {account.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Money I owe">
              {liabilities.map((account) => (
                <option key={account.account_id} value={account.account_id}>
                  {account.name}
                </option>
              ))}
            </optgroup>
          </Select>
        </Field>

        {mode === 'transfer' ? (
          <Field
            label="To"
            hint="A transfer is neither income nor expense. Paying an installment settles what you already owe."
          >
            <Select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
              <option value="">Choose…</option>
              <optgroup label="Money I have">
                {liquid
                  .filter((a) => a.account_id !== accountId)
                  .map((account) => (
                    <option key={account.account_id} value={account.account_id}>
                      {account.name}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Money I owe">
                {liabilities
                  .filter((a) => a.account_id !== accountId)
                  .map((account) => (
                    <option key={account.account_id} value={account.account_id}>
                      {account.name}
                    </option>
                  ))}
              </optgroup>
            </Select>
          </Field>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Note">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </Field>
        </div>
      </div>

      {duplicate ? (
        <p className="rounded-[6px] border border-rule bg-paper-sunk px-3 py-2 text-sm">
          Already logged on {formatDate(duplicate.date)}.{' '}
          <Link href={`/transactions?highlight=${duplicate.id}`} className="underline">
            Open it
          </Link>
          .
        </p>
      ) : null}

      {error ? (
        <p className="rounded-[6px] border border-rose/35 bg-rose-soft px-3 py-2 text-sm text-rose">
          {error}
        </p>
      ) : null}

      <div className="sticky bottom-[4.5rem] -mx-4 border-t border-rule bg-paper/95 px-4 py-3 backdrop-blur md:bottom-0">
        <Button
          variant="primary"
          className="w-full"
          disabled={!canSubmit || pending}
          onClick={submit}
        >
          {pending ? 'Saving…' : mode === 'transfer' ? 'Record transfer' : 'Log it'}
        </Button>
      </div>
    </div>
  )
}
