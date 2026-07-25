'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/db/schema'

let cached: ReturnType<typeof createBrowserClient<Database>> | undefined

/**
 * Browser Supabase client. Safe to memoise — unlike the server client there is
 * exactly one session in a tab, and creating a new client per render drops the
 * realtime connection and re-reads storage every time.
 */
export function createClient() {
  cached ??= createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  return cached
}
