import { removeFabricInk, type InkRemovalMode, type InkRemovalSettings } from './imageProcessor'
import { getExportGeometry, setPngDpi, type ExportPreset } from './printExport'
import { DEFAULT_ALPHA_SETTINGS, optimizeImageAlpha, shouldOptimizeAlpha, type AlphaOptimizationSettings } from './alphaOptimization'
import { embedSrgbIcc, verifyPrintPng } from './colorManagement'
import { optimizePngLosslessly, type CompressionResult } from './pngOptimization'

const MAX_PIXELS_DESKTOP = 30_000_000
const MAX_PIXELS_MOBILE = 18_000_000

export const validImageFile = (file: File) =>
  /^image\/(png|jpeg|webp)$/.test(file.type)
  || (!file.type && /\.(png|jpe?g|webp)$/i.test(file.name))

export function assertImageFile(file: File) {
  if (!validImageFile(file)) throw new Error('Solo se admiten PNG, JPG o WebP.')
  if (file.size > 60 * 1024 * 1024) throw new Error('El archivo supera 60 MB.')
}

export function assertImageDimensions(bitmap: ImageBitmap) {
  const isMobile = window.matchMedia('(max-width: 720px)').matches
  const limit = isMobile ? MAX_PIXELS_MOBILE : MAX_PIXELS_DESKTOP
  if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > limit) {
    throw new Error('Resolución no admitida en este dispositivo (máximo ' + Math.round(limit / 1_000_000) + ' MP).')
  }
}

type ContentBounds = { x: number; y: number; width: number; height: number }

const TRIM_ALPHA_THRESHOLD = 2
const TRIM_SCAN_ROWS = 192

