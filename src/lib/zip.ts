/**
 * A minimal store-only ZIP writer, emitted as a stream.
 *
 * Store-only (compression method 0) is what makes streaming simple: each
 * entry's compressed size is its real size, so the local header can be written
 * before the next entry is even read, and only one entry is ever resident in
 * memory. That matters for the export, whose whole point is that it still
 * works on the big archive after a year of real use.
 *
 * A dependency for a header, a footer and a CRC is not worth carrying — but an
 * untested one would be, so this lives here rather than inline in the route
 * and is checked against a real unzip in tests/zip.test.ts.
 */

export interface ZipEntry {
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

/**
 * Store-only ZIP (compression method 0), emitted as a stream.
 *
 * Store-only is what makes streaming simple: each entry's compressed size is
 * its real size, so the local header can be written before the next entry is
 * even read. Only one entry is resident at a time.
 */
export function streamZip(entries: AsyncGenerator<ZipEntry>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const centrals: Uint8Array[] = []
  let offset = 0
  let count = 0

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await entries.next()

      if (!next.done) {
        const entry = next.value
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

        controller.enqueue(local)
        controller.enqueue(entry.data)
        offset += local.length + size
        count++
        return
      }

      // Central directory, then end-of-central-directory.
      let centralSize = 0
      for (const central of centrals) {
        controller.enqueue(central)
        centralSize += central.length
      }

      const end = new Uint8Array(22)
      const endView = new DataView(end.buffer)
      endView.setUint32(0, 0x06054b50, true)
      endView.setUint16(8, count, true)
      endView.setUint16(10, count, true)
      endView.setUint32(12, centralSize, true)
      endView.setUint32(16, offset, true)
      controller.enqueue(end)
      controller.close()
    },
    async cancel() {
      await entries.return(undefined as never)
    },
  })
}
