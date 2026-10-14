export type PrintMethod = 'dtg' | 'dtf'
export type DtfAlphaMode = 'halftone' | 'solid' | 'preserve'
export type AlphaOptimizationSettings = {
  method: PrintMethod
  dtfMode: DtfAlphaMode
  /** Discard cells or pixels below this coverage (0..30%). */
  cleanupPercent: number
  /** Reserved print dot size control, calibrated in the next phase. */
  cellPixels: number
}
export const DEFAULT_ALPHA_SETTINGS: AlphaOptimizationSettings = {
  method: 'dtg',
  dtfMode: 'halftone',
  cleanupPercent: 10,
  cellPixels: 8,
}

export type AlphaStatistics = { transparent: number; partial: number; opaque: number; total: number }
export function analyzeAlpha(image: ImageData): AlphaStatistics {
  const result = { transparent: 0, partial: 0, opaque: 0, total: image.width * image.height }
  for (let i = 3; i < image.data.length; i += 4) {
    const a = image.data[i]
    if (a === 0) result.transparent++
    else if (a === 255) result.opaque++
    else result.partial++
  }
  return result
}

export const shouldOptimizeAlpha = (settings: AlphaOptimizationSettings) =>
  settings.method === 'dtf' && settings.dtfMode !== 'preserve'

/**
 * Apply treatment at final print size. Per-pixel operations use global Y to
 * prevent pattern seams between export strips. Output alpha is 0/255.
 */
export function optimizeImageAlpha(
  image: ImageData,
  settings: AlphaOptimizationSettings,
  globalY = 0,
): ImageData {
  if (!shouldOptimizeAlpha(settings)) return image

  const { width, height, data } = image
  const threshold = Math.max(0, Math.min(0.3, settings.cleanupPercent / 100))
  if (settings.dtfMode === 'solid') {
    const cutoff = Math.max(threshold, 0.5)
    for (let i = 0; i < data.length; i += 4) {
      const opaque = data[i + 3] / 255 >= cutoff
      data[i + 3] = opaque ? 255 : 0
      if (!opaque) { data[i] = 0; data[i + 1] = 0; data[i + 2] = 0 }
    }
    return image
  }

  // DTF detail-safe dithering. Unlike the old cell-average algorithm, this
  // never blends RGB values from neighboring pixels or modifies opaque artwork.
  // It only quantizes PARTIAL ALPHA at the location of each original pixel.
  // Full-opacity areas, internal lines and local color texture remain intact.
  const bayer4 = [
    0, 8, 2, 10,
    12, 4, 14, 6,
    3, 11, 1, 9,
    15, 7, 13, 5,
  ]
  // At 300 ppp a 2-pixel dot is ~0.17 mm. Adjustable in the next phase.
  const dot = 2
  const preserveAlpha = 192 // >=75% coverage becomes solid, not a dot field.
  for (let y = 0; y < height; y++) {
    const patternY = Math.floor((globalY + y) / dot) & 3
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const alpha = data[i + 3]
      if (alpha === 255) continue
      if (alpha <= threshold * 255) {
        data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 0
        continue
      }
      if (alpha >= preserveAlpha) {
        data[i + 3] = 255
        continue
      }
      const patternX = Math.floor(x / dot) & 3
      const cutoff = (bayer4[patternY * 4 + patternX] + 0.5) / 16
      if (alpha / 255 >= cutoff) {
        data[i + 3] = 255
      } else {
        data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 0
      }
    }
  }
  return image
}
