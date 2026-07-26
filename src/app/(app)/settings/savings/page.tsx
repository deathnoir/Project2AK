import { Screen, ScreenTitle } from '@/components/ui/primitives'
import { createClient } from '@/lib/supabase/server'
import { today } from '@/lib/dates'
import { GoalEditor } from './goal-editor'

export const metadata = { title: 'Savings goals · Project2AK' }

export default async function SavingsSettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const userId = user?.id ?? ''

  const now = today()
  const year = Number(now.slice(0, 4))
  const month = Number(now.slice(5, 7))

  const [{ data: progress }, { data: categories }, { data: accounts }, { data: noSpend }] =
    await Promise.all([
      supabase.from('v_savings_progress').select('*'),
      supabase
        .from('categories')
        .select('id, name, group')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .eq('is_archived', false)
        .order('sort_order'),
      supabase.from('v_account_balances').select('account_id, name').order('sort_order'),
      supabase
        .from('no_spend_goals')
        .select('goal_days')
        .eq('user_id', userId)
        .eq('year', year)
        .eq('month', month)
        .maybeSingle(),
    ])

  return (
    <Screen>
      <ScreenTitle>Savings goals</ScreenTitle>
      <GoalEditor
        goals={progress ?? []}
        categories={(categories ?? []).filter((c) => c.group === 'savings')}
        accounts={(accounts ?? []).map((a) => ({ id: a.account_id, name: a.name }))}
        noSpendGoal={noSpend?.goal_days ?? 0}
        year={year}
        month={month}
      />
    </Screen>
  )
}
