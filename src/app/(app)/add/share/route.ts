import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { siteUrl } from '@/lib/site-url'

/**
 * Web Share Target endpoint.
 *
 * A POST Route Handler, not a page: the browser posts the shared files here
 * from inside the share sheet, and the user is watching a spinner until this
 * redirects.
 *
 * It deliberately does NOT call the vision model. Uploading and redirecting
 * takes a moment; extraction takes seconds, and doing it here means the user
 * stares at the share sheet for the whole round trip — and on a serverless
 * platform it means the request can hit the function timeout and lose the
 * receipt entirely. The review screen extracts on arrival instead, where
 * there's a page to show progress on.
 *
 * Accepts multiple files so batch sharing from Photos works. The manifest
 * declares the field as `image`; Android sends it once per file.
 */
export async function POST(request: NextRequest) {
  const origin = siteUrl(request)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    // Carry the intent through the login round trip rather than dropping the
    // user on the dashboard holding a receipt.
    return NextResponse.redirect(`${origin}/login?next=${encodeURIComponent('/add')}`, 303)
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.redirect(`${origin}/add?share=unreadable`, 303)
  }

  const files = formData
    .getAll('image')
    .filter((entry): entry is File => entry instanceof File && entry.size > 0)

  if (files.length === 0) {
    return NextResponse.redirect(`${origin}/add?share=empty`, 303)
  }

  const receiptIds: string[] = []

  for (const file of files) {
    const extension =
      file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `${user.id}/${crypto.randomUUID()}.${extension}`

    const { error: uploadError } = await supabase.storage
      .from('receipts')
      .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false })
    if (uploadError) continue

    const { data: receipt } = await supabase
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

    if (receipt) receiptIds.push(receipt.id)
  }

  if (receiptIds.length === 0) {
    return NextResponse.redirect(`${origin}/add?share=failed`, 303)
  }

  const first = receiptIds[0]
  const queue = receiptIds.slice(1)
  const suffix = queue.length > 0 ? `?queue=${queue.join(',')}` : ''
  return NextResponse.redirect(`${origin}/add/review/${first}${suffix}`, 303)
}

/**
 * Some Android builds probe the share target with a GET before posting.
 * Answering with a redirect keeps the app off an error page.
 */
export async function GET(request: NextRequest) {
  return NextResponse.redirect(`${siteUrl(request)}/add`, 303)
}
