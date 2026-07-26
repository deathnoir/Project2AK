import Link from 'next/link'
import { Amount } from '@/components/ui/amount'
import { Card, CardHeader, EmptyState, Row, Rows, Warn } from '@/components/ui/primitives'
import type { AccountBalance } from '@/lib/db/types'

/**
 * Account balances, split in two.
 *
 * Never labelled "Accounts": that word implies ownership and reads wrong for a
 * BNPL tab. Same table underneath, opposite signs, honest labels.
 */
export function Balances({ accounts }: { accounts: AccountBalance[] }) {
  const have = accounts.filter((a) => a.is_liquid && a.is_active)
  const owe = accounts.filter((a) => a.is_liability && a.is_active)

  const haveTotal = have.reduce((sum, a) => sum + a.balance_centavos, 0)
  const oweTotal = owe.reduce((sum, a) => sum + a.balance_centavos, 0)

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader
          title="Money I have"
          action={<Amount centavos={haveTotal} size="sm" tone="none" />}
        />
        {have.length === 0 ? (
          <EmptyState title="Nothing declared yet" />
        ) : (
          <Rows>
            {have.map((account) => (
              <Row key={account.account_id}>
                <span className="flex-1 truncate text-sm">{account.name}</span>
                <Amount centavos={account.balance_centavos} size="sm" />
              </Row>
            ))}
          </Rows>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Money I owe"
          action={<Amount centavos={oweTotal} size="sm" tone="none" />}
        />
        {owe.length === 0 ? (
          <EmptyState title="Nothing owed" />
        ) : (
          <Rows>
            {owe.map((account) => (
              <Row key={account.account_id}>
                <span className="flex-1 truncate text-sm">
                  {account.name}
                  {/* A credit line at ₱0 is not finished — the credit is
                      available again, and the balance hitting zero is exactly
                      when the operator invites you to use it. */}
                  {account.needs_closing ? (
                    <Link href="/debt" className="ml-2 align-middle">
                      <Warn>Open — close this</Warn>
                    </Link>
                  ) : null}
                </span>
                <Amount centavos={account.balance_centavos} size="sm" />
              </Row>
            ))}
          </Rows>
        )}
      </Card>
    </div>
  )
}
