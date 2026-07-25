'use client'

import { useState } from 'react'
import { Button, Field, Input } from '@/components/ui/primitives'
import { createClient } from '@/lib/supabase/client'

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function send(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setState('sending')

    const supabase = createClient()
    const origin = window.location.origin
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })

    if (sendError) {
      setError(sendError.message)
      setState('idle')
      return
    }
    setState('sent')
  }

  if (state === 'sent') {
    return (
      <div className="rounded-[6px] border border-rule bg-paper p-4">
        <p className="text-sm font-medium">Check your email.</p>
        <p className="mt-1 text-sm text-ink-45">
          A sign-in link is on its way to {email}. It opens the app directly — there is no
          password.
        </p>
        <Button
          variant="quiet"
          className="mt-3 px-0"
          onClick={() => {
            setState('idle')
            setError(null)
          }}
        >
          Use a different address
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={send} className="space-y-4">
      <Field label="Email" htmlFor="email" error={error}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </Field>
      <Button type="submit" variant="primary" className="w-full" disabled={state === 'sending'}>
        {state === 'sending' ? 'Sending…' : 'Send sign-in link'}
      </Button>
    </form>
  )
}
