export type PrintMethod = 'dtg' | 'dtf'
export type DtfAlphaMode = 'halftone' | 'solid' | 'preserve' | 'aggressive'
export type DtfPattern = 'stochastic' | 'dots' | 'lines' | 'ordered'
export type AlphaOptimizationSettings = {
  method: PrintMethod
  dtfMode: DtfAlphaMode
  /** Discard cells or pixels below this coverage (0..30%). */
  cleanupPercent: number
  /** Approximate DTF dot pitch, in output pixels (8 = fine). */
  cellPixels: number
  /** Halftone distribution. Stochastic avoids visible ordered-grid/cross artifacts. */
  pattern?: DtfPattern
  /** Screen rotation in degrees, used by round dots and lines. */
  angle?: number
  /** How strongly local high-contrast contours are protected (0..100). */
  detailProtection?: number
}
export const DEFAULT_ALPHA_SETTINGS: AlphaOptimizationSettings = {
  method: 'dtg',
  dtfMode: 'halftone',
  cleanupPercent: 10,
  cellPixels: 8,
  pattern: 'stochastic',
  angle: 45,
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

const bayer4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
]

// Area inside a circle clipped by a unit square. Using area, rather than
// radius alone, keeps dot coverage proportional to alpha even above 50%.
// A lookup avoids inverse trig in the native-resolution pixel loop.
const roundCoverage = Float32Array.from({ length: 2049 }, (_, index) => {
  const radiusSquared = index / 4096
  if (radiusSquared <= 0.25) return Math.PI * radiusSquared
  return Math.PI * radiusSquared - 4 * (
    radiusSquared * Math.acos(0.5 / Math.sqrt(radiusSquared))
    - 0.5 * Math.sqrt(radiusSquared - 0.25)
  )
})

function hash01(x: number, y: number) {
  let value = Math.imul(x ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(y ^ 0xc2b2ae35, 0x27d4eb2f)
  value ^= value >>> 15
  value = Math.imul(value, 0x2c1b3c6d)
  value ^= value >>> 12
  value = Math.imul(value, 0x297a2d39)
  value ^= value >>> 15
  return (value >>> 0) / 0x1_0000_0000
}

function createPatternSampler(settings: AlphaOptimizationSettings) {
  const pattern = settings.pattern ?? 'stochastic'
  const pitch = Math.max(1, Number.isFinite(settings.cellPixels) ? settings.cellPixels : 8)
  const angle = (Number.isFinite(settings.angle) ? settings.angle! : 45) * Math.PI / 180
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  // Preserve the existing three dot-size choices while changing only the
  // spatial distribution. A block is 2/3/4 px for fine/medium/coarse.
  const block = Math.max(1, Math.min(8, Math.round(pitch / 4)))
  return (x: number, y: number) => {
    const px = Math.floor(x / block)
    const py = Math.floor(y / block)

    if (pattern === 'stochastic') return Math.max(1 / 256, hash01(px, py))

    const localX = ((px % 4) + 4) & 3
    const localY = ((py % 4) + 4) & 3
    if (pattern === 'ordered') return (bayer4[localY * 4 + localX] + 0.5) / 16

    // Evaluate in source coordinates: cropping, panning and export strips
    // must all sample exactly the same screen, including negative rotations.
    const u = (x * cosine + y * sine) / pitch
    const v = (-x * sine + y * cosine) / pitch
    const dx = u - Math.floor(u) - 0.5
    if (pattern === 'lines') return Math.abs(dx) * 2
    const dy = v - Math.floor(v) - 0.5
    return roundCoverage[Math.min(2048, Math.round((dx * dx + dy * dy) * 4096))]
  }
}

/**
 * Native output has binary alpha. Global source origins keep cropped detail
 * and export strips aligned. pixelScale > 1 is ONLY for the reduced overview:
 * subpixel patterns are filtered to coverage instead of showing oversized dots.
 */
export function optimizeImageAlpha(
  image: ImageData,
  settings: AlphaOptimizationSettings,
  globalY = 0,
  globalX = 0,
  pixelScale = 1,
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
  const protection = settings.dtfMode === 'aggressive' ? 0
    : Math.max(0, Math.min(1, (settings.detailProtection ?? 85) / 100))
  const source = protection > 0 ? new Uint8ClampedArray(data) : data
  const sample = createPatternSampler(settings)
  const scale = Math.max(1, pixelScale)
  const spacing = settings.pattern === 'stochastic' || !settings.pattern
    ? Math.max(1, Math.round(settings.cellPixels / 4)) : settings.cellPixels
  const filteredOverview = scale > 1 && spacing < scale * 2
  const solidAlpha = 255 - Math.round(82 * protection)
  const edgeAlpha = 160 - Math.round(80 * protection)
  const rgbEdgeThreshold = 72 - Math.round(49 * protection)

  for (let y = 0; y < height; y++) {
    const patternY = globalY + (y + 0.5) * scale
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

      if (filteredOverview) continue
      const cutoff = sample(globalX + (x + 0.5) * scale, patternY)
      if (alpha / 255 >= cutoff) {
        data[i + 3] = 255
      } else {
        data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 0
      }
    }
  }
  return image
}
