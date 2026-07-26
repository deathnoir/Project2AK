'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Amount } from '@/components/ui/amount'
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  Muted,
  Select,
} from '@/components/ui/primitives'
import { parseAmount } from '@/lib/money'
import { archiveAccount, createAccount, updateAccount } from '@/server/actions/settings'
import type { AccountBalance, AccountType, TrackingMode } from '@/lib/db/types'

export function AccountEditor({ accounts }: { accounts: AccountBalance[] }) {
  const have = accounts.filter((a) => a.is_liquid)
  const owe = accounts.filter((a) => a.is_liability)

  return (
    <div className="space-y-4">
      <Section title="Money I have" hint="Bank, e-wallet, cash" accounts={have} />
      <Section title="Money I owe" hint="Credit lines, BNPL, loans" accounts={owe} liability />
      <AddAccount />
    </div>
  )
}

function Section({
  title,
  hint,
  accounts,
  liability = false,
}: {
  title: string
  hint: string
  accounts: AccountBalance[]
  liability?: boolean
}) {
  return (
    <Card>
      <CardHeader title={title} hint={hint} />
      {accounts.length === 0 ? (
        <EmptyState title="Nothing here yet" />
      ) : (
        <ul className="divide-y divide-rule">
          {accounts.map((account) => (
            <AccountRow key={account.account_id} account={account} liability={liability} />
          ))}
        </ul>
      )}
    </Card>
  )
}

function AccountRow({
  account,
  liability,
}: {
  account: AccountBalance
  liability: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState(account.name)
  const [opening, setOpening] = useState(
    (Math.abs(account.opening_balance_centavos) / 100).toFixed(2),
  )
  const [apr, setApr] = useState(account.apr?.toString() ?? '')
  const [dueDay, setDueDay] = useState(account.due_day?.toString() ?? '')
  const [mode, setMode] = useState<TrackingMode>(account.tracking_mode)

  function save() {
    const openingValue = parseAmount(opening)
    startTransition(async () => {
      await updateAccount({
        id: account.account_id,
        name,
        ...(openingValue !== null
          ? {
              // A liability's opening balance is stored negative; the field
              // shows the magnitude because nobody thinks of what they owe as
              // a negative number.
              openingBalanceCentavos: liability
                ? -Math.abs(openingValue)
                : openingValue,
            }
          : {}),
        ...(liability
          ? {
              apr: apr ? Number(apr) : null,
              dueDay: dueDay ? Number(dueDay) : null,
              trackingMode: mode,
            }
          : {}),
      })
      router.refresh()
    })
  }

  return (
    <li className="space-y-2 px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Name"
          className="min-w-[8rem] flex-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          aria-label="Opening balance"
          className="figure w-28"
          inputMode="decimal"
          value={opening}
          onChange={(e) => setOpening(e.target.value)}
        />
        <span className="w-28 text-right">
          <Amount centavos={account.balance_centavos} size="sm" />
          {/* Shown read-only so it's obvious the balance is derived from what
              you log, not something you keep in sync by hand. */}
          <Muted className="block text-[0.625rem] uppercase tracking-[0.07em]">derived</Muted>
        </span>
      </div>

      {liability ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="APR"
            className="figure w-20"
            inputMode="decimal"
            placeholder="APR %"
            value={apr}
            onChange={(e) => setApr(e.target.value)}
          />
          <Input
            aria-label="Due day"
            className="figure w-20"
            inputMode="numeric"
            placeholder="Due day"
            value={dueDay}
            onChange={(e) => setDueDay(e.target.value)}
          />
          <Select
            aria-label="Tracking mode"
            className="w-40"
            value={mode}
            onChange={(e) => setMode(e.target.value as TrackingMode)}
          >
            <option value="itemized">Itemize purchases</option>
            <option value="statement_only">Statement only</option>
          </Select>
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button className="min-h-[2.25rem] px-3 text-xs" disabled={pending} onClick={save}>
          Save
        </Button>
        {account.is_active ? (
          <Button
            variant="quiet"
            className="min-h-[2.25rem] px-3 text-xs"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await archiveAccount(account.account_id)
                router.refresh()
              })
            }
          >
            Deactivate
          </Button>
        ) : (
          <Muted className="self-center text-xs">Inactive</Muted>
        )}
      </div>
    </li>
  )
}

function AddAccount() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('bank')
  const [opening, setOpening] = useState('')

  return (
    <Card>
      <CardHeader title="Add a place money sits" />
      <div className="flex flex-wrap gap-2 p-3">
        <Input
          aria-label="Name"
          className="min-w-[8rem] flex-1"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Select
          aria-label="Type"
          className="w-32"
          value={type}
          onChange={(e) => setType(e.target.value as AccountType)}
        >
          <option value="bank">bank</option>
          <option value="ewallet">e-wallet</option>
          <option value="cash">cash</option>
          <option value="credit">credit</option>
          <option value="loan">loan</option>
        </Select>
        <Input
          aria-label="Opening balance"
          className="figure w-28"
          inputMode="decimal"
          placeholder="0.00"
          value={opening}
          onChange={(e) => setOpening(e.target.value)}
        />
        <Button
          variant="primary"
          disabled={pending || name.trim() === ''}
          onClick={() =>
            startTransition(async () => {
              await createAccount({
                name,
                type,
                openingBalanceCentavos: parseAmount(opening) ?? 0,
              })
              setName('')
              setOpening('')
              router.refresh()
            })
          }
        >
          Add
        </Button>
      </div>
    </Card>
  )
}
