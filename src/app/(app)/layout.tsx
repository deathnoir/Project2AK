import { redirect } from 'next/navigation'
import { Nav } from '@/components/nav'
import { createClient } from '@/lib/supabase/server'

/**
 * The authenticated shell.
 *
 * Middleware already bounces anonymous requests, but this layout re-checks —
 * middleware is a routing concern and can be misconfigured by a matcher edit,
 * while this runs on the same request as the data fetch.
 *
 * It also gates on setup: an account with no accounts declared can't compute
 * a balance, so every screen would show ₱0.00 and look broken.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('setup_done')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!profile?.setup_done) redirect('/setup')

  return (
    <>
      <Nav />
      {children}
    </>
  )
}
