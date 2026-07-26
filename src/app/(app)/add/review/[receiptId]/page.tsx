import { notFound } from 'next/navigation'
import { Screen, ScreenTitle } from '@/components/ui/primitives'
import { createClient } from '@/lib/supabase/server'
import { extractionSchema } from '@/lib/extraction/schema'
import { ReviewForm } from '../review-form'

export const metadata = { title: 'Review receipt · Project2AK' }

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ receiptId: string }>
  searchParams: Promise<{ queue?: string }>
}) {
  const { receiptId } = await params
  const { queue } = await searchParams

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const userId = user?.id ?? ''

  const { data: receipt } = await supabase
    .from('receipts')
    .select('*')
    .eq('id', receiptId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!receipt) notFound()

  const [{ data: signed }, { data: accounts }, { data: categories }] = await Promise.all([
    supabase.storage.from('receipts').createSignedUrl(receipt.storage_path, 60 * 60),
    supabase.from('v_account_balances').select('*').eq('is_active', true).order('sort_order'),
    supabase
      .from('categories')
      .select('id, name, group')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .eq('is_archived', false)
      .order('sort_order'),
  ])

  // Re-validate rather than trusting what was stored: a schema change between
  // the extraction and this render would otherwise surface as a crash instead
  // of a fall back to manual entry.
  const parsed = receipt.raw_extraction
    ? extractionSchema.safeParse(receipt.raw_extraction)
    : null

  const duplicateOf = receipt.duplicate_of
    ? await supabase
        .from('transactions')
        .select('id, date')
        .eq('id', receipt.duplicate_of)
        .maybeSingle()
        .then((r) => r.data)
    : null

  return (
    <Screen>
      <ScreenTitle>Review</ScreenTitle>
      <ReviewForm
        receiptId={receipt.id}
        status={receipt.status}
        errorMessage={receipt.error}
        imageUrl={signed?.signedUrl ?? null}
        extraction={parsed?.success ? parsed.data : null}
        accounts={accounts ?? []}
        categories={categories ?? []}
        queue={queue ? queue.split(',').filter(Boolean) : []}
        duplicateOf={duplicateOf}
      />
    </Screen>
  )
}
