'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { extractReceipt } from '@/lib/extraction/extract'
import { findDuplicate, type CandidateRow } from '@/lib/extraction/dedupe'
import { hasExtractionKey } from '@/lib/env'
import type { ImageKind } from '@/lib/db/types'

export type ReceiptResult =
  | { ok: true; receiptId: string }
  | { ok: false; error: string }

/**
 * Store an uploaded receipt and kick off extraction.
 *
 * The row is created before extraction runs so that a failure still leaves the
 * image saved and linked — extraction failure must never be a dead end, and a
 * receipt that vanished because the model timed out is worse than one that
 * needs typing.
 */
export async function ingestReceipt(formData: FormData): Promise<ReceiptResult> {
  const file = formData.get('image')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'No image received.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${user.id}/${crypto.randomUUID()}.${extension}`

  const { error: uploadError } = await supabase.storage
    .from('receipts')
    .upload(path, file, { contentType: file.type, upsert: false })

  if (uploadError) return { ok: false, error: uploadError.message }

  const { data: receipt, error: insertError } = await supabase
    .from('receipts')
    .insert({
      user_id: user.id,
      storage_path: path,
      status: 'pending',
      image_kind: null,
      raw_extraction: null,
      error: null,
      duplicate_of: null,
    })
    .select('id')
    .single()

  if (insertError) return { ok: false, error: insertError.message }

  await runExtraction(receipt.id)

  revalidatePath('/add')
  return { ok: true, receiptId: receipt.id }
}

/**
 * Run (or re-run) extraction for a stored receipt.
 *
 * Every failure path writes an `error` on the row and leaves the status at
 * 'failed' rather than throwing: the review screen reads that and drops
 * straight to the manual form with the image attached.
 */
export async function runExtraction(
  receiptId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  const { data: receipt } = await supabase
    .from('receipts')
    .select('*')
    .eq('id', receiptId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!receipt) return { ok: false, error: 'Receipt not found' }

  if (!hasExtractionKey()) {
    await supabase
      .from('receipts')
      .update({
        status: 'failed',
        error: 'Extraction is not configured. Enter the details by hand.',
      })
      .eq('id', receiptId)
    return { ok: false, error: 'Extraction is not configured.' }
  }

  const { data: download, error: downloadError } = await supabase.storage
    .from('receipts')
    .download(receipt.storage_path)

  if (downloadError || !download) {
    await supabase
      .from('receipts')
      .update({ status: 'failed', error: downloadError?.message ?? 'Image unavailable' })
      .eq('id', receiptId)
    return { ok: false, error: 'Could not read the stored image.' }
  }

  const base64 = Buffer.from(await download.arrayBuffer()).toString('base64')
  const mediaType =
    download.type === 'image/png'
      ? 'image/png'
      : download.type === 'image/webp'
        ? 'image/webp'
        : 'image/jpeg'

  const result = await extractReceipt(base64, mediaType)

  await supabase
    .from('receipts')
    .update({
      status: result.ok ? 'extracted' : 'failed',
      image_kind: (result.extraction?.image_kind ?? null) as ImageKind | null,
      raw_extraction: result.raw ?? null,
      error: result.error,
    })
    .eq('id', receiptId)

  revalidatePath(`/add/review/${receiptId}`)
  return { ok: result.ok, error: result.error ?? undefined }
}

const commitInput = z.object({
  receiptId: z.string().uuid(),
  rows: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        detail: z.string().trim().max(200),
        amountCentavos: z.number().int().positive(),
        direction: z.enum(['expense', 'income']),
        categoryId: z.string().uuid().nullable(),
        accountId: z.string().uuid(),
        referenceNo: z.string().trim().max(80).nullable(),
        feeCentavos: z.number().int().nonnegative().nullable(),
      }),
    )
    .min(1),
})

/**
 * Commit a reviewed draft.
 *
 * Only ever called from the review screen, never automatically. When
 * confidence is high the review is one tap — but it is still a tap.
 */
export async function commitReceipt(
  raw: unknown,
): Promise<
  | { ok: true; ids: string[] }
  | { ok: false; duplicate: true; existingId: string; existingDate: string }
  | { ok: false; error: string }
> {
  const parsed = commitInput.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid draft' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  const { rows, receiptId } = parsed.data
  const ids: string[] = []

  for (const row of rows) {
    const signed = row.direction === 'expense' ? -row.amountCentavos : row.amountCentavos

    const { data, error } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        date: row.date,
        detail: row.detail,
        amount_centavos: signed,
        category_id: row.categoryId,
        account_id: row.accountId,
        note: null,
        reference_no: row.referenceNo || null,
        receipt_id: receiptId,
        parent_id: null,
        recurring_rule_id: null,
        is_pending: false,
      })
      .select('id')
      .single()

    if (error) {
      if (error.code === '23505' && row.referenceNo) {
        const { data: existing } = await supabase
          .from('transactions')
          .select('id, date')
          .eq('user_id', user.id)
          .eq('reference_no', row.referenceNo)
          .is('deleted_at', null)
          .maybeSingle()

        if (existing) {
          await supabase
            .from('receipts')
            .update({ status: 'duplicate', duplicate_of: existing.id })
            .eq('id', receiptId)
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

    ids.push(data.id)

    // The fee rides as a linked child so the merchant expense stays clean and
    // fee totals stay queryable across the year.
    if (row.feeCentavos && row.feeCentavos > 0) {
      const { data: feeCategory } = await supabase
        .from('categories')
        .select('id')
        .eq('user_id', user.id)
        .ilike('name', 'Bank Fees')
        .is('deleted_at', null)
        .maybeSingle()

      await supabase.from('transactions').insert({
        user_id: user.id,
        date: row.date,
        detail: `${row.detail || 'Transaction'} — fee`,
        amount_centavos: -row.feeCentavos,
        category_id: feeCategory?.id ?? null,
        account_id: row.accountId,
        note: null,
        reference_no: null,
        receipt_id: receiptId,
        parent_id: data.id,
        recurring_rule_id: null,
        is_pending: false,
      })
    }
  }

  await supabase.from('receipts').update({ status: 'confirmed' }).eq('id', receiptId)

  revalidatePath('/')
  revalidatePath('/transactions')
  return { ok: true, ids }
}

/**
 * Check a draft row against what's already logged, before the user commits.
 *
 * The unique index is the hard guarantee; this is the soft one, so the review
 * screen can warn about a same-amount-same-day near-miss that has no reference
 * number to key on.
 */
export async function checkDuplicate(input: {
  date: string
  amountCentavos: number
  accountId: string
  referenceNo: string | null
  occurredAt?: string
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { kind: 'none' as const }

  const { data } = await supabase
    .from('transactions')
    .select('id, date, amount_centavos, account_id, reference_no, created_at')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .eq('date', input.date)
    .limit(50)

  const candidates: CandidateRow[] = (data ?? []).map((row) => ({
    id: row.id,
    date: row.date,
    amount_centavos: row.amount_centavos,
    account_id: row.account_id,
    reference_no: row.reference_no,
    created_at: row.created_at,
  }))

  return findDuplicate(
    {
      date: input.date,
      amount_centavos: -Math.abs(input.amountCentavos),
      account_id: input.accountId,
      reference_no: input.referenceNo,
      ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
    },
    candidates,
  )
}

/** A time-limited URL for a private receipt image. */
export async function receiptImageUrl(storagePath: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase.storage.from('receipts').createSignedUrl(storagePath, 60 * 60)
  return data?.signedUrl ?? null
}
