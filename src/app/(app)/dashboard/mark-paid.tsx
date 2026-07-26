'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Button } from '@/components/ui/primitives'
import { markPaid } from '@/server/actions/budgets'

/**
 * Ticks a bill off for the month.
 *
 * This only sets `budgets.is_paid` — it posts nothing. The actual money still
 * arrives as a confirmed transaction, whether typed, captured from a receipt,
 * or confirmed from the recurring queue. Marking it paid just stops the
 * reminder.
 */
export function MarkPaidButton({
  categoryId,
  year,
  month,
}: {
  categoryId: string
  year: number
  month: number
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <Button
      variant="quiet"
      className="min-h-0 shrink-0 px-2 py-1 text-xs"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await markPaid(categoryId, year, month, true)
          router.refresh()
        })
      }
    >
      Paid
    </Button>
  )
}
