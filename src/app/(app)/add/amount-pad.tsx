'use client'

import { formatCentavos } from '@/lib/money'
import { cn } from '@/lib/cn'

/**
 * The amount pad.
 *
 * A real keypad, not a text input that summons the OS keyboard — the whole
 * screen is judged on how fast a ₱200 jeepney fare gets logged one-handed at a
 * counter. Keys are bottom-anchored and thumb-sized.
 *
 * State is the raw digit string, so "1", "12", "125" reads as ₱1.25 — the way
 * every payment terminal in the country behaves. Nobody types a decimal point.
 */

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '⌫'] as const

export function digitsToCentavos(digits: string): number {
  if (digits === '') return 0
  const value = Number(digits.slice(-12))
  return Number.isFinite(value) ? value : 0
}

export function AmountPad({
  digits,
  onChange,
  sign,
}: {
  digits: string
  onChange: (next: string) => void
  /** Which sign the figure will be stored with, for the display colour only. */
  sign: 'expense' | 'income' | 'transfer'
}) {
  const centavos = digitsToCentavos(digits)

  function press(key: string) {
    if (key === '⌫') {
      onChange(digits.slice(0, -1))
      return
    }
    // Cap at 12 digits: ₱9,999,999,999.99 is well past anything real and keeps
    // the value inside a safe integer.
    if (digits.length + key.length > 12) return
    onChange((digits + key).replace(/^0+(?=\d)/, ''))
  }

  return (
    <div className="space-y-4">
      <div
        className="flex min-h-[5.5rem] items-center justify-end border-b border-rule px-1 pb-3"
        aria-live="polite"
        aria-label={`Amount ${formatCentavos(centavos)}`}
      >
        <span
          className={cn(
            'figure text-[clamp(2.5rem,11vw,3.5rem)] leading-none font-medium tracking-tight',
            centavos === 0
              ? 'text-ink-25'
              : sign === 'income'
                ? 'text-jade'
                : 'text-ink',
          )}
        >
          {formatCentavos(centavos)}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => press(key)}
            aria-label={key === '⌫' ? 'Delete last digit' : key}
            className={cn(
              'figure min-h-[3.5rem] rounded-[6px] border border-rule bg-paper text-xl',
              'transition-colors active:bg-paper-sunk',
              key === '⌫' && 'text-ink-45',
            )}
          >
            {key}
          </button>
        ))}
      </div>
    </div>
  )
}
