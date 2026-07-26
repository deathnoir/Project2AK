'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Amount } from '@/components/ui/amount'
import {
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Muted,
  Select,
} from '@/components/ui/primitives'
import { formatDate, today } from '@/lib/dates'
import { parseAmount } from '@/lib/money'
import { isHighConfidence, needsManualFallback, type Extraction } from '@/lib/extraction/schema'
import { commitReceipt, runExtraction } from '@/server/actions/receipts'
import type { AccountBalance, ReceiptStatus } from '@/lib/db/types'
import { cn } from '@/lib/cn'

interface Draft {
  date: string
  detail: string
  amount: string
  direction: 'expense' | 'income'
  categoryId: string
  accountId: string
  referenceNo: string
  fee: string
  confident: boolean
}

export function ReviewForm({
  receiptId,
  status,
  errorMessage,
  imageUrl,
  extraction,
  accounts,
  categories,
  queue,
  duplicateOf,
}: {
  receiptId: string
  status: ReceiptStatus
  errorMessage: string | null
  imageUrl: string | null
  extraction: Extraction | null
  accounts: AccountBalance[]
  categories: Array<{ id: string; name: string; group: string }>
  queue: string[]
  duplicateOf: { id: string; date: string } | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [duplicate, setDuplicate] = useState(duplicateOf)

  const defaultAccountId = accounts[0]?.account_id ?? ''

  const [drafts, setDrafts] = useState<Draft[]>(() =>
    (extraction?.transactions ?? []).map((t) => ({
      date: t.date,
      detail: t.merchant ?? '',
      amount: (Math.abs(t.amount_centavos) / 100).toFixed(2),
      direction:
        t.type === 'refund' || t.type === 'cash_in' || t.type === 'transfer_in'
          ? ('income' as const)
          : ('expense' as const),
      categoryId: '',
      // Match the model's hint against the user's own account names, so a
      // "GCash" receipt lands on the GCash account without being asked.
      accountId:
        accounts.find((a) =>
          t.source_account_hint
            ? a.name.toLowerCase().includes(t.source_account_hint.toLowerCase()) ||
              t.source_account_hint.toLowerCase().includes(a.name.toLowerCase())
            : false,
        )?.account_id ?? defaultAccountId,
      referenceNo: t.reference_no ?? '',
      fee: t.fee_centavos ? (t.fee_centavos / 100).toFixed(2) : '',
      confident: isHighConfidence(t) && !needsManualFallback(t),
    })),
  )

  const failed = status === 'failed' || extraction === null || drafts.length === 0
  const allConfident = drafts.length > 0 && drafts.every((d) => d.confident)

  function update(index: number, patch: Partial<Draft>) {
    setDrafts((current) => {
      const next = [...current]
      const row = next[index]
      if (!row) return current
      next[index] = { ...row, ...patch }
      return next
    })
  }

  function commit() {
    setError(null)
    const rows = drafts.map((draft) => {
      const amount = parseAmount(draft.amount)
      const fee = draft.fee ? parseAmount(draft.fee) : null
      return {
        date: draft.date,
        detail: draft.detail,
        amountCentavos: Math.abs(amount ?? 0),
        direction: draft.direction,
        categoryId: draft.categoryId || null,
        accountId: draft.accountId,
        referenceNo: draft.referenceNo || null,
        feeCentavos: fee ? Math.abs(fee) : null,
      }
    })

    if (rows.some((r) => r.amountCentavos <= 0)) {
      setError('Every row needs an amount.')
      return
    }

    startTransition(async () => {
      const result = await commitReceipt({ receiptId, rows })
      if (result.ok) {
        const next = queue[0]
        if (next) {
          const rest = queue.slice(1)
          router.push(`/add/review/${next}${rest.length ? `?queue=${rest.join(',')}` : ''}`)
        } else {
          router.push('/transactions')
        }
        return
      }
      if ('duplicate' in result) {
        setDuplicate({ id: result.existingId, date: result.existingDate })
        return
      }
      setError(result.error)
    })
  }

  return (
    <div className="space-y-4">
      {imageUrl ? (
        <Card>
          <CardHeader
            title="Receipt"
            hint="Kept permanently and linked — it's the audit trail"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="The receipt being reviewed"
            className="max-h-80 w-full bg-paper-sunk object-contain"
          />
        </Card>
      ) : null}

      {duplicate ? (
        <Card className="border-rule-strong">
          <div className="p-4">
            <p className="text-sm font-medium">Already logged on {formatDate(duplicate.date)}</p>
            <p className="mt-1 text-sm text-ink-45">
              This receipt&rsquo;s reference number matches a transaction already in the log.
              Nothing was added.
            </p>
            <Link
              href={`/transactions?highlight=${duplicate.id}`}
              className="mt-3 inline-block text-sm underline"
            >
              Open the existing transaction
            </Link>
          </div>
        </Card>
      ) : null}

      {failed ? (
        <Card>
          <CardHeader title="Enter it by hand" hint="The image is saved and attached" />
          <div className="space-y-3 p-4">
            <p className="text-sm text-ink-45">
              {errorMessage ??
                'Nothing readable came back from the receipt.'}{' '}
              Type the details below — the image stays linked to whatever you log.
            </p>
            <ManualRow
              accounts={accounts}
              categories={categories}
              onAdd={(draft) => setDrafts([draft])}
            />
            <Button
              variant="quiet"
              className="px-0"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await runExtraction(receiptId)
                  router.refresh()
                })
              }
            >
              Try reading it again
            </Button>
          </div>
        </Card>
      ) : null}

      {drafts.map((draft, index) => (
        <Card key={index}>
          <CardHeader
            title={drafts.length > 1 ? `Row ${index + 1} of ${drafts.length}` : 'Draft'}
            hint={draft.confident ? 'Read clearly — check and confirm' : 'Low confidence — check every field'}
            action={
              <Amount
                centavos={
                  (draft.direction === 'expense' ? -1 : 1) *
                  Math.abs(parseAmount(draft.amount) ?? 0)
                }
                size="sm"
              />
            }
          />
          <div className={cn('space-y-3 p-4', !draft.confident && 'bg-rose-soft/40')}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount">
                <Input
                  className="figure"
                  inputMode="decimal"
                  value={draft.amount}
                  onChange={(e) => update(index, { amount: e.target.value })}
                />
              </Field>
              <Field label="Date">
                <Input
                  type="date"
                  value={draft.date}
                  onChange={(e) => update(index, { date: e.target.value })}
                />
              </Field>
            </div>

            <Field label="Merchant">
              <Input
                value={draft.detail}
                onChange={(e) => update(index, { detail: e.target.value })}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <Select
                  value={draft.categoryId}
                  onChange={(e) => update(index, { categoryId: e.target.value })}
                >
                  <option value="">Uncategorised</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Account">
                <Select
                  value={draft.accountId}
                  onChange={(e) => update(index, { accountId: e.target.value })}
                >
                  {accounts.map((account) => (
                    <option key={account.account_id} value={account.account_id}>
                      {account.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Fee"
                hint="Logged as a linked row under Bank Fees, so the merchant total stays clean."
              >
                <Input
                  className="figure"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={draft.fee}
                  onChange={(e) => update(index, { fee: e.target.value })}
                />
              </Field>
              <Field label="Reference" hint="What stops this being logged twice.">
                <Input
                  className="figure"
                  value={draft.referenceNo}
                  onChange={(e) => update(index, { referenceNo: e.target.value })}
                />
              </Field>
            </div>
          </div>
        </Card>
      ))}

      {error ? (
        <p className="rounded-[6px] border border-rose/35 bg-rose-soft px-3 py-2 text-sm text-rose">
          {error}
        </p>
      ) : null}

      {drafts.length > 0 ? (
        <div className="sticky bottom-[4.5rem] -mx-4 space-y-2 border-t border-rule bg-paper/95 px-4 py-3 backdrop-blur md:bottom-0">
          <Button variant="primary" className="w-full" disabled={pending} onClick={commit}>
            {pending
              ? 'Saving…'
              : allConfident && drafts.length === 1
                ? 'Confirm'
                : `Log ${drafts.length} row${drafts.length === 1 ? '' : 's'}`}
          </Button>
          {queue.length > 0 ? (
            <Muted className="block text-center text-xs">
              {queue.length} more receipt{queue.length === 1 ? '' : 's'} after this one
            </Muted>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function ManualRow({
  accounts,
  categories,
  onAdd,
}: {
  accounts: AccountBalance[]
  categories: Array<{ id: string; name: string }>
  onAdd: (draft: Draft) => void
}) {
  return (
    <Button
      onClick={() =>
        onAdd({
          date: today(),
          detail: '',
          amount: '',
          direction: 'expense',
          categoryId: categories[0]?.id ?? '',
          accountId: accounts[0]?.account_id ?? '',
          referenceNo: '',
          fee: '',
          confident: false,
        })
      }
    >
      Enter the details
    </Button>
  )
}
