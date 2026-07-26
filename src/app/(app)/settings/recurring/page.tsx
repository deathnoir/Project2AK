import { Screen, ScreenTitle } from '@/components/ui/primitives'
import { createClient } from '@/lib/supabase/server'
import { RuleList } from './rule-list'

export const metadata = { title: 'Recurring · Project2AK' }

export default async function RecurringPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const userId = user?.id ?? ''

  const [{ data: rules }, { data: accounts }, { data: categories }] = await Promise.all([
    supabase
      .from('recurring_rules')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('next_run'),
    supabase.from('v_account_balances').select('account_id, name, is_liquid, is_liability').order('sort_order'),
    supabase
      .from('categories')
      .select('id, name')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .eq('is_archived', false)
      .order('sort_order'),
  ])

  return (
    <Screen>
      <ScreenTitle>Recurring</ScreenTitle>
      <RuleList
        rules={rules ?? []}
        accounts={(accounts ?? []).map((a) => ({ id: a.account_id, name: a.name }))}
        categories={categories ?? []}
      />
    </Screen>
  )
}
