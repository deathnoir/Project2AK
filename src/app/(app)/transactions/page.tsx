import { Card, Screen, ScreenTitle } from '@/components/ui/primitives'
import { createClient } from '@/lib/supabase/server'
import { endOfMonth, monthName, today, toDateString } from '@/lib/dates'
import { TransactionList, type LogEntry } from './transaction-list'
import { Filters } from './filters'

export const metadata = { title: 'Transactions · Project2AK' }

const PAGE_SIZE = 200

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string
    month?: string
    category?: string
    account?: string
    highlight?: string
  }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const userId = user?.id ?? ''

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_year')
    .eq('user_id', userId)
    .maybeSingle()

  const now = today()
  // The year is a first-class filter. Yearly actuals are this screen with the
  // month cleared, not a separate grid.
  const year = Number(params.year) || profile?.active_year || Number(now.slice(0, 4))
  const month = params.month === 'all' ? null : Number(params.month) || Number(now.slice(5, 7))

  const from = month ? toDateString(year, month, 1) : toDateString(year, 1, 1)
  const to = month ? endOfMonth(from) : toDateString(year, 12, 31)

  let txQuery = supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .eq('is_pending', false)
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE)

  if (params.category) txQuery = txQuery.eq('category_id', params.category)
  if (params.account) txQuery = txQuery.eq('account_id', params.account)

  const [{ data: transactions }, { data: transfers }, { data: accounts }, { data: categories }] =
    await Promise.all([
      txQuery,
      // Transfers interleave into the same log, because that is how a person
      // thinks about "what happened" — but they never carry a sign colour.
      params.category
        ? Promise.resolve({ data: [] as never[] })
        : supabase
            .from('transfers')
            .select('*')
            .eq('user_id', userId)
            .is('deleted_at', null)
            .eq('is_pending', false)
            .gte('date', from)
            .lte('date', to)
            .order('date', { ascending: false })
            .limit(PAGE_SIZE),
      supabase.from('v_account_balances').select('account_id, name').order('sort_order'),
      supabase
        .from('categories')
        .select('id, name')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('sort_order'),
    ])

  const accountName = new Map((accounts ?? []).map((a) => [a.account_id, a.name]))
  const categoryName = new Map((categories ?? []).map((c) => [c.id, c.name]))

  // Signed URLs are needed because the receipts bucket is private. One batch
  // call rather than one per row.
  const receiptIds = [
    ...new Set((transactions ?? []).map((t) => t.receipt_id).filter((id): id is string => !!id)),
  ]
  const receiptUrls = new Map<string, string>()
  if (receiptIds.length > 0) {
    const { data: receipts } = await supabase
      .from('receipts')
      .select('id, storage_path')
      .in('id', receiptIds)
    for (const receipt of receipts ?? []) {
      const { data: signed } = await supabase.storage
        .from('receipts')
        .createSignedUrl(receipt.storage_path, 60 * 60)
      if (signed?.signedUrl) receiptUrls.set(receipt.id, signed.signedUrl)
    }
  }

  const byId = new Map<string, LogEntry>()
  const children = new Map<string, LogEntry[]>()

  for (const t of transactions ?? []) {
    const entry: LogEntry = {
      id: t.id,
      kind: 'transaction',
      date: t.date,
      detail: t.detail,
      amountCentavos: t.amount_centavos,
      categoryId: t.category_id,
      categoryName: t.category_id ? (categoryName.get(t.category_id) ?? null) : null,
      accountId: t.account_id,
      accountName: accountName.get(t.account_id) ?? '—',
      toAccountName: null,
      receiptUrl: t.receipt_id ? (receiptUrls.get(t.receipt_id) ?? null) : null,
      note: t.note,
      children: [],
    }
    if (t.parent_id) children.set(t.parent_id, [...(children.get(t.parent_id) ?? []), entry])
    else byId.set(t.id, entry)
  }

  for (const [parentId, kids] of children) {
    const parent = byId.get(parentId)
    if (parent) parent.children = kids
  }

  const entries: LogEntry[] = [
    ...byId.values(),
    ...(transfers ?? []).map((t) => ({
      id: t.id,
      kind: 'transfer' as const,
      date: t.date,
      detail: t.note || 'Transfer',
      amountCentavos: t.amount_centavos,
      categoryId: null,
      categoryName: null,
      accountId: t.from_account_id,
      accountName: accountName.get(t.from_account_id) ?? '—',
      toAccountName: accountName.get(t.to_account_id) ?? '—',
      receiptUrl: null,
      note: t.note,
      children: [] as LogEntry[],
    })),
  ].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <Screen>
      <ScreenTitle>
        Transactions
        <span className="ml-2 text-sm font-normal text-ink-45">
          {month ? `${monthName(month)} ${year}` : year}
        </span>
      </ScreenTitle>

      <div className="mb-4">
        <Filters
          year={year}
          month={month}
          categoryId={params.category ?? ''}
          accountId={params.account ?? ''}
          categories={categories ?? []}
          accounts={(accounts ?? []).map((a) => ({ id: a.account_id, name: a.name }))}
        />
      </div>

      {entries.length >= PAGE_SIZE ? (
        <Card className="mb-3 px-4 py-2 text-xs text-ink-45">
          Showing the most recent {PAGE_SIZE}. Narrow the filter to see more.
        </Card>
      ) : null}

      <TransactionList
        entries={entries}
        categories={categories ?? []}
        {...(params.highlight ? { highlightId: params.highlight } : {})}
      />
    </Screen>
  )
}
