import Link from 'next/link'
import { cn } from '@/lib/cn'

/**
 * The whole component vocabulary, in one file.
 *
 * Surfaces are paper with hairline rules — no shadows, no fills, no rounded
 * pills. The only colour anywhere is jade/rose on a figure's sign.
 */

export function Screen({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <main className={cn('mx-auto w-full max-w-3xl px-4 pb-8 pt-4 md:px-6', className)}>
      {children}
    </main>
  )
}

export function ScreenTitle({
  children,
  action,
}: {
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <header className="mb-5 flex items-baseline justify-between gap-3">
      <h1 className="text-xl font-semibold tracking-tight">{children}</h1>
      {action}
    </header>
  )
}

export function Card({
  children,
  className,
  as: Tag = 'section',
}: {
  children: React.ReactNode
  className?: string
  as?: 'section' | 'div' | 'article'
}) {
  return (
    <Tag
      className={cn(
        'rounded-[6px] border border-rule bg-paper',
        className,
      )}
    >
      {children}
    </Tag>
  )
}

export function CardHeader({
  title,
  hint,
  action,
}: {
  title: React.ReactNode
  hint?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-rule px-4 py-3">
      <div className="min-w-0">
        <h2 className="truncate text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-ink-70">
          {title}
        </h2>
        {hint ? <p className="mt-0.5 truncate text-xs text-ink-45">{hint}</p> : null}
      </div>
      {action}
    </div>
  )
}

/** A hairline-separated list. Rows never get their own borders. */
export function Rows({ children, className }: { children: React.ReactNode; className?: string }) {
  return <ul className={cn('divide-y divide-rule', className)}>{children}</ul>
}

export function Row({
  children,
  href,
  onClick,
  className,
}: {
  children: React.ReactNode
  href?: string
  onClick?: () => void
  className?: string
}) {
  const inner = (
    <div className={cn('flex min-h-[3rem] items-center gap-3 px-4 py-2.5', className)}>
      {children}
    </div>
  )
  if (href) {
    return (
      <li>
        <Link href={href} className="block hover:bg-paper-sunk">
          {inner}
        </Link>
      </li>
    )
  }
  if (onClick) {
    return (
      <li>
        <button type="button" onClick={onClick} className="block w-full text-left hover:bg-paper-sunk">
          {inner}
        </button>
      </li>
    )
  }
  return <li>{inner}</li>
}

type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger'

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-paper border-ink hover:opacity-90',
  secondary: 'bg-paper text-ink border-rule-strong hover:bg-paper-sunk',
  quiet: 'bg-transparent text-ink-70 border-transparent hover:text-ink hover:bg-paper-sunk',
  danger: 'bg-paper text-rose border-rose/40 hover:bg-rose-soft',
}

const BUTTON_BASE =
  'inline-flex min-h-[2.75rem] items-center justify-center gap-2 rounded-[6px] border ' +
  'px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45'

export function Button({
  children,
  variant = 'secondary',
  className,
  type = 'button',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button type={type} className={cn(BUTTON_BASE, BUTTON_STYLES[variant], className)} {...rest}>
      {children}
    </button>
  )
}

export function LinkButton({
  children,
  href,
  variant = 'secondary',
  className,
}: {
  children: React.ReactNode
  href: string
  variant?: ButtonVariant
  className?: string
}) {
  return (
    <Link href={href} className={cn(BUTTON_BASE, BUTTON_STYLES[variant], className)}>
      {children}
    </Link>
  )
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: React.ReactNode
  hint?: React.ReactNode
  error?: string | null
  children: React.ReactNode
  htmlFor?: string
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-xs font-medium uppercase tracking-[0.07em] text-ink-45"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-rose">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-45">{hint}</p>
      ) : null}
    </div>
  )
}

export const INPUT_CLASS =
  'w-full min-h-[2.75rem] rounded-[6px] border border-rule-strong bg-paper px-3 text-sm ' +
  'text-ink placeholder:text-ink-25 focus:border-ink focus:outline-none'

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(INPUT_CLASS, props.className)} />
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(INPUT_CLASS, 'pr-8', props.className)} />
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(INPUT_CLASS, 'min-h-[5rem] resize-y py-2', props.className)}
    />
  )
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string
  children?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm font-medium text-ink-70">{title}</p>
      {children ? <p className="mx-auto mt-1 max-w-sm text-sm text-ink-45">{children}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  )
}

/** A warning that is information, not decoration — used for "Open — close this". */
export function Warn({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[4px] border border-rose/35 bg-rose-soft px-1.5 py-0.5 text-[0.6875rem] font-medium text-rose">
      {children}
    </span>
  )
}

export function Muted({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('text-ink-45', className)}>{children}</span>
}

/**
 * The signature element: a single horizontal bar that fills as each peso is
 * assigned and turns jade only at exactly zero left to budget.
 */
export function AllocationBar({
  allocated,
  income,
  className,
}: {
  allocated: number
  income: number
  className?: string
}) {
  const pct = income > 0 ? Math.min((allocated / income) * 100, 100) : 0
  const over = income > 0 && allocated > income
  const exact = income > 0 && allocated === income
  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full bg-paper-sunk', className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Share of income allocated"
    >
      <div
        className={cn(
          'h-full transition-[width] duration-200',
          exact ? 'bg-jade' : over ? 'bg-rose' : 'bg-ink-45',
        )}
        style={{ width: `${over ? 100 : pct}%` }}
      />
    </div>
  )
}
