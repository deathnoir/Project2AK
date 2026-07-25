'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { INPUT_CLASS } from '@/components/ui/primitives'
import { inferCategory, recentMerchants } from '@/server/actions/transactions'
import { cn } from '@/lib/cn'

/**
 * Merchant field with autocomplete from the user's own history.
 *
 * On blur it also infers the category — deterministically, from the last time
 * this merchant was tagged. That single lookup is what turns a four-field form
 * into a two-tap one for anything bought before.
 */
export function MerchantInput({
  value,
  onChange,
  onCategoryInferred,
  disabled,
}: {
  value: string
  onChange: (next: string) => void
  onCategoryInferred: (categoryId: string) => void
  disabled?: boolean
}) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [, startTransition] = useTransition()
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (disabled) return
    const handle = setTimeout(() => {
      startTransition(async () => {
        setSuggestions(await recentMerchants(value))
      })
    }, 150)
    return () => clearTimeout(handle)
  }, [value, disabled])

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  function commit(next: string) {
    onChange(next)
    setOpen(false)
    if (!next.trim()) return
    startTransition(async () => {
      const categoryId = await inferCategory(next)
      if (categoryId) onCategoryInferred(categoryId)
    })
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        className={INPUT_CLASS}
        value={value}
        disabled={disabled}
        placeholder="Where?"
        autoComplete="off"
        aria-label="Merchant or detail"
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => commit(value)}
      />
      {open && suggestions.length > 0 ? (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-[6px] border border-rule-strong bg-paper shadow-sm">
          {suggestions.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                // onMouseDown fires before the input's blur, so the click
                // isn't swallowed by the dropdown closing first.
                onMouseDown={(e) => {
                  e.preventDefault()
                  commit(suggestion)
                }}
                className={cn(
                  'block w-full px-3 py-2 text-left text-sm hover:bg-paper-sunk',
                  suggestion === value && 'font-medium',
                )}
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
