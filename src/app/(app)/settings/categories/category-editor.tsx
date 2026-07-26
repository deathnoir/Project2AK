'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button, Card, CardHeader, Input, Muted, Select } from '@/components/ui/primitives'
import { GROUP_LABEL, GROUP_ORDER } from '@/lib/domain/budget'
import { createCategory, updateCategory } from '@/server/actions/settings'
import type { Category, CategoryGroup } from '@/lib/db/types'
import { cn } from '@/lib/cn'

export function CategoryEditor({ categories }: { categories: Category[] }) {
  return (
    <div className="space-y-4">
      {GROUP_ORDER.map((group) => {
        const rows = categories.filter((c) => c.group === group)
        if (rows.length === 0) return null
        return (
          <Card key={group}>
            <CardHeader title={GROUP_LABEL[group]} />
            <ul className="divide-y divide-rule">
              {rows.map((category) => (
                <CategoryRow key={category.id} category={category} />
              ))}
            </ul>
          </Card>
        )
      })}
      <AddCategory />
    </div>
  )
}

function CategoryRow({ category }: { category: Category }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState(category.name)
  const [dueDay, setDueDay] = useState(category.due_day?.toString() ?? '')
  const [rollover, setRollover] = useState(category.rollover_enabled)

  function save(patch: Record<string, unknown> = {}) {
    startTransition(async () => {
      await updateCategory({
        id: category.id,
        name,
        dueDay: dueDay ? Number(dueDay) : null,
        rolloverEnabled: rollover,
        ...patch,
      })
      router.refresh()
    })
  }

  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2.5">
      <Input
        aria-label="Name"
        className={cn('min-w-[8rem] flex-1', category.is_archived && 'text-ink-25 line-through')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => save()}
      />
      <Input
        aria-label="Due day"
        className="figure w-16 text-center"
        inputMode="numeric"
        placeholder="Due"
        value={dueDay}
        onChange={(e) => setDueDay(e.target.value)}
        onBlur={() => save()}
      />
      <label className="flex items-center gap-1.5 text-xs text-ink-45">
        <input
          type="checkbox"
          checked={rollover}
          className="size-4 accent-[#10182B]"
          onChange={(e) => {
            setRollover(e.target.checked)
            save({ rolloverEnabled: e.target.checked })
          }}
        />
        Rollover
      </label>
      <Button
        variant="quiet"
        className="min-h-[2.25rem] px-2 text-xs"
        disabled={pending}
        onClick={() => save({ isArchived: !category.is_archived })}
      >
        {category.is_archived ? 'Restore' : 'Archive'}
      </Button>
    </li>
  )
}

function AddCategory() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [group, setGroup] = useState<CategoryGroup>('expenses')

  return (
    <Card>
      <CardHeader title="Add a category" />
      <div className="flex flex-wrap gap-2 p-3">
        <Input
          aria-label="Name"
          className="min-w-[8rem] flex-1"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Select
          aria-label="Group"
          className="w-40"
          value={group}
          onChange={(e) => setGroup(e.target.value as CategoryGroup)}
        >
          {GROUP_ORDER.map((option) => (
            <option key={option} value={option}>
              {GROUP_LABEL[option]}
            </option>
          ))}
        </Select>
        <Button
          variant="primary"
          disabled={pending || name.trim() === ''}
          onClick={() =>
            startTransition(async () => {
              await createCategory(name, group)
              setName('')
              router.refresh()
            })
          }
        >
          Add
        </Button>
      </div>
      <p className="border-t border-rule px-3 py-2">
        <Muted className="text-xs">
          Archive rather than delete — a deleted category orphans every transaction that
          pointed at it.
        </Muted>
      </p>
    </Card>
  )
}
