import { removeFabricInk, type InkRemovalMode, type InkRemovalSettings } from './imageProcessor'
import { getExportGeometry, setPngDpi, type ExportPreset } from './printExport'
import { optimizeImageAlpha, shouldOptimizeAlpha, type AlphaOptimizationSettings } from './alphaOptimization'
import { embedSrgbIcc, verifyPrintPng } from './colorManagement'
import { optimizePngLosslessly, type CompressionResult } from './pngOptimization'

export type SourceDimensions = { width: number; height: number }

// Both limits are for the streamed path, not an arbitrary thumbnail limit.
// At most one narrow strip is decoded/processed at a time; no full-size Canvas.
export const MAX_STREAMED_PIXELS = 100_000_000
export const MAX_STREAMED_EDGE = 16_384
const MAX_STRIP_PIXELS = 1_000_000
const ALPHA_VISIBLE_THRESHOLD = 2
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

export function isLargeImage(size: SourceDimensions) {
  const mobile = window.matchMedia('(max-width: 720px)').matches
  return size.width * size.height > (mobile ? 18_000_000 : 30_000_000)
}

export function assertStreamedDimensions({ width, height }: SourceDimensions) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
    width > MAX_STREAMED_EDGE || height > MAX_STREAMED_EDGE || width * height > MAX_STREAMED_PIXELS) {
    throw new Error('Este archivo supera la capacidad del modo de alta resolución (máximo 100 megapíxeles y 16384 píxeles por lado).')
  }
}

/** Read PNG IHDR without allocating a bitmap the size of the original image. */
export async function readPngSourceSize(blob: Blob): Promise<SourceDimensions | null> {
  const head = new Uint8Array(await blob.slice(0, 29).arrayBuffer())
  if (head.length < 29 || PNG_SIGNATURE.some((byte, i) => head[i] !== byte)) return null
  if (head[12] !== 73 || head[13] !== 72 || head[14] !== 68 || head[15] !== 82) {
    throw new Error('La cabecera de este archivo PNG es inválida.')
  }
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength)
  const width = view.getUint32(16, false)
  const height = view.getUint32(20, false)
  if (!width || !height) throw new Error('El PNG contiene dimensiones inválidas.')
  return { width, height }
}

