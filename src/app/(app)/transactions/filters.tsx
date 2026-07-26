'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { MONTH_ABBR } from '@/lib/dates'
import { Select } from '@/components/ui/primitives'

/**
 * Filters live in the URL, so a filtered view is linkable and survives a
 * refresh. Clearing the month turns this screen into the yearly actuals grid
 * the spreadsheet kept separately.
 */
export function Filters({
  year,
  month,
  categoryId,
  accountId,
  categories,
  accounts,
}: {
  year: number
  month: number | null
  categoryId: string
  accountId: string
  categories: Array<{ id: string; name: string }>
  accounts: Array<{ id: string; name: string }>
}) {
  const router = useRouter()
  const params = useSearchParams()

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('highlight')
    router.push(`/transactions?${next.toString()}`)
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Select
          aria-label="Year"
          className="figure w-24"
          value={year}
          onChange={(e) => set('year', e.target.value)}
        >
          {yearsAround(year).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Month"
          className="w-32"
          value={month === null ? 'all' : String(month)}
          onChange={(e) => set('month', e.target.value)}
        >
          <option value="all">Whole year</option>
          {MONTH_ABBR.map((label, index) => (
            <option key={label} value={index + 1}>
              {label}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Category"
          className="min-w-[9rem] flex-1"
          value={categoryId}
          onChange={(e) => set('category', e.target.value)}
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Account"
          className="min-w-[9rem] flex-1"
          value={accountId}
          onChange={(e) => set('account', e.target.value)}
        >
          <option value="">Everywhere</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </Select>
      </div>
      {categoryId ? (
        <p className="text-xs text-ink-45">
          Transfers are hidden while filtering by category — a transfer has no category,
          because it is neither income nor expense.
        </p>
      ) : null}
    </div>
  )
}

function yearsAround(year: number): number[] {
  return [year - 2, year - 1, year, year + 1]
}
