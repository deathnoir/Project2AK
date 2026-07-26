import { Screen } from '@/components/ui/primitives'
import { PendingQueue, type PendingRow } from '@/components/pending-queue'
import { createClient } from '@/lib/supabase/server'
import { today } from '@/lib/dates'
import { generateDueTransactions } from '@/server/actions/recurring'
import { SafeToSpendPanel } from './dashboard/safe-to-spend'
import { Balances } from './dashboard/balances'
import { BillsDue, NoSpendWidget, YtdStrip } from './dashboard/widgets'

export const metadata = { title: 'Project2AK' }

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const userId = user?.id ?? ''

  // Generating on load rather than on a cron: the index on
  // (recurring_rule_id, date) makes this idempotent, and a bill that only
  // appears once a scheduled job has run is a bill the user can't confirm.
  await generateDueTransactions()

  const now = today()
  const currentMonth = Number(now.slice(5, 7))

  const [
    { data: profile },
    { data: safe },
    { data: accounts },
    { data: beneficiary },
    { data: pendingTx },
    { data: pendingTransfers },
    { data: noSpend },
    { data: noSpendGoal },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('v_safe_to_spend').select('*').maybeSingle(),
    supabase.from('v_account_balances').select('*').order('sort_order'),
    supabase.from('v_beneficiary_totals').select('*').eq('beneficiary', '2AK').maybeSingle(),
    supabase
      .from('transactions')
      .select('id, date, detail, amount_centavos, account_id, category_id')
      .eq('user_id', userId)
      .eq('is_pending', true)
      .is('deleted_at', null)
      .order('date'),
    supabase
      .from('transfers')
      .select('id, date, amount_centavos, from_account_id, to_account_id, note')
      .eq('user_id', userId)
      .eq('is_pending', true)
      .is('deleted_at', null)
      .order('date'),
    supabase
      .from('v_no_spend_days')
      .select('*')
      .eq('month', currentMonth)
      .order('day'),
    supabase
      .from('no_spend_goals')
      .select('goal_days')
      .eq('user_id', userId)
      .eq('month', currentMonth)
      .maybeSingle(),
  ])

  const activeYear = profile?.active_year ?? Number(now.slice(0, 4))

  const [{ data: grid }, { data: categories }] = await Promise.all([
    supabase.from('v_budget_vs_actual').select('*').eq('year', activeYear),
    supabase.from('categories').select('id, name').eq('user_id', userId).is('deleted_at', null),
  ])

  const accountName = new Map((accounts ?? []).map((a) => [a.account_id, a.name]))
  const categoryName = new Map((categories ?? []).map((c) => [c.id, c.name]))

  const pending: PendingRow[] = [
    ...(pendingTx ?? []).map((t) => ({
      id: t.id,
      kind: 'transaction' as const,
      date: t.date,
      detail: t.detail || 'Recurring',
      amountCentavos: t.amount_centavos,
      accountName: accountName.get(t.account_id) ?? '—',
      categoryName: t.category_id ? categoryName.get(t.category_id) : undefined,
    })),
    ...(pendingTransfers ?? []).map((t) => ({
      id: t.id,
      kind: 'transfer' as const,
      date: t.date,
      detail: t.note || 'Transfer',
      // Shown as an outflow: money leaving the "from" account is what the
      // user is confirming.
      amountCentavos: -t.amount_centavos,
      accountName: accountName.get(t.from_account_id) ?? '—',
      toAccountName: accountName.get(t.to_account_id) ?? '—',
    })),
  ].sort((a, b) => a.date.localeCompare(b.date))

  const monthGrid = (grid ?? []).filter((r) => r.month === currentMonth)

  return (
    <Screen className="space-y-5">
      <SafeToSpendPanel data={safe ?? null} beneficiary={beneficiary ?? null} />

      <PendingQueue rows={pending} />

      <Balances accounts={accounts ?? []} />

      <BillsDue rows={monthGrid} today={now} />

      <div className="grid gap-4 md:grid-cols-2">
        <NoSpendWidget
          days={noSpend ?? []}
          goalDays={noSpendGoal?.goal_days ?? 0}
          month={currentMonth}
        />
        <YtdStrip rows={grid ?? []} year={activeYear} throughMonth={currentMonth} />
      </div>
    </Screen>
  )
}
