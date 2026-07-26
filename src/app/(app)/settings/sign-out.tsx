'use client'

import { Button } from '@/components/ui/primitives'

export function SignOutButton({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action}>
      <Button type="submit" variant="secondary">
        Sign out
      </Button>
    </form>
  )
}
