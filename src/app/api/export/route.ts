import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { today } from '@/lib/dates'
import { streamZip, type ZipEntry } from '@/lib/zip'

/**
 * Export everything.
 *
 * Personal finance data you can't extract is a trap. One afternoon of work,
 * and it ships in v1 rather than "later" — a tool you can't leave is a tool
 * you have to think twice about adopting.
 *
 * ?format=zip (default) — a CSV per table, a full JSON dump, and every receipt
 *                         image
 * ?format=csv&table=X   — one table
 * ?format=json          — the whole dump as JSON
 *
 * The ZIP is written here by hand, store-only, and STREAMED. A dependency for
 * what amounts to a header, a footer and a CRC is not worth carrying — but
 * buffering every receipt image into one response is worse: it blows the
 * response-size and memory limits a serverless platform gives you, and it
 * fails on exactly the archive that matters most, the big one from a year of
 * real use.
 */

const TABLES = [
  'profiles',
  'accounts',
  'categories',
  'transactions',
  'transfers',
  'budgets',
  'recurring_rules',
  'receipts',
  'savings_goals',
  'account_statements',
  'net_worth_items',
  'net_worth_values',
  'no_spend_goals',
] as const

type TableName = (typeof TABLES)[number]

/** Reading and re-encoding a year of receipt images takes longer than a page. */
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Not signed in', { status: 401 })

  const format = request.nextUrl.searchParams.get('format') ?? 'zip'
  const table = request.nextUrl.searchParams.get('table') as TableName | null
  const stamp = today()

  if (format === 'csv') {
    if (!table || !TABLES.includes(table)) {
      return new NextResponse('Unknown table', { status: 400 })
    }
    const rows = await fetchTable(supabase, table)
    return new NextResponse(toCsv(rows), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="project2ak-${table}-${stamp}.csv"`,
      },
    })
  }

  const dump: Record<string, Record<string, unknown>[]> = {}
  for (const name of TABLES) dump[name] = await fetchTable(supabase, name)

  if (format === 'json') {
    return new NextResponse(JSON.stringify({ exported_at: stamp, tables: dump }, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="project2ak-${stamp}.json"`,
      },
    })
  }

  const encoder = new TextEncoder()

  async function* entries(): AsyncGenerator<ZipEntry> {
    yield {
      name: 'project2ak.json',
      data: encoder.encode(JSON.stringify({ exported_at: stamp, tables: dump }, null, 2)),
    }
    for (const name of TABLES) {
      yield { name: `csv/${name}.csv`, data: encoder.encode(toCsv(dump[name] ?? [])) }
    }

    // Receipt images are part of the export: they are the audit trail, and an
    // export without them answers "how much" but never "why". Pulled one at a
    // time so only a single image is ever held in memory.
    const receipts = (dump.receipts ?? []) as Array<{ storage_path?: string }>
    for (const receipt of receipts) {
      if (!receipt.storage_path) continue
      const { data } = await supabase.storage.from('receipts').download(receipt.storage_path)
      if (!data) continue
      yield {
        name: `receipts/${receipt.storage_path.split('/').pop() ?? 'receipt.jpg'}`,
        data: new Uint8Array(await data.arrayBuffer()),
      }
    }
  }

  return new NextResponse(streamZip(entries()) as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/zip',
      // No Content-Length: the size isn't known until the last image is read,
      // and guessing one truncates the archive.
      'Content-Disposition': `attachment; filename="project2ak-${stamp}.zip"`,
      'Cache-Control': 'no-store',
    },
  })
}

async function fetchTable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: TableName,
): Promise<Record<string, unknown>[]> {
  // RLS already scopes this to the caller; no explicit user filter needed, and
  // adding one would silently break if a table's owner column is ever renamed.
  const { data } = await supabase.from(table).select('*')
  return (data ?? []) as Record<string, unknown>[]
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0] as Record<string, unknown>)
  const lines = [headers.map(escapeCsv).join(',')]
  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsv(row[header])).join(','))
  }
  return `${lines.join('\r\n')}\r\n`
}

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}
