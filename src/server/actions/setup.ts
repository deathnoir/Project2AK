'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { parseAmount } from '@/lib/money'
import { today } from '@/lib/dates'
import type { AccountType, TrackingMode } from '@/lib/db/types'

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: never } : { data: T }))
  | { ok: false; error: string }

const accountInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'Give it a name').max(60),
  type: z.enum(['bank', 'ewallet', 'cash', 'credit', 'loan']),
  /** As typed: always a positive magnitude. The sign is applied below. */
  openingBalance: z.string(),
  apr: z.string().optional(),
  dueDay: z.string().optional(),
  creditLimit: z.string().optional(),
  trackingMode: z.enum(['itemized', 'statement_only']).optional(),
})

const LIABILITY: readonly AccountType[] = ['credit', 'loan']

export async function saveAccounts(
  raw: unknown,
): Promise<ActionResult<{ count: number }>> {
  const parsed = z.array(accountInput).min(1, 'Declare at least one place money sits').safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid account' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  const rows = parsed.data.map((account, index) => {
    const magnitude = parseAmount(account.openingBalance) ?? 0

    // The user types "2,100" for "I owe ₱2,100 on BillEase" — nobody thinks of
    // their BNPL balance as negative. The sign belongs to the data model, not
    // to the person entering it, so it is applied here rather than in the
    // form. A liability carries a negative balance so that
    // opening + sum(transactions) is the whole story with no special cases.
    const isLiability = LIABILITY.includes(account.type)
    const opening = isLiability ? -Math.abs(magnitude) : magnitude

    const dueDay = account.dueDay ? Number(account.dueDay) : null
    const apr = account.apr ? Number(account.apr) : null
    const creditLimit = account.creditLimit ? parseAmount(account.creditLimit) : null

    return {
      ...(account.id ? { id: account.id } : {}),
      user_id: user.id,
      name: account.name,
      type: account.type,
      opening_balance_centavos: opening,
      // Opening balances are as of today with no back-history: there is
      // nothing to reconcile against, and the year's data is already in the
      // spreadsheet if it is ever wanted.
      opening_date: today(),
      sort_order: index,
      apr: isLiability && apr !== null && Number.isFinite(apr) ? apr : null,
      due_day: isLiability && dueDay && dueDay >= 1 && dueDay <= 31 ? dueDay : null,
      credit_limit_centavos: isLiability ? creditLimit : null,
      tracking_mode: (isLiability ? (account.trackingMode ?? 'itemized') : 'itemized') as TrackingMode,
      is_active: true,
    }
  })

  const { error } = await supabase.from('accounts').upsert(rows, { onConflict: 'id' })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/setup')
  return { ok: true, data: { count: rows.length } }
}

const categoryInput = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
  dueDay: z.string().optional(),
  rolloverEnabled: z.boolean(),
  isArchived: z.boolean(),
})

export async function saveCategories(raw: unknown): Promise<ActionResult> {
  const parsed = z.array(categoryInput).safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Invalid category' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  for (const category of parsed.data) {
    const dueDay = category.dueDay ? Number(category.dueDay) : null
    const { error } = await supabase
      .from('categories')
      .update({
        name: category.name,
        due_day: dueDay && dueDay >= 1 && dueDay <= 31 ? dueDay : null,
        rollover_enabled: category.rolloverEnabled,
        // Archive rather than delete: a deleted category orphans history.
        is_archived: category.isArchived,
      })
      .eq('id', category.id)
      .eq('user_id', user.id)
    if (error) return { ok: false, error: error.message }
  }

  revalidatePath('/setup')
  return { ok: true }
}

const paydayInput = z.object({
  paydayDays: z.array(z.number().int().min(1).max(31)).min(1).max(6),
  activeYear: z.number().int().min(2000).max(2200),
})

export async function savePaydayConfig(raw: unknown): Promise<ActionResult> {
  const parsed = paydayInput.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Pick at least one payday' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  // Upsert, not update: an UPDATE matching zero rows is reported as success by
  // PostgREST, so a missing profile row would silently discard the setting.
  const { error } = await supabase.from('profiles').upsert(
    {
      user_id: user.id,
      payday_days: [...new Set(parsed.data.paydayDays)].sort((a, b) => a - b),
      active_year: parsed.data.activeYear,
    },
    { onConflict: 'user_id' },
  )

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function completeSetup(): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  const { count } = await supabase
    .from('accounts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('deleted_at', null)

  if (!count) {
    // Without at least one account there is nowhere for a transaction to
    // post, so every screen would render ₱0.00 and look broken.
    return { ok: false, error: 'Add at least one place your money sits first.' }
  }

  // Upsert for the same reason as above — this one is worse if it no-ops:
  // setup_done stays false, the app layout redirects straight back to /setup,
  // and the user is in a loop with no error to explain it.
  const { error } = await supabase
    .from('profiles')
    .upsert({ user_id: user.id, setup_done: true }, { onConflict: 'user_id' })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/', 'layout')
  return { ok: true }
}
