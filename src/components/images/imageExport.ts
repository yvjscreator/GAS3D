import { removeFabricInk, type InkRemovalMode, type InkRemovalSettings } from './imageProcessor'
import { getExportGeometry, setPngDpi, type ExportPreset } from './printExport'

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

/** Process original pixels without clipping. Optionally place them inside a fixed transparent print canvas with genuine pHYs metadata. */
export async function renderTransparentPng(
  bitmap: ImageBitmap,
  settings: InkRemovalSettings,
  inkMode: InkRemovalMode,
  onProgress?: (progress: number) => void,
  outputPreset: ExportPreset = 'original',
  allowUpscale = true,
): Promise<Blob> {
  assertImageDimensions(bitmap)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  try {
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('No se pudo crear el lienzo de exportación.')
    context.drawImage(bitmap, 0, 0)
    const rows = Math.max(1, Math.floor(1_500_000 / bitmap.width))
    const rowBytes = bitmap.width * 4
    let previousOriginalRow: Uint8ClampedArray | null = null

    for (let y = 0; y < bitmap.height; y += rows) {
      const height = Math.min(rows, bitmap.height - y)
      const sourceY = Math.max(0, y - 1)
      const sourceBottom = Math.min(bitmap.height, y + height + 1)
      const original = context.getImageData(0, sourceY, bitmap.width, sourceBottom - sourceY)

      // Prior strip overwrites pixels on the shared canvas. Restore the untouched
      // boundary row so the algorithm sees the same input as a whole-image pass.
      if (previousOriginalRow && sourceY < y) original.data.set(previousOriginalRow, 0)
      const lastOffset = (y + height - 1 - sourceY) * rowBytes
      previousOriginalRow = original.data.slice(lastOffset, lastOffset + rowBytes)

      const processed = removeFabricInk(original, settings, inkMode)
      const start = (y - sourceY) * rowBytes
      const output = new ImageData(
        processed.image.data.slice(start, start + height * rowBytes),
        bitmap.width,
        height,
      )
      context.putImageData(output, 0, y)
      onProgress?.(Math.round((y + height) / bitmap.height * 95))
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    }

    const geometry = getExportGeometry(bitmap.width, bitmap.height, outputPreset, allowUpscale)
    onProgress?.(96)

    let outputCanvas = canvas
    if (geometry.width !== bitmap.width || geometry.height !== bitmap.height || geometry.x || geometry.y) {
      outputCanvas = document.createElement('canvas')
      outputCanvas.width = geometry.width
      outputCanvas.height = geometry.height

      try {
        const outputContext = outputCanvas.getContext('2d', { alpha: true })
        if (!outputContext) throw new Error('No se pudo crear el lienzo de impresión. Prueba en un dispositivo con más memoria.')
        // The output canvas begins transparent. Contain and centering do not crop.
        outputContext.imageSmoothingEnabled = true
        outputContext.imageSmoothingQuality = 'high'
        outputContext.drawImage(
          canvas, 0, 0, bitmap.width, bitmap.height,
          geometry.x, geometry.y, geometry.drawWidth, geometry.drawHeight,
        )
        // Free the input RGBA allocation before PNG encoding the print canvas.
        canvas.width = 0
        canvas.height = 0
      } catch (error) {
        outputCanvas.width = 0
        outputCanvas.height = 0
        throw error
      }
    }

    let blob: Blob
    try {
      blob = await new Promise<Blob>((resolve, reject) => {
        outputCanvas.toBlob((result) =>
          result ? resolve(result) : reject(new Error('No se pudo crear el PNG. Es posible que la resolución exceda la memoria del dispositivo.')), 'image/png')
      })
    } finally {
      if (outputCanvas !== canvas) {
        outputCanvas.width = 0
        outputCanvas.height = 0
      }
    }
    // Unlike a simple 4724x6260 canvas export, this also carries physical print size.
    if (geometry.dpi) blob = await setPngDpi(blob, geometry.dpi)
    onProgress?.(100)
    return blob
  } finally {
    // Release the large backing allocation before starting the next batch item.
    canvas.width = 0
    canvas.height = 0
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
