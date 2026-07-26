'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Amount } from '@/components/ui/amount'
import { Button, Input, Muted } from '@/components/ui/primitives'
import { parseAmount } from '@/lib/money'
import { formatDate } from '@/lib/dates'
import {
  bookReconciliationAdjustment,
  recordReconciliation,
} from '@/server/actions/settings'
import type { Reconciliation } from '@/lib/db/types'

export function ReconcileForm({ rows }: { rows: Reconciliation[] }) {
  return (
    <ul className="divide-y divide-rule">
      {rows.map((row) => (
        <AccountRow key={row.account_id} row={row} />
      ))}
    </ul>
  )
}

function AccountRow({ row }: { row: Reconciliation }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [value, setValue] = useState('')

  const delta = row.delta_centavos

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex items-baseline gap-3">
        <span className="min-w-0 flex-1 truncate text-sm">{row.name}</span>
        <span className="text-right">
          <Amount centavos={row.derived_centavos} size="sm" />
          <Muted className="block text-xs">derived</Muted>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label={`Statement balance for ${row.name}`}
          className="figure w-36"
          inputMode="decimal"
          placeholder={row.is_liability ? 'Statement owed' : 'Statement balance'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button
          className="min-h-[2.25rem] px-3 text-xs"
          disabled={pending}
          onClick={() => {
            const amount = parseAmount(value)
            if (amount === null) return
            startTransition(async () => {
              // A liability's statement balance is stored negative, matching
              // its derived balance, so the delta compares like with like.
              await recordReconciliation(
                row.account_id,
                row.is_liability ? -Math.abs(amount) : amount,
              )
              setValue('')
              router.refresh()
            })
          }}
        >
          Record
        </Button>

        {row.statement_month ? (
          <Muted className="text-xs">last {formatDate(row.statement_month)}</Muted>
        ) : null}
      </div>

      {delta !== null && delta !== 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-ink-45">
            Off by <Amount centavos={delta} size="xs" tone="auto" />
          </span>
          <Button
            className="min-h-[2rem] px-2 text-xs"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await bookReconciliationAdjustment(row.account_id, delta)
                router.refresh()
              })
            }
          >
            {row.is_liability ? 'Book to Finance Charges' : 'Book an adjustment'}
          </Button>
        </div>
      ) : delta === 0 ? (
        <p className="text-xs text-jade">Matches the statement.</p>
      ) : null}
    </li>
  )
}
