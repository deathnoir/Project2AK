import { EmptyState, Screen, ScreenTitle } from '@/components/ui/primitives'
import { createClient } from '@/lib/supabase/server'
import { DebtScreen } from './debt-screen'

export const metadata = { title: 'Debt · Project2AK' }

export default async function DebtPage() {
  const supabase = await createClient()
  const { data: accounts } = await supabase.from('v_debt_progress').select('*').order('name')

  if (!accounts || accounts.length === 0) {
    return (
      <Screen>
        <ScreenTitle>Debt</ScreenTitle>
        <EmptyState title="Nothing owed">
          Credit lines, BNPL, and loans show up here once you declare them under
          &ldquo;Money I owe&rdquo;.
        </EmptyState>
      </Screen>
    )
  }

  return (
    <Screen>
      <ScreenTitle>Debt</ScreenTitle>
      <DebtScreen accounts={accounts} />
    </Screen>
  )
}
