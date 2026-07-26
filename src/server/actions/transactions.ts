'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { Transaction } from '@/lib/db/types'

export type TxResult =
  | { ok: true; id: string }
  | { ok: false; duplicate: true; existingId: string; existingDate: string }
  | { ok: false; duplicate?: false; error: string }

/** Postgres unique_violation. The dedup index raises this by design. */
const UNIQUE_VIOLATION = '23505'

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const transactionInput = z.object({
  date: dateString,
  detail: z.string().trim().max(200),
  /** Always a positive magnitude. The sign comes from `direction`. */
  amountCentavos: z.number().int().positive('Enter an amount'),
  direction: z.enum(['expense', 'income']),
  categoryId: z.string().uuid().nullable(),
  accountId: z.string().uuid(),
  note: z.string().trim().max(500).nullable().optional(),
  referenceNo: z.string().trim().max(80).nullable().optional(),
  receiptId: z.string().uuid().nullable().optional(),
  /**
   * A convenience or InstaPay fee printed on the same receipt. Stored as a
   * linked child so the merchant expense stays clean and fee totals stay
   * queryable — not folded into the amount.
   */
  feeCentavos: z.number().int().nonnegative().nullable().optional(),
  feeCategoryId: z.string().uuid().nullable().optional(),
})

export async function createTransaction(raw: unknown): Promise<TxResult> {
  const parsed = transactionInput.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid transaction' }
  }
  const input = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  // The user always types a positive number. Expenses are stored negative so
  // that opening_balance + sum(amount) is the account's whole balance story.
  const signed =
    input.direction === 'expense' ? -input.amountCentavos : input.amountCentavos

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      user_id: user.id,
      date: input.date,
      detail: input.detail,
      amount_centavos: signed,
      category_id: input.categoryId,
      account_id: input.accountId,
      note: input.note ?? null,
      reference_no: input.referenceNo || null,
      receipt_id: input.receiptId ?? null,
      parent_id: null,
      recurring_rule_id: null,
      is_pending: false,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === UNIQUE_VIOLATION && input.referenceNo) {
      // Not an error condition. The same screenshot got shared twice, which
      // is the normal case this index exists to catch — surface the existing
      // row so the caller can say "Already logged on 24 Jul".
      const { data: existing } = await supabase
        .from('transactions')
        .select('id, date')
        .eq('user_id', user.id)
        .eq('reference_no', input.referenceNo)
        .is('deleted_at', null)
        .maybeSingle()
      if (existing) {
        return {
          ok: false,
          duplicate: true,
          existingId: existing.id,
          existingDate: existing.date,
        }
      }
    }
    return { ok: false, error: error.message }
  }

  if (input.feeCentavos && input.feeCentavos > 0) {
    const feeCategoryId = input.feeCategoryId ?? (await findCategoryId(supabase, user.id, 'Bank Fees'))
    await supabase.from('transactions').insert({
      user_id: user.id,
      date: input.date,
      detail: `${input.detail || 'Transaction'} — fee`,
      amount_centavos: -input.feeCentavos,
      category_id: feeCategoryId,
      account_id: input.accountId,
      note: null,
      reference_no: null,
      receipt_id: input.receiptId ?? null,
      parent_id: data.id,
      recurring_rule_id: null,
      is_pending: false,
    })
  }

  revalidatePath('/')
  revalidatePath('/transactions')
  revalidatePath('/budget')
  return { ok: true, id: data.id }
}

const transferInput = z.object({
  date: dateString,
  /** Always positive: a transfer has a direction, not a sign. */
  amountCentavos: z.number().int().positive('Enter an amount'),
  fromAccountId: z.string().uuid(),
  toAccountId: z.string().uuid(),
  note: z.string().trim().max(500).nullable().optional(),
  referenceNo: z.string().trim().max(80).nullable().optional(),
  receiptId: z.string().uuid().nullable().optional(),
})

/**
 * Money moved between two accounts.
 *
 * A transfer is never income and never an expense. Paying a BNPL installment
 * is settling what you already owe — the expense happened at purchase, when
 * the liability was recognised. Booking the payment as an expense too would
 * count the same ₱6,000 twice.
 */
