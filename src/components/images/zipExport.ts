/** Small ZIP writer for already-compressed PNGs. STORE entries need no external library. */
type ZipEntry = { name: string; blob: Blob }
const encoder = new TextEncoder()
const MAX_UINT32 = 0xffffffff

const crcTable = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let value = i
  for (let j = 0; j < 8; j++) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1)
  }
  crcTable[i] = value >>> 0
}

async function crc32(blob: Blob) {
  let crc = 0xffffffff
  // Read in bounded chunks rather than materializing all PNG bytes at once.
  const step = 1024 * 1024
  for (let start = 0; start < blob.size; start += step) {
    const chunk = new Uint8Array(await blob.slice(start, start + step).arrayBuffer())
    for (const byte of chunk) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, Math.min(2107, date.getFullYear()))
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time, day }
}

export async function createZipArchive(entries: ZipEntry[]): Promise<Blob> {
  if (!entries.length) throw new Error('No hay archivos para agregar al ZIP.')
  if (entries.length > 65535) throw new Error('Demasiados archivos para un ZIP estándar.')

  const pieces: BlobPart[] = []
  const directory: BlobPart[] = []
  let position = 0
  let directorySize = 0
  const { time, day } = dosDateTime()

  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const size = entry.blob.size
    if (name.length > 65535 || size > MAX_UINT32 || position + size + name.length + 30 > MAX_UINT32) {
      throw new Error('El lote supera el tamaño admitido por ZIP estándar (4 GB).')
    }
    const checksum = await crc32(entry.blob)

    const local = new Uint8Array(30 + name.length)
    const localView = new DataView(local.buffer)
    localView.setUint32(0, 0x04034b50, true)
    localView.setUint16(4, 20, true)
    localView.setUint16(6, 0x0800, true) // UTF-8 filenames
    localView.setUint16(8, 0, true) // STORE: PNGs are already compressed
    localView.setUint16(10, time, true)
    localView.setUint16(12, day, true)
    localView.setUint32(14, checksum, true)
    localView.setUint32(18, size, true)
    localView.setUint32(22, size, true)
    localView.setUint16(26, name.length, true)
    local.set(name, 30)
    pieces.push(local, entry.blob)

    const central = new Uint8Array(46 + name.length)
    const centralView = new DataView(central.buffer)
    centralView.setUint32(0, 0x02014b50, true)
    centralView.setUint16(4, 20, true)
    centralView.setUint16(6, 20, true)
    centralView.setUint16(8, 0x0800, true)
    centralView.setUint16(10, 0, true)
    centralView.setUint16(12, time, true)
    centralView.setUint16(14, day, true)
    centralView.setUint32(16, checksum, true)
    centralView.setUint32(20, size, true)
    centralView.setUint32(24, size, true)
    centralView.setUint16(28, name.length, true)
    centralView.setUint32(42, position, true)
    central.set(name, 46)
    directory.push(central)
    directorySize += central.length
    position += local.length + size
  }

  if (position + directorySize + 22 > MAX_UINT32) {
    throw new Error('El lote supera el tamaño máximo del ZIP estándar.')
  }

  const footer = new Uint8Array(22)
  const view = new DataView(footer.buffer)
  view.setUint32(0, 0x06054b50, true)
  view.setUint16(8, entries.length, true)
  view.setUint16(10, entries.length, true)
  view.setUint32(12, directorySize, true)
  view.setUint32(16, position, true)
  return new Blob([...pieces, ...directory, footer], { type: 'application/zip' })
}
