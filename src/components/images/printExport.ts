export type ExportPreset = 'auto' | 'original' | 'print-40x53' | 'print-35x40' | 'companion-2x'
export type ResolvedExportPreset = Exclude<ExportPreset, 'auto'>

export type ExportGeometry = {
  preset: ResolvedExportPreset
  width: number
  height: number
  dpi: number | null
  /** Export keeps source pixels 1:1. Transparent outer margins are trimmed later. */
  x: number
  y: number
  drawWidth: number
  drawHeight: number
  upscaled: boolean
}

export const EXPORT_PRESETS: Array<{ id: ExportPreset; name: string; detail: string }> = [
  { id: 'auto', name: 'Auto', detail: 'Detecta el tipo de arte, conserva sus píxeles y recorta márgenes transparentes.' },
  { id: 'original', name: 'Original', detail: 'Conserva la resolución original y recorta solo transparencia exterior.' },
  { id: 'print-40x53', name: '40 × 53 cm', detail: 'No escala el arte · conserva píxeles · marca 300 ppp · recorta transparencia exterior.' },
  { id: 'print-35x40', name: '35 × 40 cm', detail: 'No escala el arte · conserva píxeles · marca 300 ppp · recorta transparencia exterior.' },
  { id: 'companion-2x', name: 'Companion', detail: 'No escala ni duplica el arte · conserva píxeles y recorta transparencia exterior.' },
]

/** Auto only suggests when the proportions are recognizable; unusual ratios stay original. */
export function recommendExportPreset(width: number, height: number): ResolvedExportPreset {
  if (width <= 0 || height <= 0) return 'original'
  const ratio = width / height
  const largest = Math.max(width, height)

  // Typical companion icons arrive approximately 2000 × 2000 pixels.
  if (ratio >= 0.94 && ratio <= 1.06 && largest >= 1200 && largest <= 2700) {
    return 'companion-2x'
  }
  const xlDistance = Math.abs(ratio - 40 / 53)
  const mediumDistance = Math.abs(ratio - 35 / 40)
  // Compare both candidates before selecting either, especially near 0.83.
  if (xlDistance <= 0.075 || mediumDistance <= 0.105) {
    if (xlDistance < mediumDistance && xlDistance <= 0.075) return 'print-40x53'
    if (mediumDistance <= 0.105) return 'print-35x40'
    return 'print-40x53'
  }
  if (ratio >= 0.94 && ratio <= 1.06) return 'print-35x40'
  return 'original'
}

export const resolveExportPreset = (width: number, height: number, preset: ExportPreset): ResolvedExportPreset =>
  preset === 'auto' ? recommendExportPreset(width, height) : preset

export function getExportGeometry(
  width: number,
  height: number,
  requested: ExportPreset,
  _allowUpscale = false,
): ExportGeometry {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new Error('Dimensiones de imagen inválidas.')
  }
  const preset = resolveExportPreset(width, height, requested)
  const dpi = preset === 'print-40x53' || preset === 'print-35x40' ? 300 : null

  // Export is intentionally 1:1. The source is never enlarged, reduced,
  // centered in a new print canvas or otherwise resampled.
  return {
    preset,
    width,
    height,
    dpi,
    x: 0,
    y: 0,
    drawWidth: width,
    drawHeight: height,
    upscaled: false,
  }
}

const crcTable = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let bit = 0; bit < 8; bit++) c = (c & 1) ? (c >>> 1) ^ 0xedb88320 : c >>> 1
  crcTable[n] = c >>> 0
}

function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (const value of data) c = crcTable[(c ^ value) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/**
 * Add a standards-compliant PNG pHYs chunk, measured in pixels per metre.
 * Browser canvas.toBlob normally records 96 dpi or no meaningful physical size.
 * 300 dpi rounds to 11811 px/m (as required by the PNG integer specification).
 * This routine does not decompress or rewrite the IDAT artwork.
 */
export async function setPngDpi(blob: Blob, dpi: number): Promise<Blob> {
  const signature = new Uint8Array(await blob.slice(0, 8).arrayBuffer())
  if (signature.length !== 8 || signature.some((byte, i) => byte !== [137, 80, 78, 71, 13, 10, 26, 10][i])) {
    throw new Error('Los metadatos de resolución requieren un PNG válido.')
  }
  const phys = new Uint8Array(21)
  const data = new DataView(phys.buffer)
  const ppm = Math.round(dpi / 0.0254)
  data.setUint32(0, 9, false)
  phys.set([112, 72, 89, 115], 4) // pHYs
  data.setUint32(8, ppm, false)
  data.setUint32(12, ppm, false)
  phys[16] = 1 // metres
  data.setUint32(17, crc32(phys.subarray(4, 17)), false)

  const chunks: BlobPart[] = [blob.slice(0, 8)]
  let offset = 8
  let inserted = false
  while (offset + 12 <= blob.size) {
    const header = new Uint8Array(await blob.slice(offset, offset + 8).arrayBuffer())
    const view = new DataView(header.buffer)
    const size = view.getUint32(0, false)
    const end = offset + 12 + size
    if (end > blob.size) throw new Error('El archivo PNG está incompleto.')
    const type = String.fromCharCode(header[4], header[5], header[6], header[7])
    if (type !== 'pHYs') chunks.push(blob.slice(offset, end))
    if (type === 'IHDR' && !inserted) {
      chunks.push(phys)
      inserted = true
    }
    offset = end
    if (type === 'IDAT') {
      // pHYs must precede IDAT; remaining compressed data can stay as one slice.
      chunks.push(blob.slice(offset))
      break
    }
  }
  if (!inserted) throw new Error('No se encontraron los metadatos IHDR del PNG.')
  return new Blob(chunks, { type: 'image/png' })
}
