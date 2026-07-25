import { LinkButton } from '@/components/ui/primitives'

export const metadata = { title: 'Sign-in problem · Project2AK' }

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>
}) {
  const { reason } = await searchParams

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-12">
      <h1 className="text-xl font-semibold tracking-tight">That link didn&rsquo;t work</h1>
      <p className="mt-2 text-sm text-ink-45">
        {reason === 'missing_code'
          ? 'The link was incomplete. Links expire after a while and can only be used once.'
          : 'Sign-in links expire after a while and can only be used once. Request a fresh one.'}
      </p>
      {reason && reason !== 'missing_code' ? (
        <p className="mt-3 font-mono text-xs text-ink-25">{reason}</p>
      ) : null}
      <LinkButton href="/login" variant="primary" className="mt-6">
        Request a new link
      </LinkButton>
    </main>
  )
}
