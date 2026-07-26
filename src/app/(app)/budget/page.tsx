import { Screen, ScreenTitle } from '@/components/ui/primitives'
import { createClient } from '@/lib/supabase/server'
import { today } from '@/lib/dates'
import { BudgetGrid } from './budget-grid'

export const metadata = { title: 'Budget · Project2AK' }

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}) {
  const { year: yearParam } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_year')
    .eq('user_id', user?.id ?? '')
    .maybeSingle()

  const now = today()
  // The year is a first-class filter — the spreadsheet hardcoded it, and that
  // was a real problem.
  const year = Number(yearParam) || profile?.active_year || Number(now.slice(0, 4))
  const currentMonth = year === Number(now.slice(0, 4)) ? Number(now.slice(5, 7)) : 1

  const { data: rows } = await supabase
    .from('v_budget_vs_actual')
    .select('*')
    .eq('year', year)
    .order('sort_order')

  return (
    <Screen>
      <ScreenTitle>Budget {year}</ScreenTitle>
      <BudgetGrid rows={rows ?? []} year={year} currentMonth={currentMonth} />
    </Screen>
  )
}
