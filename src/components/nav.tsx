'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/cn'

/**
 * Five screens plus settings. Thirteen was too many for one person to
 * maintain.
 *
 * Bottom bar on phones because the app is used one-handed while standing at a
 * counter; a top rail on desktop where review happens.
 */
const ITEMS = [
  { href: '/', label: 'Dashboard', short: 'Home' },
  { href: '/add', label: 'Add', short: 'Add' },
  { href: '/transactions', label: 'Transactions', short: 'Log' },
  { href: '/budget', label: 'Budget', short: 'Budget' },
  { href: '/debt', label: 'Debt', short: 'Debt' },
  { href: '/settings', label: 'Settings', short: 'Settings' },
] as const

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)
}

export function Nav() {
  const pathname = usePathname()

  return (
    <>
      {/* Desktop / tablet */}
      <nav className="no-print sticky top-0 z-20 hidden border-b border-rule bg-paper/95 backdrop-blur md:block">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-1 px-6">
          <span className="mr-4 py-3 text-sm font-semibold tracking-tight">Project2AK</span>
          {ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? 'page' : undefined}
              className={cn(
                'border-b-2 px-3 py-3 text-sm transition-colors',
                isActive(pathname, item.href)
                  ? 'border-ink font-medium text-ink'
                  : 'border-transparent text-ink-45 hover:text-ink',
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      {/* Phone */}
      <nav
        className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-rule bg-paper/95 backdrop-blur md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="mx-auto flex max-w-3xl">
          {ITEMS.map((item) => (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={isActive(pathname, item.href) ? 'page' : undefined}
                className={cn(
                  'flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 text-[0.6875rem]',
                  isActive(pathname, item.href) ? 'font-semibold text-ink' : 'text-ink-45',
                )}
              >
                <span
                  className={cn(
                    'h-0.5 w-5 rounded-full',
                    isActive(pathname, item.href) ? 'bg-ink' : 'bg-transparent',
                  )}
                />
                {item.short}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  )
}
