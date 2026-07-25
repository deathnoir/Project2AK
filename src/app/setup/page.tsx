import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SetupWizard } from './setup-wizard'

export const metadata = { title: 'Set up · Project2AK' }

export default async function SetupPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: categories }, { data: accounts }] = await Promise.all([
    supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
    supabase
      .from('categories')
      .select('*')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('sort_order'),
    supabase
      .from('accounts')
      .select('*')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('sort_order'),
  ])

  if (profile?.setup_done) redirect('/')

  return (
    <SetupWizard
      categories={categories ?? []}
      existingAccounts={accounts ?? []}
      paydayDays={profile?.payday_days ?? [15, 30]}
      activeYear={profile?.active_year ?? new Date().getFullYear()}
    />
  )
}
