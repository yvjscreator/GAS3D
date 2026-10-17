type Incoming = { id: number; png: ArrayBuffer }
type Outgoing =
  | { id: number; optimized: ArrayBuffer }
  | { id: number; error: string }

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]
const typeBytes = new TextEncoder().encode('IDAT')
const crcTable = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let value = i
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1
  crcTable[i] = value >>> 0
}
function crc32(type: Uint8Array, data: Uint8Array) {
  let crc = 0xffffffff
  for (const bytes of [type, data]) {
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}
function makeIdat(payload: Uint8Array) {
  const output = new Uint8Array(12 + payload.length)
  const view = new DataView(output.buffer)
  view.setUint32(0, payload.length, false)
  output.set(typeBytes, 4)
  output.set(payload, 8)
  view.setUint32(output.length - 4, crc32(typeBytes, payload), false)
  return output
}
function concat(parts: Uint8Array[]) {
  let length = 0
  for (const part of parts) length += part.length
  const output = new Uint8Array(length)
  let offset = 0
  for (const part of parts) { output.set(part, offset); offset += part.length }
  return output
}

/**
 * Recompress the PNG IDAT stream using the browser's native zlib engine.
 * The decompressed PNG scanline bytes are never changed, therefore image
 * pixels, alpha, ICC, pHYs and every non-IDAT chunk remain byte-for-byte intact.
 *
 * This intentionally avoids Oxipng/WASM: on ~30MP print canvases WASM can take
 * minutes or hit memory pressure. Streams keep the ~118MB raw image out of a
 * single JavaScript allocation.
 */
async function recompressPng(input: ArrayBuffer): Promise<ArrayBuffer> {
  if (typeof DecompressionStream === 'undefined' || typeof CompressionStream === 'undefined') {
    throw new Error('Este navegador no dispone del compresor PNG nativo.')
  }

  const bytes = new Uint8Array(input)
  if (bytes.length < 33 || PNG_SIGNATURE.some((value, index) => bytes[index] !== value)) {
    throw new Error('PNG inválido.')
  }

  let offset = 8
  let firstIdat = -1
  let lastIdatEnd = -1
  const idatParts: Uint8Array[] = []
  while (offset + 12 <= bytes.length) {
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, false)
    const end = offset + length + 12
    if (end > bytes.length) throw new Error('PNG truncado.')
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7])
    if (type === 'IDAT') {
      if (firstIdat < 0) firstIdat = offset
      lastIdatEnd = end
      idatParts.push(bytes.slice(offset + 8, offset + 8 + length))
    } else if (firstIdat >= 0 && lastIdatEnd >= 0 && offset !== lastIdatEnd && type !== 'IEND') {
      // PNG requires IDAT chunks to be consecutive. Refuse unusual files rather
      // than accidentally moving an ancillary chunk.
      throw new Error('PNG con estructura IDAT no compatible con recompresión segura.')
    }
    offset = end
    if (type === 'IEND') break
  }
  if (firstIdat < 0 || lastIdatEnd < 0 || !idatParts.length) throw new Error('PNG sin datos IDAT.')

  const recompressed = new Blob(idatParts.map((part) => {
    const copy = new Uint8Array(part.byteLength)
    copy.set(part)
    return copy.buffer
  }))
    .stream()
    .pipeThrough(new DecompressionStream('deflate'))
    .pipeThrough(new CompressionStream('deflate'))
  const compressedBytes = new Uint8Array(await new Response(recompressed).arrayBuffer())

  // Avoid one very large PNG chunk; 1 MiB chunks are broadly compatible.
  const replacement: Uint8Array[] = []
  const chunkSize = 1024 * 1024
  for (let start = 0; start < compressedBytes.length; start += chunkSize) {
    replacement.push(makeIdat(compressedBytes.subarray(start, Math.min(compressedBytes.length, start + chunkSize))))
  }
  const output = concat([
    bytes.slice(0, firstIdat),
    ...replacement,
    bytes.slice(lastIdatEnd),
  ])
  return output.buffer
}

self.addEventListener('message', async (event: MessageEvent<Incoming>) => {
  const { id, png } = event.data
  try {
    const optimized = await recompressPng(png)
    const result: Outgoing = { id, optimized }
    self.postMessage(result, { transfer: [optimized] })
  } catch (error) {
    const result: Outgoing = {
      id,
      error: error instanceof Error ? error.message : 'Falló la optimización PNG.',
    }
    self.postMessage(result)
  }
})
