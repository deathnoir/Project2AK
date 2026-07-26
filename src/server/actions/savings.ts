'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

type Result = { ok: true } | { ok: false; error: string }

const goalInput = z.object({
  id: z.string().uuid().optional(),
  categoryId: z.string().uuid(),
  /**
   * Set to track a dedicated savings account (the transfer model — salary
   * lands in the bank, a transfer moves it across). Leave null and the goal
   * tracks contributions budgeted to its category, which is how a sinking
   * fund naturally works.
   */
  accountId: z.string().uuid().nullable(),
  kind: z.enum(['goal', 'sinking']),
  goalAmountCentavos: z.number().int().nonnegative().nullable(),
  startingAmountCentavos: z.number().int().nonnegative().default(0),
  monthlyAmountCentavos: z.number().int().nonnegative().nullable(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  /**
   * The 2AK line. Goals tagged with a beneficiary sum into one quiet line
   * under safe-to-spend; untagged goals behave exactly as before.
   */
  beneficiary: z.string().trim().max(40).nullable(),
})

export async function saveGoal(raw: unknown): Promise<Result> {
  const parsed = goalInput.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid goal' }
  }
  const input = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  const { error } = await supabase.from('savings_goals').upsert(
    {
      ...(input.id ? { id: input.id } : {}),
      user_id: user.id,
      category_id: input.categoryId,
      account_id: input.accountId,
      kind: input.kind,
      goal_amount_centavos: input.goalAmountCentavos,
      starting_amount_centavos: input.startingAmountCentavos,
      monthly_amount_centavos: input.monthlyAmountCentavos,
      target_date: input.targetDate,
      beneficiary: input.beneficiary || null,
    },
    { onConflict: 'category_id' },
  )

  if (error) return { ok: false, error: error.message }

  revalidatePath('/settings/savings')
  revalidatePath('/')
  return { ok: true }
}

export async function deleteGoal(id: string): Promise<Result> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  const { error } = await supabase
    .from('savings_goals')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/settings/savings')
  revalidatePath('/')
  return { ok: true }
}

export async function setNoSpendGoal(
  year: number,
  month: number,
  goalDays: number,
): Promise<Result> {
  const parsed = z
    .object({
      year: z.number().int().min(2000).max(2200),
      month: z.number().int().min(1).max(12),
      goalDays: z.number().int().min(0).max(31),
    })
    .safeParse({ year, month, goalDays })
  if (!parsed.success) return { ok: false, error: 'Invalid goal' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  const { error } = await supabase.from('no_spend_goals').upsert(
    {
      user_id: user.id,
      year: parsed.data.year,
      month: parsed.data.month,
      goal_days: parsed.data.goalDays,
    },
    { onConflict: 'user_id,year,month' },
  )

  if (error) return { ok: false, error: error.message }

  revalidatePath('/')
  return { ok: true }
}
