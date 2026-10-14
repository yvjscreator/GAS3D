export type PrintMethod = 'dtg' | 'dtf'
export type DtfAlphaMode = 'halftone' | 'solid' | 'preserve'
export type AlphaOptimizationSettings = {
  method: PrintMethod
  dtfMode: DtfAlphaMode
  /** Discard cells or pixels below this coverage (0..30%). */
  cleanupPercent: number
  /** Raster cluster size at final print resolution. Default 8 px at 300 ppp. */
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
 * Apply the FINAL printing treatment to the sized canvas. The exporter passes
 * strips whose y origin is aligned to cellPixels; this prevents seams at
 * chunk boundaries. RGBA alpha output for DTF solid/halftone is strictly 0/255.
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

  const cell = Math.max(4, Math.min(24, Math.round(settings.cellPixels)))
  // Clustered-dot ordering: center pixels fill first, then outward rings.
  // At low coverage tiny, unreliable print dots are removed by threshold.
  for (let y0 = 0; y0 < height;) {
    const absoluteY = globalY + y0
    const inCell = absoluteY % cell
    const h = Math.min(cell - inCell, height - y0)
    for (let x0 = 0; x0 < width; x0 += cell) {
      const w = Math.min(cell, width - x0)
      let sumAlpha = 0
      let sumRed = 0
      let sumGreen = 0
      let sumBlue = 0
      const dots: Array<{index: number; rank: number}> = []

      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          const index = ((y0 + dy) * width + x0 + dx) * 4
          const a = data[index + 3] / 255
          sumAlpha += a
          sumRed += data[index] * a
          sumGreen += data[index + 1] * a
          sumBlue += data[index + 2] * a
          const cellX = dx - (w - 1) / 2
          const cellY = (dy + inCell) - (cell - 1) / 2
          // Small tie-break to keep circles evenly shaped in symmetrical cells.
          const rank = cellX * cellX + cellY * cellY + ((dx * 17 + dy * 31) % 7) / 128
          dots.push({ index, rank })
        }
      }
      const coverage = sumAlpha / Math.max(1, dots.length)
      const count = coverage <= threshold ? 0 : coverage >= 0.999 ? dots.length :
        Math.max(0, Math.min(dots.length, Math.round(coverage * dots.length)))

      dots.sort((a, b) => a.rank - b.rank)
      const r = sumAlpha ? Math.round(sumRed / sumAlpha) : 0
      const g = sumAlpha ? Math.round(sumGreen / sumAlpha) : 0
      const b = sumAlpha ? Math.round(sumBlue / sumAlpha) : 0
      for (let n = 0; n < dots.length; n++) {
        const i = dots[n].index
        if (n < count) {
          data[i] = r
          data[i + 1] = g
          data[i + 2] = b
          data[i + 3] = 255
        } else {
          data[i] = 0
          data[i + 1] = 0
          data[i + 2] = 0
          data[i + 3] = 0
        }
      }
    }
    y0 += h
  }
  return image
}
