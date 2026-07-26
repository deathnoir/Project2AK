'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { nextOccurrence, today } from '@/lib/dates'

type Result = { ok: true } | { ok: false; error: string }

const UNIQUE_VIOLATION = '23505'

/**
 * Generate the pending rows that are due.
 *
 * Idempotent by construction: a partial unique index on
 * (recurring_rule_id, date) means a second call for the same occurrence raises
 * 23505, which is treated as "already generated". That is what makes it safe
 * to call on every dashboard load rather than needing a cron.
 *
 * Generated rows are PENDING. They post nothing, move no balance, and appear
 * in no actual until the user confirms.
 */
export async function generateDueTransactions(): Promise<{ ok: boolean; created: number }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, created: 0 }

  const now = today()

  const { data: rules } = await supabase
    .from('recurring_rules')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .is('deleted_at', null)
    .lte('next_run', now)

  if (!rules || rules.length === 0) return { ok: true, created: 0 }

  let created = 0

  for (const rule of rules) {
    if (rule.end_date && rule.next_run > rule.end_date) {
      await supabase.from('recurring_rules').update({ is_active: false }).eq('id', rule.id)
      continue
    }

    // "Same as last time": resolve a null amount from what this rule last
    // generated, so a variable bill still lands with a sensible draft.
    let amount = rule.amount_centavos
    if (amount === null) {
      const table = rule.to_account_id ? 'transfers' : 'transactions'
      const { data: last } = await supabase
        .from(table)
        .select('amount_centavos')
        .eq('recurring_rule_id', rule.id)
        .is('deleted_at', null)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle()
      amount = last?.amount_centavos ?? null
    }
    if (amount === null || amount === 0) continue

    if (rule.to_account_id) {
      // A rule with a destination account generates a TRANSFER. This is how
      // installments work: cash down, liability down, and no expense, because
      // the expense already happened at purchase.
      const { error } = await supabase.from('transfers').insert({
        user_id: user.id,
        date: rule.next_run,
        amount_centavos: Math.abs(amount),
        from_account_id: rule.account_id,
        to_account_id: rule.to_account_id,
        note: rule.name,
        recurring_rule_id: rule.id,
        is_pending: true,
      })
      if (!error) created++
      else if (error.code !== UNIQUE_VIOLATION) continue
    } else {
      const { error } = await supabase.from('transactions').insert({
        user_id: user.id,
        date: rule.next_run,
        detail: rule.name,
        amount_centavos: amount,
        category_id: rule.category_id,
        account_id: rule.account_id,
        recurring_rule_id: rule.id,
        is_pending: true,
      })
      if (!error) created++
      else if (error.code !== UNIQUE_VIOLATION) continue
    }

    await supabase
      .from('recurring_rules')
      .update({ next_run: nextOccurrence(rule, rule.next_run) })
      .eq('id', rule.id)
  }

  if (created > 0) revalidatePath('/')
  return { ok: true, created }
}

export async function confirmPending(
  id: string,
  kind: 'transaction' | 'transfer',
): Promise<Result> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  const { error } = await supabase
    .from(kind === 'transfer' ? 'transfers' : 'transactions')
    .update({ is_pending: false })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/')
  revalidatePath('/transactions')
  revalidatePath('/budget')
  return { ok: true }
}

const editAndConfirmInput = z.object({
  id: z.string().uuid(),
  kind: z.enum(['transaction', 'transfer']),
  amountCentavos: z.number().int(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export async function editAndConfirmPending(raw: unknown): Promise<Result> {
  const parsed = editAndConfirmInput.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Invalid change' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  const { id, kind, amountCentavos, date } = parsed.data
  const { error } = await supabase
    .from(kind === 'transfer' ? 'transfers' : 'transactions')
    .update({
      // A transfer's amount is a magnitude; a transaction's carries its sign.
      amount_centavos: kind === 'transfer' ? Math.abs(amountCentavos) : amountCentavos,
      date,
      is_pending: false,
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/')
  revalidatePath('/transactions')
  return { ok: true }
}

/** Skip soft-deletes the generated row; the rule itself carries on. */
export async function skipPending(
  id: string,
  kind: 'transaction' | 'transfer',
): Promise<Result> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  const { error } = await supabase
    .from(kind === 'transfer' ? 'transfers' : 'transactions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/')
  return { ok: true }
}

const ruleInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  categoryId: z.string().uuid().nullable(),
  accountId: z.string().uuid(),
  toAccountId: z.string().uuid().nullable(),
  amountCentavos: z.number().int().nullable(),
  direction: z.enum(['expense', 'income']).default('expense'),
  frequency: z.enum(['monthly', 'yearly', 'every_n_months']),
  intervalMonths: z.number().int().min(1).max(60).default(1),
  dayOfMonth: z.number().int().min(1).max(31),
  monthOfYear: z.number().int().min(1).max(12).nullable(),
  nextRun: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  isActive: z.boolean().default(true),
})

export async function saveRule(raw: unknown): Promise<Result> {
  const parsed = ruleInput.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid rule' }
  }
  const input = parsed.data

  // A rule is either a categorised entry or a transfer, never both — the
  // schema enforces it, but failing here gives a readable message.
  if (input.toAccountId && input.categoryId) {
    return { ok: false, error: 'A transfer rule has no category.' }
  }
  if (!input.toAccountId && !input.categoryId) {
    return { ok: false, error: 'Pick a category, or a destination account for a transfer.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  const signedAmount =
    input.amountCentavos === null
      ? null
      : input.toAccountId
        ? Math.abs(input.amountCentavos)
        : input.direction === 'expense'
          ? -Math.abs(input.amountCentavos)
          : Math.abs(input.amountCentavos)

  const row = {
    ...(input.id ? { id: input.id } : {}),
    user_id: user.id,
    name: input.name,
    category_id: input.toAccountId ? null : input.categoryId,
    account_id: input.accountId,
    to_account_id: input.toAccountId,
    amount_centavos: signedAmount,
    frequency: input.frequency,
    interval_months: input.intervalMonths,
    day_of_month: input.dayOfMonth,
    month_of_year: input.frequency === 'yearly' ? input.monthOfYear : null,
    next_run: input.nextRun,
    end_date: input.endDate,
    is_active: input.isActive,
  }

  const { error } = await supabase.from('recurring_rules').upsert(row, { onConflict: 'id' })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/settings/recurring')
  revalidatePath('/')
  return { ok: true }
}

export async function deleteRule(id: string): Promise<Result> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  const { error } = await supabase
    .from('recurring_rules')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/settings/recurring')
  return { ok: true }
}
