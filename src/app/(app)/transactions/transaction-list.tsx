'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Amount } from '@/components/ui/amount'
import { Button, Card, EmptyState, Input, Muted, Select } from '@/components/ui/primitives'
import { formatRelativeDay } from '@/lib/dates'
import { parseAmount } from '@/lib/money'
import { bulkRecategorise, softDeleteTransaction, updateTransaction } from '@/server/actions/transactions'
import { cn } from '@/lib/cn'

export interface LogEntry {
  id: string
  kind: 'transaction' | 'transfer'
  date: string
  detail: string
  amountCentavos: number
  categoryId: string | null
  categoryName: string | null
  accountId: string
  accountName: string
  toAccountName: string | null
  receiptUrl: string | null
  note: string | null
  children: LogEntry[]
}

export function TransactionList({
  entries,
  categories,
  highlightId,
}: {
  entries: LogEntry[]
  categories: Array<{ id: string; name: string }>
  highlightId?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<string | null>(null)

  if (entries.length === 0) {
    return (
      <Card>
        <EmptyState title="Nothing logged for this filter">
          Change the month, or log something from the Add screen.
        </EmptyState>
      </Card>
    )
  }

  const days = new Map<string, LogEntry[]>()
  for (const entry of entries) {
    days.set(entry.date, [...(days.get(entry.date) ?? []), entry])
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-4">
      {selected.size > 0 ? (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-[6px] border border-ink bg-paper px-3 py-2">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Select
            aria-label="Recategorise selection"
            className="ml-auto w-44"
            defaultValue=""
            onChange={(e) => {
              const categoryId = e.target.value
              if (!categoryId) return
              startTransition(async () => {
                await bulkRecategorise([...selected], categoryId)
                setSelected(new Set())
                router.refresh()
              })
            }}
          >
            <option value="">Recategorise to…</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
          <Button
            variant="danger"
            className="min-h-[2.25rem] px-3 text-xs"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                for (const id of selected) await softDeleteTransaction(id, 'transaction')
                setSelected(new Set())
                router.refresh()
              })
            }
          >
            Delete
          </Button>
          <Button className="min-h-[2.25rem] px-3 text-xs" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      ) : null}

      {[...days.entries()].map(([date, dayEntries]) => (
        <section key={date}>
          <h2 className="sticky top-0 z-[1] bg-paper/95 py-1.5 text-xs font-medium uppercase tracking-[0.07em] text-ink-45 backdrop-blur">
            {formatRelativeDay(date)}
          </h2>
          <Card>
            <ul className="divide-y divide-rule">
              {dayEntries.map((entry) => (
                <li
                  key={entry.id}
                  className={cn(highlightId === entry.id && 'bg-jade-soft')}
                >
                  <EntryRow
                    entry={entry}
                    categories={categories}
                    selected={selected.has(entry.id)}
                    onToggle={() => toggle(entry.id)}
                    editing={editing === entry.id}
                    onEdit={() => setEditing(editing === entry.id ? null : entry.id)}
                    onSaved={() => {
                      setEditing(null)
                      router.refresh()
                    }}
                  />
                  {/* Child fee rows sit under their parent, indented — a ₱450
                      Jollibee expense with a ₱15 fee is one event, not two. */}
                  {entry.children.length > 0 ? (
                    <ul className="border-t border-rule bg-paper-sunk">
                      {entry.children.map((child) => (
                        <li
                          key={child.id}
                          className="flex items-center gap-3 py-2 pl-10 pr-4 text-sm"
                        >
                          <span className="flex-1 truncate text-ink-45">{child.detail}</span>
                          <Amount centavos={child.amountCentavos} size="xs" tone="expense" />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ))}
    </div>
  )
}

function EntryRow({
  entry,
  categories,
  selected,
  onToggle,
  editing,
  onEdit,
  onSaved,
}: {
  entry: LogEntry
  categories: Array<{ id: string; name: string }>
  selected: boolean
  onToggle: () => void
  editing: boolean
  onEdit: () => void
  onSaved: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [detail, setDetail] = useState(entry.detail)
  const [amount, setAmount] = useState((Math.abs(entry.amountCentavos) / 100).toFixed(2))
  const [categoryId, setCategoryId] = useState(entry.categoryId ?? '')

  const isTransfer = entry.kind === 'transfer'

  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center gap-3">
        {!isTransfer ? (
          <input
            type="checkbox"
            aria-label={`Select ${entry.detail}`}
            checked={selected}
            onChange={onToggle}
            className="size-4 shrink-0 accent-[#10182B]"
          />
        ) : (
          <span className="size-4 shrink-0" />
        )}

        <button
          type="button"
          onClick={onEdit}
          className="min-w-0 flex-1 text-left"
          aria-expanded={editing}
        >
          <p className="truncate text-sm">{entry.detail || 'Untitled'}</p>
          <p className="truncate text-xs text-ink-45">
            {isTransfer ? (
              // A transfer is neither income nor expense, so it never gets a
              // sign colour and always names both ends.
              <span>
                {entry.accountName} → {entry.toAccountName}
              </span>
            ) : (
              <>
                {entry.categoryName ?? 'Uncategorised'} · {entry.accountName}
              </>
            )}
          </p>
        </button>

        {entry.receiptUrl ? (
          <a
            href={entry.receiptUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="Open receipt image"
            className="shrink-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={entry.receiptUrl}
              alt=""
              className="size-9 rounded-[4px] border border-rule object-cover"
            />
          </a>
        ) : null}

        <Amount
          centavos={entry.amountCentavos}
          size="sm"
          tone={isTransfer ? 'none' : 'expense'}
        />
      </div>

      {editing ? (
        <div className="mt-3 space-y-2 border-t border-rule pt-3">
          <div className="flex flex-wrap gap-2">
            <Input
              aria-label="Detail"
              className="min-w-[8rem] flex-1"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
            />
            <Input
              aria-label="Amount"
              className="figure w-28"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          {!isTransfer ? (
            <Select
              aria-label="Category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Uncategorised</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          ) : (
            <Muted className="block text-xs">
              A transfer has no category — it is neither income nor expense.
            </Muted>
          )}
          <div className="flex gap-2">
            <Button
              variant="primary"
              className="min-h-[2.25rem] px-3 text-xs"
              disabled={pending || isTransfer}
              onClick={() => {
                const parsed = parseAmount(amount)
                if (parsed === null) return
                startTransition(async () => {
                  await updateTransaction({
                    id: entry.id,
                    detail,
                    // Preserve the original direction: editing the magnitude
                    // must never silently flip an expense into income.
                    amountCentavos:
                      entry.amountCentavos < 0 ? -Math.abs(parsed) : Math.abs(parsed),
                    categoryId: categoryId || null,
                  })
                  onSaved()
                })
              }}
            >
              Save
            </Button>
            <Button
              variant="danger"
              className="min-h-[2.25rem] px-3 text-xs"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await softDeleteTransaction(entry.id, entry.kind)
                  onSaved()
                })
              }
            >
              Delete
            </Button>
            {entry.receiptUrl ? (
              <Link
                href={entry.receiptUrl}
                target="_blank"
                className="self-center text-xs underline"
              >
                View receipt
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
