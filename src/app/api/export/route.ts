import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { today } from '@/lib/dates'

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
 * The ZIP is written here by hand, store-only. A dependency for what amounts
 * to a header, a footer and a CRC is not worth carrying.
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

  const files: ZipEntry[] = [
    {
      name: 'project2ak.json',
      data: new TextEncoder().encode(JSON.stringify({ exported_at: stamp, tables: dump }, null, 2)),
    },
  ]

  for (const name of TABLES) {
    files.push({
      name: `csv/${name}.csv`,
      data: new TextEncoder().encode(toCsv(dump[name] ?? [])),
    })
  }

  // Receipt images are part of the export: they are the audit trail, and an
  // export without them answers "how much" but never "why".
  const receipts = (dump.receipts ?? []) as Array<{ storage_path?: string }>
  for (const receipt of receipts) {
    if (!receipt.storage_path) continue
    const { data } = await supabase.storage.from('receipts').download(receipt.storage_path)
    if (!data) continue
    files.push({
      name: `receipts/${receipt.storage_path.split('/').pop() ?? 'receipt.jpg'}`,
      data: new Uint8Array(await data.arrayBuffer()),
    })
  }

  const zip = buildZip(files)

  return new NextResponse(zip as BodyInit, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="project2ak-${stamp}.zip"`,
      'Content-Length': String(zip.byteLength),
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

// ------------------------------------------------------------------- zip ----

interface ZipEntry {
  name: string
  data: Uint8Array
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of data) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/** Store-only ZIP (compression method 0). Enough for a personal archive. */
function buildZip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name)
    const crc = crc32(entry.data)
    const size = entry.data.length

    const local = new Uint8Array(30 + nameBytes.length)
    const localView = new DataView(local.buffer)
    localView.setUint32(0, 0x04034b50, true)
    localView.setUint16(4, 20, true) // version needed
    localView.setUint16(6, 0x0800, true) // UTF-8 filenames
    localView.setUint16(8, 0, true) // stored
    localView.setUint32(14, crc, true)
    localView.setUint32(18, size, true)
    localView.setUint32(22, size, true)
    localView.setUint16(26, nameBytes.length, true)
    local.set(nameBytes, 30)

    locals.push(local, entry.data)

    const central = new Uint8Array(46 + nameBytes.length)
    const centralView = new DataView(central.buffer)
    centralView.setUint32(0, 0x02014b50, true)
    centralView.setUint16(4, 20, true)
    centralView.setUint16(6, 20, true)
    centralView.setUint16(8, 0x0800, true)
    centralView.setUint16(10, 0, true)
    centralView.setUint32(16, crc, true)
    centralView.setUint32(20, size, true)
    centralView.setUint32(24, size, true)
    centralView.setUint16(28, nameBytes.length, true)
    centralView.setUint32(42, offset, true)
    central.set(nameBytes, 46)
    centrals.push(central)

    offset += local.length + size
  }

  const centralSize = centrals.reduce((sum, c) => sum + c.length, 0)
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(8, entries.length, true)
  endView.setUint16(10, entries.length, true)
  endView.setUint32(12, centralSize, true)
  endView.setUint32(16, offset, true)

  const total =
    locals.reduce((sum, part) => sum + part.length, 0) + centralSize + end.length
  const out = new Uint8Array(total)
  let cursor = 0
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, cursor)
    cursor += part.length
  }
  return out
}
