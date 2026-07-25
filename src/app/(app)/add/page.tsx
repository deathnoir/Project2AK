import { Screen, ScreenTitle } from '@/components/ui/primitives'
import { createClient } from '@/lib/supabase/server'
import { hasExtractionKey } from '@/lib/env'
import { lastUsedAccountId } from '@/server/actions/transactions'
import { AddScreen } from './add-screen'

export const metadata = { title: 'Add · Project2AK' }

export default async function AddPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [{ data: accounts }, { data: categories }, defaultAccountId] = await Promise.all([
    supabase
      .from('v_account_balances')
      .select('*')
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('categories')
      .select('*')
      .eq('user_id', user?.id ?? '')
      .is('deleted_at', null)
      .eq('is_archived', false)
      .order('sort_order'),
    lastUsedAccountId(),
  ])

  return (
    <Screen>
      <ScreenTitle>Add</ScreenTitle>
      <AddScreen
        accounts={accounts ?? []}
        categories={categories ?? []}
        defaultAccountId={defaultAccountId}
        extractionAvailable={hasExtractionKey()}
      />
    </Screen>
  )
}
