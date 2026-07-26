'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

type Result = { ok: true } | { ok: false; error: string }

const setBudgetInput = z.object({
  categoryId: z.string().uuid(),
  year: z.number().int().min(2000).max(2200),
  month: z.number().int().min(1).max(12),
  // Budgets are unsigned magnitudes — "₱5,000 for groceries" is how a person
  // thinks, and v_budget_vs_actual flips the sign of actuals to match.
  amountCentavos: z.number().int().nonnegative('A budget cannot be negative'),
})

export async function setBudget(raw: unknown): Promise<Result> {
  const parsed = setBudgetInput.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid budget' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  const { error } = await supabase.from('budgets').upsert(
    {
      user_id: user.id,
      category_id: parsed.data.categoryId,
      year: parsed.data.year,
      month: parsed.data.month,
      amount_centavos: parsed.data.amountCentavos,
    },
    { onConflict: 'category_id,year,month' },
  )

  if (error) return { ok: false, error: error.message }

  revalidatePath('/budget')
  revalidatePath('/')
  return { ok: true }
}

const copyInput = z.object({
  year: z.number().int().min(2000).max(2200),
  fromMonth: z.number().int().min(1).max(12),
})

/**
 * Copy a month's allocations across the rest of the year.
 *
 * Income is copied too. Carrying only the outgoings forward leaves every later
 * month permanently over-allocated, and the allocation bar never reaches zero
 * again.
 */
export async function copyMonthToRestOfYear(raw: unknown): Promise<Result> {
  const parsed = copyInput.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Invalid month' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  const { data: source } = await supabase
    .from('budgets')
    .select('category_id, amount_centavos')
    .eq('user_id', user.id)
    .eq('year', parsed.data.year)
    .eq('month', parsed.data.fromMonth)

  if (!source || source.length === 0) {
    return { ok: false, error: 'Nothing budgeted in that month yet.' }
  }

  const rows = []
  for (let month = parsed.data.fromMonth + 1; month <= 12; month++) {
    for (const budget of source) {
      rows.push({
        user_id: user.id,
        category_id: budget.category_id,
        year: parsed.data.year,
        month,
        amount_centavos: budget.amount_centavos,
      })
    }
  }

  const { error } = await supabase
    .from('budgets')
    .upsert(rows, { onConflict: 'category_id,year,month' })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/budget')
  return { ok: true }
}

export async function markPaid(
  categoryId: string,
  year: number,
  month: number,
  isPaid: boolean,
): Promise<Result> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  const { error } = await supabase.from('budgets').upsert(
    { user_id: user.id, category_id: categoryId, year, month, is_paid: isPaid },
    { onConflict: 'category_id,year,month' },
  )

  if (error) return { ok: false, error: error.message }

  revalidatePath('/budget')
  revalidatePath('/')
  return { ok: true }
}
