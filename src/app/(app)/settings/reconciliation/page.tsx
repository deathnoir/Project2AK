import { Card, CardHeader, Screen, ScreenTitle } from '@/components/ui/primitives'
import { createClient } from '@/lib/supabase/server'
import { ReconcileForm } from './reconcile-form'

export const metadata = { title: 'Reconciliation · Project2AK' }

export default async function ReconciliationPage() {
  const supabase = await createClient()
  const { data: rows } = await supabase.from('v_reconciliation').select('*').order('name')

  return (
    <Screen className="space-y-4">
      <ScreenTitle>Reconciliation</ScreenTitle>
      <Card>
        <CardHeader
          title="This month"
          hint="Enter what each statement actually says"
        />
        <p className="border-b border-rule px-4 py-3 text-sm text-ink-45">
          The delta between what the app derived and what the provider says catches missed
          transactions without corrupting history. For a credit line this same input is the
          debt tracker — the gap is unlogged interest or fees.
        </p>
        <ReconcileForm rows={rows ?? []} />
      </Card>
    </Screen>
  )
}
