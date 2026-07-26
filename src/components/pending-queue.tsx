'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Amount } from '@/components/ui/amount'
import { Button, Card, CardHeader, EmptyState, Input } from '@/components/ui/primitives'
import { formatDate } from '@/lib/dates'
import { parseAmount } from '@/lib/money'
import { confirmPending, editAndConfirmPending, skipPending } from '@/server/actions/recurring'

export interface PendingRow {
  id: string
  kind: 'transaction' | 'transfer'
  date: string
  detail: string
  amountCentavos: number
  accountName: string
  toAccountName?: string
  categoryName?: string
}

/**
 * The confirmation queue.
 *
 * A recurring rule generates a pending row on its due date; it never posts on
 * its own. An unconfirmed bill that silently posted is worse than one that
 * didn't — the first quietly corrupts a balance, the second just needs a tap.
 */
export function PendingQueue({ rows }: { rows: PendingRow[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draftAmount, setDraftAmount] = useState('')
  const [draftDate, setDraftDate] = useState('')

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader title="To confirm" />
        <EmptyState title="Nothing waiting" >
          Recurring bills show up here on their due date for you to confirm.
        </EmptyState>
      </Card>
    )
  }

  function act(row: PendingRow, action: 'confirm' | 'skip') {
    setBusy(row.id)
    startTransition(async () => {
      if (action === 'confirm') await confirmPending(row.id, row.kind)
      else await skipPending(row.id, row.kind)
      setBusy(null)
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader
        title="To confirm"
        hint={`${rows.length} generated bill${rows.length === 1 ? '' : 's'} waiting`}
      />
      <ul className="divide-y divide-rule">
        {rows.map((row) => (
          <li key={row.id} className="px-4 py-3">
            <div className="flex items-baseline gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{row.detail}</p>
                <p className="truncate text-xs text-ink-45">
                  {formatDate(row.date)} ·{' '}
                  {row.kind === 'transfer'
                    ? `${row.accountName} → ${row.toAccountName ?? '—'}`
                    : `${row.categoryName ?? 'Uncategorised'} · ${row.accountName}`}
                </p>
              </div>
              <Amount centavos={row.amountCentavos} size="sm" tone="expense" />
            </div>
            <div className="mt-2 flex gap-2">
              <Button
                variant="primary"
                className="min-h-[2.25rem] flex-1 px-3 text-xs"
                disabled={pending && busy === row.id}
                onClick={() => act(row, 'confirm')}
              >
                Confirm
              </Button>
              <Button
                className="min-h-[2.25rem] px-3 text-xs"
                disabled={pending && busy === row.id}
                onClick={() => {
                  if (editing === row.id) {
                    setEditing(null)
                    return
                  }
                  // A "same as last time" bill lands with last month's figure;
                  // editing before confirming is the normal case, not an edge.
                  setEditing(row.id)
                  setDraftAmount((Math.abs(row.amountCentavos) / 100).toFixed(2))
                  setDraftDate(row.date)
                }}
              >
                {editing === row.id ? 'Cancel' : 'Edit'}
              </Button>
              <Button
                className="min-h-[2.25rem] px-3 text-xs"
                disabled={pending && busy === row.id}
                onClick={() => act(row, 'skip')}
              >
                Skip
              </Button>
            </div>

            {editing === row.id ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-rule pt-2">
                <Input
                  aria-label="Amount"
                  className="figure w-28"
                  inputMode="decimal"
                  value={draftAmount}
                  onChange={(e) => setDraftAmount(e.target.value)}
                />
                <Input
                  aria-label="Date"
                  type="date"
                  className="w-40"
                  value={draftDate}
                  onChange={(e) => setDraftDate(e.target.value)}
                />
                <Button
                  variant="primary"
                  className="min-h-[2.25rem] px-3 text-xs"
                  disabled={pending}
                  onClick={() => {
                    const amount = parseAmount(draftAmount)
                    if (amount === null) return
                    setBusy(row.id)
                    startTransition(async () => {
                      await editAndConfirmPending({
                        id: row.id,
                        kind: row.kind,
                        // Preserve the direction: correcting a figure must
                        // never flip an expense into income.
                        amountCentavos:
                          row.amountCentavos < 0 ? -Math.abs(amount) : Math.abs(amount),
                        date: draftDate,
                      })
                      setEditing(null)
                      setBusy(null)
                      router.refresh()
                    })
                  }}
                >
                  Save and confirm
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  )
}
