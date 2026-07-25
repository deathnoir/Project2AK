import { formatCentavos, formatCompact, signOf, type Centavos } from '@/lib/money'
import { cn } from '@/lib/cn'

type Size = 'hero' | 'lg' | 'md' | 'sm' | 'xs'

const SIZES: Record<Size, string> = {
  hero: 'text-[clamp(2.75rem,12vw,4.5rem)] leading-none font-medium tracking-tight',
  lg: 'text-2xl leading-tight font-medium',
  md: 'text-base leading-snug',
  sm: 'text-sm leading-snug',
  xs: 'text-xs leading-snug',
}

export interface AmountProps {
  centavos: Centavos
  size?: Size
  /**
   * How the sign is coloured. `auto` colours by the actual sign; `expense`
   * treats a negative as unremarkable (an expense list is all negatives, and
   * painting every row rose says nothing); `none` never colours.
   */
  tone?: 'auto' | 'expense' | 'none'
  /** Drop the sign and show the magnitude only. */
  absolute?: boolean
  /** Always show a sign, including a leading + on positives. */
  signed?: boolean
  /** ₱1.2k instead of ₱1,234.00 — for dense grids. */
  compact?: boolean
  symbol?: boolean
  cents?: boolean
  className?: string
}

/**
 * Every figure in the app renders through here.
 *
 * Two rules it exists to enforce: amounts are tabular monospace and
 * right-aligned so columns line up, and colour encodes sign and nothing else.
 */
export function Amount({
  centavos,
  size = 'md',
  tone = 'auto',
  absolute = false,
  signed = false,
  compact = false,
  symbol = true,
  cents = true,
  className,
}: AmountProps) {
  const sign = signOf(centavos)
  const coloured =
    tone === 'none' || (tone === 'expense' && sign === 'negative')
      ? undefined
      : sign === 'positive'
        ? 'text-jade'
        : sign === 'negative'
          ? 'text-rose'
          : undefined

  const text = compact
    ? formatCompact(centavos, { symbol, absolute })
    : formatCentavos(centavos, { symbol, cents, signed, absolute })

  return (
    <span className={cn('figure', SIZES[size], coloured, className)}>{text}</span>
  )
}
