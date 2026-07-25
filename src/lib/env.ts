/**
 * Environment access that fails loudly at the point of use.
 *
 * A missing Supabase URL should be a clear error naming the variable, not a
 * `fetch failed` three layers down.
 */

export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Copy .env.example to .env.local and fill it in.`,
    )
  }
  return value
}

export function optionalEnv(name: string): string | undefined {
  return process.env[name] || undefined
}

/** Whether receipt extraction can run. The UI degrades to manual entry if not. */
export function hasExtractionKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}
