import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { siteUrl } from '@/lib/site-url'

/**
 * Magic-link landing. Exchanges the code for a session, then forwards to
 * wherever the user was headed — which for a shared receipt is the review
 * screen, not the dashboard.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const origin = siteUrl(request)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  // Only ever redirect within this app. An open redirect here would let a
  // crafted magic-link URL bounce a freshly-authenticated user off-site.
  const target = next.startsWith('/') && !next.startsWith('//') ? next : '/'

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/error?reason=missing_code`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(
      `${origin}/auth/error?reason=${encodeURIComponent(error.message)}`,
    )
  }

  return NextResponse.redirect(`${origin}${target}`)
}