export async function createTransfer(raw: unknown): Promise<TxResult> {
  const parsed = transferInput.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid transfer' }
  }
  const input = parsed.data

  if (input.fromAccountId === input.toAccountId) {
    return { ok: false, error: 'Pick two different accounts' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  const { data, error } = await supabase
    .from('transfers')
    .insert({
      user_id: user.id,
      date: input.date,
      amount_centavos: input.amountCentavos,
      from_account_id: input.fromAccountId,
      to_account_id: input.toAccountId,
      note: input.note ?? null,
      reference_no: input.referenceNo || null,
      receipt_id: input.receiptId ?? null,
      recurring_rule_id: null,
      is_pending: false,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }

  revalidatePath('/')
  revalidatePath('/transactions')
  revalidatePath('/debt')
  return { ok: true, id: data.id }
}

const updateInput = z.object({
  id: z.string().uuid(),
  date: dateString.optional(),
  detail: z.string().trim().max(200).optional(),
  amountCentavos: z.number().int().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  accountId: z.string().uuid().optional(),
  note: z.string().trim().max(500).nullable().optional(),
})

export async function updateTransaction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = updateInput.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Invalid change' }
  const { id, ...rest } = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  const patch: Partial<Transaction> = {}
  if (rest.date !== undefined) patch.date = rest.date
  if (rest.detail !== undefined) patch.detail = rest.detail
  if (rest.amountCentavos !== undefined) patch.amount_centavos = rest.amountCentavos
  if (rest.categoryId !== undefined) patch.category_id = rest.categoryId
  if (rest.accountId !== undefined) patch.account_id = rest.accountId
  if (rest.note !== undefined) patch.note = rest.note

  const { error } = await supabase
    .from('transactions')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/transactions')
  revalidatePath('/budget')
  revalidatePath('/')
  return { ok: true }
}

/**
 * Soft delete. Never a hard delete: financial data where you can't answer
 * "why did this number change" gets abandoned, and the answer is usually in a
 * row someone removed.
 */
export async function softDeleteTransaction(
  id: string,
  kind: 'transaction' | 'transfer' = 'transaction',
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  const table = kind === 'transfer' ? 'transfers' : 'transactions'
  const { error } = await supabase
    .from(table)
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { ok: false, error: error.message }

  // Child fee rows go with their parent — an orphaned ₱15 fee row on the
  // Bank Fees line with nothing attached is noise.
  if (kind === 'transaction') {
    await supabase
      .from('transactions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('parent_id', id)
      .eq('user_id', user.id)
  }

  revalidatePath('/transactions')
  revalidatePath('/budget')
  revalidatePath('/')
  return { ok: true }
}

export async function bulkRecategorise(
  ids: string[],
  categoryId: string,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const parsed = z.object({ ids: z.array(z.string().uuid()).min(1), categoryId: z.string().uuid() })
    .safeParse({ ids, categoryId })
  if (!parsed.success) return { ok: false, error: 'Nothing selected' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  const { error } = await supabase
    .from('transactions')
    .update({ category_id: parsed.data.categoryId })
    .in('id', parsed.data.ids)
    .eq('user_id', user.id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/transactions')
  revalidatePath('/budget')
  return { ok: true, count: parsed.data.ids.length }
}

/**
 * Which category this merchant got last time.
 *
 * Deterministic, from the user's own history, with a prefix match. After you
 * have tagged Jollibee as Eating Out once it is pre-filled forever: free,
 * instant, no API call. A model guess is the fallback for a merchant with no
 * history, and even then it is only a suggestion.
 */
export async function inferCategory(detail: string): Promise<string | null> {
  const trimmed = detail.trim()
  if (trimmed.length < 2) return null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('transactions')
    .select('category_id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .not('category_id', 'is', null)
    .ilike('detail', `${trimmed}%`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data?.category_id ?? null
}

/** Merchant autocomplete from the user's own log — what makes repeat entry fast. */
export async function recentMerchants(prefix: string, limit = 8): Promise<string[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  let query = supabase
    .from('transactions')
    .select('detail')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .neq('detail', '')
    .order('created_at', { ascending: false })
    .limit(120)

  if (prefix.trim()) query = query.ilike('detail', `${prefix.trim()}%`)

  const { data } = await query
  if (!data) return []

  const seen = new Set<string>()
  const out: string[] = []
  for (const row of data) {
    const value = row.detail.trim()
    const key = value.toLowerCase()
    if (!value || seen.has(key)) continue
    seen.add(key)
    out.push(value)
    if (out.length >= limit) break
  }
  return out
}

/** The account the user posted to most recently — the Add screen's default. */
export async function lastUsedAccountId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('transactions')
    .select('account_id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data?.account_id ?? null
}

async function findCategoryId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  name: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('categories')
    .select('id')
    .eq('user_id', userId)
    .ilike('name', name)
    .is('deleted_at', null)
    .maybeSingle()
  return data?.id ?? null
}
