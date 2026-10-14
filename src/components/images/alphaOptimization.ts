export type PrintMethod = 'dtg' | 'dtf'
export type DtfAlphaMode = 'halftone' | 'solid' | 'preserve' | 'aggressive'
export type AlphaOptimizationSettings = {
  method: PrintMethod
  dtfMode: DtfAlphaMode
  /** Discard cells or pixels below this coverage (0..30%). */
  cleanupPercent: number
  /** Approximate DTF dot pitch, in output pixels (8 = fine). */
  cellPixels: number
  /** How strongly local high-contrast contours are protected (0..100). */
  detailProtection?: number
}
export const DEFAULT_ALPHA_SETTINGS: AlphaOptimizationSettings = {
  method: 'dtg',
  dtfMode: 'halftone',
  cleanupPercent: 10,
  cellPixels: 8,
  detailProtection: 85,
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
  // Work against an immutable snapshot: pixels already quantized in a previous
  // column must never be mistaken for missing source detail.
  const source = new Uint8ClampedArray(data)
  const protection = settings.dtfMode === 'aggressive' ? 0
    : Math.max(0, Math.min(1, (settings.detailProtection ?? 85) / 100))
  const dot = Math.max(1, Math.min(5, Math.round(settings.cellPixels / 4)))
  const solidAlpha = 255 - Math.round(82 * protection)
  const edgeAlpha = 160 - Math.round(80 * protection)
  const rgbEdgeThreshold = 72 - Math.round(49 * protection)

  for (let y = 0; y < height; y++) {
    const patternY = Math.floor((globalY + y) / dot) & 3
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const alpha = source[i + 3]
      if (alpha === 255) continue
      if (alpha <= threshold * 255) {
        data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 0
        continue
      }

      // Solidify already-visible regions, plus high-contrast details such as
      // eyes, contour ink and facial marks. Flat fades still use dithering.
      let protect = protection > 0 && alpha >= solidAlpha
      if (!protect && protection > 0 && alpha >= edgeAlpha) {
        const neighbors = [
          x > 0 ? i - 4 : -1,
          x + 1 < width ? i + 4 : -1,
          y > 0 ? i - width * 4 : -1,
          y + 1 < height ? i + width * 4 : -1,
        ]
        for (const n of neighbors) {
          if (n < 0 || source[n + 3] < 75) continue
          const rgbContrast = Math.max(
            Math.abs(source[i] - source[n]),
            Math.abs(source[i + 1] - source[n + 1]),
            Math.abs(source[i + 2] - source[n + 2]),
          )
          if (rgbContrast >= rgbEdgeThreshold) {
            protect = true
            break
          }
        }
      }
      if (protect) {
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
