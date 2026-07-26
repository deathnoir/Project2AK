import { Amount } from '@/components/ui/amount'
import { Card, CardHeader, Row, Rows, Screen, ScreenTitle } from '@/components/ui/primitives'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/server/actions/settings'
import { SignOutButton } from './sign-out'
import { ProfileForm } from './profile-form'

export const metadata = { title: 'Settings · Project2AK' }

const LINKS = [
  { href: '/settings/accounts', label: 'Where money sits', hint: 'Names, types, opening balances, credit terms' },
  { href: '/settings/categories', label: 'Categories', hint: 'Names, groups, due days, rollover' },
  { href: '/settings/recurring', label: 'Recurring rules', hint: 'Bills and installments that generate themselves' },
  { href: '/settings/savings', label: 'Savings goals', hint: 'Goals, sinking funds, and the 2AK line' },
  { href: '/settings/reconciliation', label: 'Reconciliation', hint: 'Match against real statements each month' },
]

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [{ data: profile }, { data: worth }] = await Promise.all([
    supabase.from('profiles').select('*').eq('user_id', user?.id ?? '').maybeSingle(),
    supabase
      .from('v_net_worth_monthly')
      .select('*')
      .order('month', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  return (
    <Screen className="space-y-4">
      <ScreenTitle>Settings</ScreenTitle>

      <Card>
        <CardHeader
          title="Net worth"
          hint="Account balances plus manual non-cash items"
          action={<Amount centavos={worth?.net_worth_centavos ?? 0} size="sm" />}
        />
      </Card>

      <Card>
        <Rows>
          {LINKS.map((link) => (
            <Row key={link.href} href={link.href}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{link.label}</span>
                <span className="block truncate text-xs text-ink-45">{link.hint}</span>
              </span>
              <span className="text-ink-25">›</span>
            </Row>
          ))}
        </Rows>
      </Card>

      <Card>
        <CardHeader
          title="Export"
          hint="Everything, in formats you can open elsewhere"
        />
        <Rows>
          <Row href="/api/export?format=zip">
            <span className="flex-1 text-sm">Everything as a ZIP</span>
            <span className="text-xs text-ink-45">CSV per table, JSON, receipt images</span>
          </Row>
          <Row href="/api/export?format=json">
            <span className="flex-1 text-sm">JSON dump</span>
          </Row>
          <Row href="/api/export?format=csv&table=transactions">
            <span className="flex-1 text-sm">Transactions as CSV</span>
          </Row>
        </Rows>
        <p className="border-t border-rule px-4 py-2.5 text-xs text-ink-45">
          Personal finance data you can&rsquo;t extract is a trap. Receipt images are
          included — they&rsquo;re the audit trail.
        </p>
      </Card>

      <Card>
        <CardHeader title="Account" hint={user?.email ?? ''} />
        <ProfileForm
          activeYear={profile?.active_year ?? new Date().getFullYear()}
          paydayDays={profile?.payday_days ?? [15, 30]}
        />
        <div className="border-t border-rule p-3">
          <SignOutButton action={signOut} />
        </div>
      </Card>
    </Screen>
  )
}
