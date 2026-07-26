import type { NextRequest } from 'next/server'

/**
 * The public origin of this deployment.
 *
 * `request.nextUrl.origin` is the obvious choice and it is wrong behind a
 * proxy: on Vercel it can resolve to the internal host, which sends a
 * freshly-authenticated user to a URL that doesn't exist. Magic-link callbacks
 * and the share-target redirect both depend on getting this right, and both
 * fail in a way that looks like an auth bug rather than a config one.
 *
 * Order of preference:
 *   1. NEXT_PUBLIC_SITE_URL — set it in production and nothing else is guessed.
 *   2. The x-forwarded-* headers the proxy actually set.
 *   3. VERCEL_PROJECT_PRODUCTION_URL, so preview builds still work unset.
 *   4. The request's own origin, which is correct in local development.
 */
export function siteUrl(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')

  const forwardedHost = request.headers.get('x-forwarded-host')
  if (forwardedHost) {
    const proto = request.headers.get('x-forwarded-proto') ?? 'https'
    return `${proto}://${forwardedHost}`
  }

  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (vercelHost) return `https://${vercelHost}`

  return request.nextUrl.origin
}
