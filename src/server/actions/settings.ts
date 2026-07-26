'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { startOfMonth, today } from '@/lib/dates'
import type { Account, Category, Profile } from '@/lib/db/types'
import { bookAdjustment, recordStatement } from './debt'

type Result = { ok: true } | { ok: false; error: string }

const accountPatch = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(60).optional(),
  isActive: z.boolean().optional(),
  apr: z.number().nullable().optional(),
  dueDay: z.number().int().min(1).max(31).nullable().optional(),
  creditLimitCentavos: z.number().int().nullable().optional(),
  trackingMode: z.enum(['itemized', 'statement_only']).optional(),
  openingBalanceCentavos: z.number().int().optional(),
})

export async function updateAccount(raw: unknown): Promise<Result> {
  const parsed = accountPatch.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Invalid change' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  const { id, ...rest } = parsed.data
  const patch: Partial<Account> = {}
  if (rest.name !== undefined) patch.name = rest.name
  if (rest.isActive !== undefined) patch.is_active = rest.isActive
  if (rest.apr !== undefined) patch.apr = rest.apr
  if (rest.dueDay !== undefined) patch.due_day = rest.dueDay
  if (rest.creditLimitCentavos !== undefined) patch.credit_limit_centavos = rest.creditLimitCentavos
  if (rest.trackingMode !== undefined) patch.tracking_mode = rest.trackingMode
  if (rest.openingBalanceCentavos !== undefined) {
    patch.opening_balance_centavos = rest.openingBalanceCentavos
  }

  const { error } = await supabase
    .from('accounts')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/settings/accounts')
  revalidatePath('/')
  return { ok: true }
}

const newAccount = z.object({
  name: z.string().trim().min(1).max(60),
  type: z.enum(['bank', 'ewallet', 'cash', 'credit', 'loan']),
  openingBalanceCentavos: z.number().int(),
})

export async function createAccount(raw: unknown): Promise<Result> {
  const parsed = newAccount.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Give it a name' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  const isLiability = parsed.data.type === 'credit' || parsed.data.type === 'loan'

  const { error } = await supabase.from('accounts').insert({
    user_id: user.id,
    name: parsed.data.name,
    type: parsed.data.type,
    // A liability carries a negative balance; the form collects a magnitude.
    opening_balance_centavos: isLiability
      ? -Math.abs(parsed.data.openingBalanceCentavos)
      : parsed.data.openingBalanceCentavos,
    opening_date: today(),
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/settings/accounts')
  revalidatePath('/')
  return { ok: true }
}

/** Deactivate rather than delete: history has to keep pointing somewhere. */
export async function archiveAccount(id: string): Promise<Result> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  const { error } = await supabase
    .from('accounts')
    .update({ is_active: false })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/settings/accounts')
  return { ok: true }
}

const categoryPatch = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(60).optional(),
  group: z.enum(['income', 'bills', 'subscriptions', 'expenses', 'savings', 'debt']).optional(),
  dueDay: z.number().int().min(1).max(31).nullable().optional(),
  sortOrder: z.number().int().optional(),
  rolloverEnabled: z.boolean().optional(),
  isArchived: z.boolean().optional(),
})

export async function updateCategory(raw: unknown): Promise<Result> {
  const parsed = categoryPatch.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Invalid change' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  const { id, ...rest } = parsed.data
  const patch: Partial<Category> = {}
  if (rest.name !== undefined) patch.name = rest.name
  if (rest.group !== undefined) patch.group = rest.group
  if (rest.dueDay !== undefined) patch.due_day = rest.dueDay
  if (rest.sortOrder !== undefined) patch.sort_order = rest.sortOrder
  if (rest.rolloverEnabled !== undefined) patch.rollover_enabled = rest.rolloverEnabled
  if (rest.isArchived !== undefined) patch.is_archived = rest.isArchived

  const { error } = await supabase
    .from('categories')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/settings/categories')
  revalidatePath('/budget')
  return { ok: true }
}

export async function createCategory(
  name: string,
  group: 'income' | 'bills' | 'subscriptions' | 'expenses' | 'savings' | 'debt',
): Promise<Result> {
  const parsed = z.object({ name: z.string().trim().min(1).max(60) }).safeParse({ name })
  if (!parsed.success) return { ok: false, error: 'Give it a name' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  const { error } = await supabase
    .from('categories')
    .insert({ user_id: user.id, name: parsed.data.name, group, sort_order: 999 })

  if (error) return { ok: false, error: error.message }
  revalidatePath('/settings/categories')
  return { ok: true }
}

/**
 * Reconciliation: enter what the statement says, see the delta against what
 * the app derived. The gap catches missed transactions without corrupting
 * history — and for a credit account, the same input is the debt tracker.
 */
export async function recordReconciliation(
  accountId: string,
  statementBalanceCentavos: number,
): Promise<Result> {
  return recordStatement({
    accountId,
    month: startOfMonth(today()),
    statementBalanceCentavos,
  })
}

export async function bookReconciliationAdjustment(
  accountId: string,
  deltaCentavos: number,
): Promise<Result> {
  return bookAdjustment(accountId, deltaCentavos)
}

const profilePatch = z.object({
  activeYear: z.number().int().min(2000).max(2200).optional(),
  paydayDays: z.array(z.number().int().min(1).max(31)).min(1).max(6).optional(),
})

export async function updateProfile(raw: unknown): Promise<Result> {
  const parsed = profilePatch.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Invalid change' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  const patch: Partial<Profile> = {}
  if (parsed.data.activeYear !== undefined) patch.active_year = parsed.data.activeYear
  if (parsed.data.paydayDays !== undefined) {
    patch.payday_days = [...new Set(parsed.data.paydayDays)].sort((a, b) => a - b)
  }

  const { error } = await supabase.from('profiles').update(patch).eq('user_id', user.id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
