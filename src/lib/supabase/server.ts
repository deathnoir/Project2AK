import 'server-only'

import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/lib/db/schema'
import { requireEnv } from '@/lib/env'

/**
 * Server-side Supabase client bound to the request's cookies.
 *
 * Must be created per request — caching one across requests would hand one
 * user's session to the next. In a single-user app that reads as harmless
 * right up until the first time you open the app on a second device.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // The middleware refreshes the session, so this is safe to ignore.
          }
        },
      },
    },
  )
}

/**
 * The signed-in user, or null. Uses getUser() rather than getSession() because
 * getSession() trusts the cookie without revalidating it against the auth
 * server.
 */
export async function getUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}
