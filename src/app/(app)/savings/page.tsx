import { Screen, ScreenTitle } from '@/components/ui/primitives'
import { createClient } from '@/lib/supabase/server'
import { SavingsScreen } from './savings-screen'

export const metadata = { title: 'Savings · Project2AK' }

/**
 * Deliberately not in the nav. Five screens plus settings is the cap — thirteen
 * was too many for one person to maintain, and the bottom bar is already full.
 * This is reached by tapping the 2AK line on the dashboard, or from Settings.
 */
export default async function SavingsPage() {
  const supabase = await createClient()

  const [{ data: goals }, { data: beneficiaries }] = await Promise.all([
    supabase.from('v_savings_progress').select('*').order('category_name'),
    supabase.from('v_beneficiary_totals').select('*').order('beneficiary'),
  ])

  return (
    <Screen>
      <ScreenTitle>Savings</ScreenTitle>
      <SavingsScreen
        goals={goals ?? []}
        beneficiaryTotals={(beneficiaries ?? []).map((b) => ({
          beneficiary: b.beneficiary,
          saved_centavos: b.saved_centavos,
          change_this_month_centavos: b.change_this_month_centavos,
        }))}
      />
    </Screen>
  )
}