async function findVisibleBounds(canvas: HTMLCanvasElement): Promise<ContentBounds | null> {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('No se pudo analizar el contenido para recortar los márgenes.')

  let minX = canvas.width
  let minY = canvas.height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < canvas.height; y += TRIM_SCAN_ROWS) {
    const h = Math.min(TRIM_SCAN_ROWS, canvas.height - y)
    const pixels = ctx.getImageData(0, y, canvas.width, h).data
    for (let row = 0; row < h; row++) {
      const rowOffset = row * canvas.width * 4
      for (let x = 0; x < canvas.width; x++) {
        if (pixels[rowOffset + x * 4 + 3] <= TRIM_ALPHA_THRESHOLD) continue
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        const absoluteY = y + row
        if (absoluteY < minY) minY = absoluteY
        if (absoluteY > maxY) maxY = absoluteY
      }
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
  }

  if (maxX < minX || maxY < minY) return null
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

async function trimTransparentMargins(canvas: HTMLCanvasElement): Promise<HTMLCanvasElement> {
  const bounds = await findVisibleBounds(canvas)
  if (!bounds) throw new Error('El resultado quedó completamente transparente después del procesamiento.')

  if (bounds.x === 0 && bounds.y === 0 && bounds.width === canvas.width && bounds.height === canvas.height) {
    return canvas
  }

  const trimmed = document.createElement('canvas')
  trimmed.width = bounds.width
  trimmed.height = bounds.height
  const ctx = trimmed.getContext('2d', { alpha: true, willReadFrequently: true, colorSpace: 'srgb' })
  if (!ctx) {
    trimmed.width = 0
    trimmed.height = 0
    throw new Error('No se pudo crear el lienzo recortado.')
  }

  // Exact pixel copy: source and destination sizes are identical.
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(
    canvas,
    bounds.x, bounds.y, bounds.width, bounds.height,
    0, 0, bounds.width, bounds.height,
  )
  return trimmed
}

/**
 * Process the original bitmap at native resolution, never rescale the artwork,
 * then remove only transparent/near-transparent outer margins.
 */
export async function renderTransparentPng(
  bitmap: ImageBitmap,
  settings: InkRemovalSettings,
  inkMode: InkRemovalMode,
  onProgress?: (progress: number) => void,
  outputPreset: ExportPreset = 'original',
  allowUpscale = false,
  alphaSettings: AlphaOptimizationSettings = DEFAULT_ALPHA_SETTINGS,
  embedProfile = true,
  optimizeLosslessly = true,
  onCompression?: (result: CompressionResult) => void,
): Promise<Blob> {
  assertImageDimensions(bitmap)
  const geometry = getExportGeometry(bitmap.width, bitmap.height, outputPreset, allowUpscale)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height

  let finalCanvas: HTMLCanvasElement = canvas
  try {
    const context = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' })
    if (!context) throw new Error('No se pudo crear el lienzo de exportación.')
    context.imageSmoothingEnabled = false
    context.drawImage(bitmap, 0, 0)

    const rows = Math.max(1, Math.floor(1_500_000 / bitmap.width))
    const rowBytes = bitmap.width * 4
    let previousOriginalRow: Uint8ClampedArray | null = null

    for (let y = 0; y < bitmap.height; y += rows) {
      const height = Math.min(rows, bitmap.height - y)
      const sourceY = Math.max(0, y - 1)
      const sourceBottom = Math.min(bitmap.height, y + height + 1)
      const original = context.getImageData(0, sourceY, bitmap.width, sourceBottom - sourceY)

      if (previousOriginalRow && sourceY < y) original.data.set(previousOriginalRow, 0)
      const lastOffset = (y + height - 1 - sourceY) * rowBytes
      previousOriginalRow = original.data.slice(lastOffset, lastOffset + rowBytes)

      const processed = removeFabricInk(original, settings, inkMode)
      const start = (y - sourceY) * rowBytes
      context.putImageData(new ImageData(
        processed.image.data.slice(start, start + height * rowBytes),
        bitmap.width,
        height,
      ), 0, y)
      onProgress?.(Math.round((y + height) / bitmap.height * 92))
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    }

    if (shouldOptimizeAlpha(alphaSettings)) {
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) throw new Error('El lienzo no permite optimizar la transparencia.')
      const dot = alphaSettings.dtfMode === 'halftone' || alphaSettings.dtfMode === 'aggressive'
        ? Math.max(1, Math.min(5, Math.round(alphaSettings.cellPixels / 4))) : 1
      const rowBudget = Math.floor(900_000 / canvas.width)
      const stripHeight = Math.max(dot, Math.floor(Math.max(dot, rowBudget) / dot) * dot)
      const bytesPerRow = canvas.width * 4
      let previousUntreatedRow: Uint8ClampedArray | null = null

      for (let y = 0; y < canvas.height; y += stripHeight) {
        const h = Math.min(stripHeight, canvas.height - y)
        const top = Math.max(0, y - 1)
        const bottom = Math.min(canvas.height, y + h + 1)
        const pixels = ctx.getImageData(0, top, canvas.width, bottom - top)
        if (previousUntreatedRow && top < y) pixels.data.set(previousUntreatedRow, 0)
        const last = (y + h - 1 - top) * bytesPerRow
        previousUntreatedRow = pixels.data.slice(last, last + bytesPerRow)

        optimizeImageAlpha(pixels, alphaSettings, top)
        const offset = (y - top) * bytesPerRow
        ctx.putImageData(new ImageData(
          pixels.data.slice(offset, offset + h * bytesPerRow),
          canvas.width, h,
        ), 0, y)
        onProgress?.(92 + Math.round(((y + h) / canvas.height) * 4))
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
      }
    }

    onProgress?.(97)
    finalCanvas = await trimTransparentMargins(canvas)
    onProgress?.(98)

    let blob: Blob
    try {
      blob = await new Promise<Blob>((resolve, reject) => {
        finalCanvas.toBlob((result) =>
          result ? resolve(result) : reject(new Error('No se pudo crear el PNG. Es posible que la resolución exceda la memoria del dispositivo.')),
        'image/png')
      })
    } finally {
      if (finalCanvas !== canvas) {
        canvas.width = 0
        canvas.height = 0
      }
    }

    if (geometry.dpi) blob = await setPngDpi(blob, geometry.dpi)
    if (embedProfile) blob = await embedSrgbIcc(blob)

    await verifyPrintPng(blob, {
      width: finalCanvas.width,
      height: finalCanvas.height,
      dpi: geometry.dpi,
      icc: embedProfile,
    })

    if (optimizeLosslessly) {
      onProgress?.(99)
      const compressed = await optimizePngLosslessly(blob)
      onCompression?.(compressed)
      blob = compressed.blob
    }
    onProgress?.(100)
    return blob
  } finally {
    canvas.width = 0
    canvas.height = 0
    if (finalCanvas !== canvas) {
      finalCanvas.width = 0
      finalCanvas.height = 0
    }
  }
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
