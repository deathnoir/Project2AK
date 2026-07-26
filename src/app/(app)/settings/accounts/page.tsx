import { Screen, ScreenTitle } from '@/components/ui/primitives'
import { createClient } from '@/lib/supabase/server'
import { AccountEditor } from './account-editor'

export const metadata = { title: 'Where money sits · Project2AK' }

export default async function AccountsSettingsPage() {
  const supabase = await createClient()
  const { data: accounts } = await supabase
    .from('v_account_balances')
    .select('*')
    .order('sort_order')

  return (
    <Screen>
      <ScreenTitle>Where money sits</ScreenTitle>
      <AccountEditor accounts={accounts ?? []} />
    </Screen>
  )
}
