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

  // The signup trigger seeds a profile and the starting categories, but it
  // only fires for users created after it existed — sign in before the
  // migrations are applied and you land here with neither, and the wizard has
  // no way to create them. Idempotent, and a no-op for anyone already set up.
  // Ignore the error: an older database without 0005 applied should still
  // render the wizard rather than crash on a missing function.
  await supabase.rpc('bootstrap_current_user')

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
