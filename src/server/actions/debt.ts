'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { startOfMonth, today } from '@/lib/dates'

type Result = { ok: true } | { ok: false; error: string }

const statementInput = z.object({
  accountId: z.string().uuid(),
  /** Any date in the statement month; stored as the first of that month. */
  month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Signed, same convention as balances: negative on a credit account. */
  statementBalanceCentavos: z.number().int(),
  note: z.string().trim().max(200).nullable().optional(),
})

/**
 * Record what the provider says you owe.
 *
 * This one input does double duty: reconciliation for bank accounts, and the
 * debt tracker for credit accounts. The gap against the derived balance is
 * unlogged interest or fees — which is strictly better than deriving payments
 * as lag(balance) − balance, because that merged principal and interest into a
 * single number and you could never separate them again.
 */
export async function recordStatement(raw: unknown): Promise<Result> {
  const parsed = statementInput.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid statement' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  const { error } = await supabase.from('account_statements').upsert(
    {
      user_id: user.id,
      account_id: parsed.data.accountId,
      month: startOfMonth(parsed.data.month),
      statement_balance_centavos: parsed.data.statementBalanceCentavos,
      note: parsed.data.note ?? null,
      reconciled_at: new Date().toISOString(),
    },
    { onConflict: 'account_id,month' },
  )

  if (error) return { ok: false, error: error.message }

  revalidatePath('/debt')
  revalidatePath('/settings/reconciliation')
  return { ok: true }
}

/**
 * Book the statement gap as an adjustment.
 *
 * On a credit account the gap is almost always unlogged interest or fees, so
 * it posts to Finance Charges — an expense, because it is the cost of using
 * someone else's money. On a bank account it is a missed transaction, and it
 * posts uncategorised for the user to sort out; guessing a category there
 * would put a fabricated number in a real budget line.
 */
export async function bookAdjustment(
  accountId: string,
  deltaCentavos: number,
): Promise<Result> {
  if (deltaCentavos === 0) return { ok: true }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  const { data: account } = await supabase
    .from('accounts')
    .select('id, type')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!account) return { ok: false, error: 'Account not found' }

  const isLiability = account.type === 'credit' || account.type === 'loan'

  let categoryId: string | null = null
  if (isLiability) {
    const { data: category } = await supabase
      .from('categories')
      .select('id')
      .eq('user_id', user.id)
      .ilike('name', 'Finance Charges')
      .is('deleted_at', null)
      .maybeSingle()
    categoryId = category?.id ?? null
  }

  const { error } = await supabase.from('transactions').insert({
    user_id: user.id,
    date: today(),
    detail: isLiability ? 'Interest and fees (reconciliation)' : 'Reconciliation adjustment',
    amount_centavos: deltaCentavos,
    category_id: categoryId,
    account_id: accountId,
    note: 'Booked from a statement reconciliation.',
    is_pending: false,
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/debt')
  revalidatePath('/settings/reconciliation')
  revalidatePath('/')
  return { ok: true }
}

/**
 * Close an account with the provider.
 *
 * This is the milestone the Debt screen counts — not payoff. A credit line at
 * ₱0 is not finished; the credit is available again, and the balance hitting
 * zero is exactly when the operator invites you to use it. The closure
 * reference number goes in the note because that is what you need if they say
 * they never received the request.
 */
export async function markAccountClosed(
  accountId: string,
  reference: string,
): Promise<Result> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  const { error } = await supabase
    .from('accounts')
    .update({
      closed_at: new Date().toISOString(),
      closure_confirmed: true,
      closure_note: reference.trim() || null,
      is_active: false,
    })
    .eq('id', accountId)
    .eq('user_id', user.id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/debt')
  revalidatePath('/')
  return { ok: true }
}

export async function reopenAccount(accountId: string): Promise<Result> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  const { error } = await supabase
    .from('accounts')
    .update({
      closed_at: null,
      closure_confirmed: false,
      closure_note: null,
      is_active: true,
    })
    .eq('id', accountId)
    .eq('user_id', user.id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/debt')
  return { ok: true }
}
