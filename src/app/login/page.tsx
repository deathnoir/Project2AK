import { LoginForm } from './login-form'

export const metadata = { title: 'Sign in · Project2AK' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Project2AK</h1>
        <p className="mt-1 text-sm text-ink-45">
          Personal finance, built around how fast you can log a transaction.
        </p>
      </div>
      {/* next carries the share-target intent through the login round trip, so
          a receipt shared on a cold session doesn't land on the dashboard. */}
      <LoginForm next={next ?? '/'} />
    </main>
  )
}
