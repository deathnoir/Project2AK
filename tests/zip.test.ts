import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { streamZip, type ZipEntry } from '@/lib/zip'

/**
 * The export archive is checked against a real unzip, not against this
 * module's own idea of the format. A hand-written ZIP that only this code can
 * read is worse than no export at all: the failure is silent and only shows up
 * on the day someone actually needs their data out.
 */

const scratch = mkdtempSync(join(tmpdir(), 'p2ak-zip-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

async function collect(entries: ZipEntry[]): Promise<Buffer> {
  async function* gen() {
    for (const entry of entries) yield entry
  }
  const chunks: Uint8Array[] = []
  const reader = streamZip(gen()).getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(value)
  }
  return Buffer.concat(chunks)
}

function unzip(archive: Buffer, name: string): string {
  const path = join(scratch, `${name}.zip`)
  writeFileSync(path, archive)
  execFileSync('unzip', ['-t', path], { stdio: 'pipe' })
  const out = join(scratch, name)
  execFileSync('unzip', ['-o', '-q', path, '-d', out], { stdio: 'pipe' })
  return out
}

const encoder = new TextEncoder()

describe('streamZip', () => {
  it('produces an archive a real unzip accepts and reads back byte-for-byte', async () => {
    const csv = 'date,amount_centavos\r\n2026-07-24,-45000\r\n'
    const json = JSON.stringify({ exported_at: '2026-07-24' }, null, 2)
    // A stand-in for a receipt: binary, with bytes that would break any
    // implementation quietly treating entries as text.
    const image = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00])

    const archive = await collect([
      { name: 'project2ak.json', data: encoder.encode(json) },
      { name: 'csv/transactions.csv', data: encoder.encode(csv) },
      { name: 'receipts/abc.jpg', data: image },
    ])

    const out = unzip(archive, 'roundtrip')

    expect(readFileSync(join(out, 'project2ak.json'), 'utf8')).toBe(json)
    expect(readFileSync(join(out, 'csv/transactions.csv'), 'utf8')).toBe(csv)
    expect(new Uint8Array(readFileSync(join(out, 'receipts/abc.jpg')))).toEqual(image)
  })

  it('survives an empty entry, which every empty table produces', async () => {
    const archive = await collect([
      { name: 'csv/net_worth_items.csv', data: new Uint8Array(0) },
      { name: 'csv/budgets.csv', data: encoder.encode('a,b\r\n1,2\r\n') },
    ])
    const out = unzip(archive, 'empty')
    expect(readFileSync(join(out, 'csv/net_worth_items.csv'), 'utf8')).toBe('')
    expect(readFileSync(join(out, 'csv/budgets.csv'), 'utf8')).toBe('a,b\r\n1,2\r\n')
  })

  it('keeps non-ASCII filenames and content intact', async () => {
    // Merchant names here are routinely non-ASCII — "Jollibee SM Dasmariñas",
    // and the peso sign is in every formatted figure.
    const body = 'Jollibee SM Dasmariñas,₱450.00\r\n'
    const archive = await collect([
      { name: 'csv/gastos-dasmariñas.csv', data: encoder.encode(body) },
    ])
    const out = unzip(archive, 'unicode')
    expect(readFileSync(join(out, 'csv/gastos-dasmariñas.csv'), 'utf8')).toBe(body)
  })

  it('writes a structurally valid archive with no entries at all', async () => {
    const archive = await collect([])
    // 22 bytes: just the end-of-central-directory record, which is what a
    // zero-entry ZIP is per spec.
    expect(archive.length).toBe(22)

    // Checked with Python's zipfile rather than `unzip -t`: Info-ZIP exits
    // non-zero on an empty archive with "zipfile is empty", which is a
    // complaint about emptiness, not a report of corruption.
    const path = join(scratch, 'nothing.zip')
    writeFileSync(path, archive)
    const names = execFileSync(
      'python3',
      ['-c', `import zipfile,json;print(json.dumps(zipfile.ZipFile(${JSON.stringify(path)}).namelist()))`],
      { encoding: 'utf8' },
    )
    expect(JSON.parse(names)).toEqual([])
  })
})
