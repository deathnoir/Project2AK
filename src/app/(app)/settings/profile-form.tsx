'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button, Field, Input, Muted } from '@/components/ui/primitives'
import { updateProfile } from '@/server/actions/settings'
import { cn } from '@/lib/cn'

/**
 * Active year and paydays, changeable after setup.
 *
 * Both matter beyond first run: the year is a first-class filter on every
 * screen, and the payday days are what safe-to-spend projects to. A job
 * changing its pay dates would otherwise mean re-running setup.
 */
export function ProfileForm({
  activeYear,
  paydayDays,
}: {
  activeYear: number
  paydayDays: number[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [year, setYear] = useState(String(activeYear))
  const [days, setDays] = useState<number[]>(paydayDays)
  const [saved, setSaved] = useState(false)

  return (
    <div className="space-y-4 p-4">
      <Field label="Active year" hint="What every screen filters to by default.">
        <Input
          className="figure w-28"
          inputMode="numeric"
          value={year}
          onChange={(e) => {
            setYear(e.target.value)
            setSaved(false)
          }}
        />
      </Field>

      <Field label="Paydays" hint="A 30th or 31st lands on the last day in a short month.">
        <div className="flex flex-wrap gap-1.5">
          {[5, 10, 15, 20, 25, 30, 31].map((day) => (
            <button
              key={day}
              type="button"
              aria-pressed={days.includes(day)}
              onClick={() => {
                setSaved(false)
                setDays((current) =>
                  current.includes(day)
                    ? current.filter((d) => d !== day)
                    : [...current, day].sort((a, b) => a - b),
                )
              }}
              className={cn(
                'figure min-h-[2.5rem] w-12 rounded-[6px] border text-sm',
                days.includes(day)
                  ? 'border-ink bg-ink text-paper'
                  : 'border-rule-strong bg-paper text-ink-70',
              )}
            >
              {day}
            </button>
          ))}
        </div>
      </Field>

      <div className="flex items-center gap-3">
        <Button
          disabled={pending || days.length === 0}
          onClick={() =>
            startTransition(async () => {
              await updateProfile({
                activeYear: Number(year) || activeYear,
                paydayDays: days,
              })
              setSaved(true)
              router.refresh()
            })
          }
        >
          Save
        </Button>
        {saved ? <Muted className="text-xs text-jade">Saved.</Muted> : null}
      </div>
    </div>
  )
}
