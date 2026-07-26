'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Amount } from '@/components/ui/amount'
import { Button, Card, CardHeader, EmptyState } from '@/components/ui/primitives'
import { formatDate } from '@/lib/dates'
import { confirmPending, skipPending } from '@/server/actions/recurring'

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
                onClick={() => act(row, 'skip')}
              >
                Skip
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