const crcTable = new Uint32Array(256)
for (let i = 0; i < crcTable.length; i++) {
  let crc = i
  for (let j = 0; j < 8; j++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  crcTable[i] = crc >>> 0
}

function pngChunk(type: string, bytes: Uint8Array): ArrayBuffer {
  // BlobPart in modern DOM typings requires ArrayBuffer, not a Uint8Array
  // whose backing store could be SharedArrayBuffer. Allocate an owned buffer.
  const buffer = new ArrayBuffer(bytes.length + 12)
  const chunk = new Uint8Array(buffer)
  const view = new DataView(buffer)
  view.setUint32(0, bytes.length, false)
  for (let i = 0; i < 4; i++) chunk[4 + i] = type.charCodeAt(i)
  chunk.set(bytes, 8)
  let crc = 0xffffffff
  for (let i = 4; i < chunk.length - 4; i++) crc = crcTable[(crc ^ chunk[i]) & 255] ^ (crc >>> 8)
  view.setUint32(chunk.length - 4, (crc ^ 0xffffffff) >>> 0, false)
  return buffer
}

async function forEachNativeStrip(
  input: Blob,
  size: SourceDimensions,
  settings: InkRemovalSettings,
  inkMode: InkRemovalMode,
  alphaSettings: AlphaOptimizationSettings,
  onStrip: (pixels: Uint8ClampedArray, y: number, height: number) => Promise<void> | void,
  onProgress?: (fraction: number) => void,
) {
  const { width, height } = size
  const rows = Math.max(1, Math.floor(MAX_STRIP_PIXELS / width))
  const canvas = document.createElement('canvas')
  const optimize = shouldOptimizeAlpha(alphaSettings)
  try {
    for (let y = 0; y < height; y += rows) {
      const count = Math.min(rows, height - y)
      const sourceTop = Math.max(0, y - 2)
      const sourceBottom = Math.min(height, y + count + 2)
      const strip = await createImageBitmap(input, 0, sourceTop, width, sourceBottom - sourceTop, { colorSpaceConversion: 'default' })
      try {
        canvas.width = width
        canvas.height = sourceBottom - sourceTop
        const context = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' })
        if (!context) throw new Error('Este navegador no puede procesar las franjas del PNG.')
        context.imageSmoothingEnabled = false
        context.drawImage(strip, 0, 0)
        const original = context.getImageData(0, 0, canvas.width, canvas.height)
        const processed = removeFabricInk(original, settings, inkMode).image
        if (optimize) optimizeImageAlpha(processed, alphaSettings, sourceTop)
        const rowBytes = width * 4
        const offset = (y - sourceTop) * rowBytes
        await onStrip(processed.data.subarray(offset, offset + count * rowBytes), y, count)
      } finally {
        strip.close()
      }
      onProgress?.((y + count) / height)
      // Give mobile browsers an opportunity to paint progress and release memory.
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    }
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}

/**
 * Large PNGs: native-resolution color/alpha treatment, streamed in cropped
 * source strips. A first pass finds the transparent bounds; a second writes
 * RGBA8 PNG scanlines to a zlib CompressionStream. Never shrink the print.
 *
 * Browsers still control native image decoding and may refuse a large source.
 * A failure is reported explicitly rather than exporting a lower-res PNG.
 */
export async function renderLargeTransparentPng(
  file: Blob,
  size: SourceDimensions,
  settings: InkRemovalSettings,
  inkMode: InkRemovalMode,
  onProgress?: (progress: number) => void,
  outputPreset: ExportPreset = 'original',
  allowUpscale = false,
  alphaSettings: AlphaOptimizationSettings = { method:'dtg', dtfMode:'preserve', cleanupPercent:0, cellPixels:8, pattern:'stochastic', detailProtection:100 },
  embedProfile = true,
  optimizeLosslessly = true,
  onCompression?: (result: CompressionResult) => void,
): Promise<Blob> {
  assertStreamedDimensions(size)
  if (typeof CompressionStream === 'undefined') {
    throw new Error('El navegador no admite la exportación por bloques. Actualiza Chrome, Firefox o Safari.')
  }

  const geometry = getExportGeometry(size.width, size.height, outputPreset, allowUpscale)
  let left = size.width
  let top = size.height
  let right = -1
  let bottom = -1
  await forEachNativeStrip(file, size, settings, inkMode, alphaSettings, (pixels, start, count) => {
    const width = size.width
    for (let row = 0; row < count; row++) {
      const rowOffset = row * width * 4
      for (let x = 0; x < width; x++) {
        if (pixels[rowOffset + x * 4 + 3] <= ALPHA_VISIBLE_THRESHOLD) continue
        if (x < left) left = x
        if (x > right) right = x
        if (start + row < top) top = start + row
        if (start + row > bottom) bottom = start + row
      }
    }
  }, (fraction) => onProgress?.(Math.round(fraction * 42)))

  if (right < left || bottom < top) throw new Error('El resultado quedó completamente transparente después del procesamiento.')
  const outputWidth = right - left + 1
  const outputHeight = bottom - top + 1

  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, outputWidth, false)
  view.setUint32(4, outputHeight, false)
  ihdr[8] = 8 // 8 bits per channel
  ihdr[9] = 6 // RGBA
  const parts: BlobPart[] = [new Uint8Array(PNG_SIGNATURE).buffer, pngChunk('IHDR', ihdr)]

  const compressor = new CompressionStream('deflate') // PNG IDAT requires zlib-wrapped DEFLATE
  const writer = compressor.writable.getWriter()
  const reader = compressor.readable.getReader()
  const collecting = (async () => {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (value?.length) parts.push(pngChunk('IDAT', value))
    }
  })()

  try {
    await forEachNativeStrip(file, size, settings, inkMode, alphaSettings, async (pixels, start, count) => {
      const rowBytes = size.width * 4
      const x = left * 4
      const segmentBytes = outputWidth * 4
      for (let row = 0; row < count; row++) {
        const globalY = start + row
        if (globalY < top || globalY > bottom) continue
        const scanline = new Uint8Array(1 + segmentBytes)
        scanline[0] = 0 // PNG filter: None
        scanline.set(pixels.subarray(row * rowBytes + x, row * rowBytes + x + segmentBytes), 1)
        await writer.write(scanline)
      }
    }, (fraction) => onProgress?.(42 + Math.round(fraction * 55)))
    await writer.close()
    await collecting
  } catch (error) {
    await writer.abort(error).catch(() => undefined)
    await collecting.catch(() => undefined)
    throw new Error('No se pudo terminar la exportación de alta resolución. Puede faltar memoria para decodificar esta imagen en el navegador.')
  }

  parts.push(pngChunk('IEND', new Uint8Array(0)))
  let blob = new Blob(parts, { type:'image/png' })
  if (geometry.dpi) blob = await setPngDpi(blob, geometry.dpi)
  if (embedProfile) blob = await embedSrgbIcc(blob)
  await verifyPrintPng(blob, { width: outputWidth, height: outputHeight, dpi: geometry.dpi, icc: embedProfile })

  if (optimizeLosslessly) {
    const result = await optimizePngLosslessly(blob) // returns original if too large
    onCompression?.(result)
    blob = result.blob
  }
  onProgress?.(100)
  return blob
}
