export type ImagePreset = 'pure' | 'balanced' | 'deep'
export type InkRemovalMode = 'black' | 'white' | 'custom'
export type ImagePreviewMode = 'transparent' | 'black' | 'white' | 'custom' | 'shirt'

/** Historical key names preserved to keep Image Studio settings easy to extend. */
export type InkRemovalSettings = {
  blackThreshold: number
  shadowThreshold: number
  detailProtection: number
  softness: number
  noiseCleanup: number
  /** Optional for backwards-compatible black/white saved settings. */
  keyColor?: string
}
export type InkAdjustment = Exclude<keyof InkRemovalSettings, 'keyColor'>

export function normalizeKeyColor(value: string): string | null {
  const hex = value.trim().replace(/^#/, '')
  if (/^[a-f\d]{6}$/i.test(hex)) return '#' + hex.toLowerCase()
  if (/^[a-f\d]{3}$/i.test(hex)) return '#' + [...hex].map((digit) => digit + digit).join('').toLowerCase()
  return null
}
export const DEFAULT_KEY_COLOR = '#061c3d'

export function keyColorRgb(value = DEFAULT_KEY_COLOR): [number, number, number] {
  const hex = normalizeKeyColor(value) ?? DEFAULT_KEY_COLOR
  return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16)) as [number, number, number]
}

type ImagePresetDefinition = {
  name: string
  description: string
  settings: InkRemovalSettings
}

export const imagePresets: Record<InkRemovalMode, Record<ImagePreset, ImagePresetDefinition>> = {
  black: {
    pure: {
      name: 'Negro puro',
      description: 'Elimina negro RGB 0, sin afectar sombras.',
      settings: { blackThreshold: 0, shadowThreshold: 0, detailProtection: 100, softness: 0, noiseCleanup: 0 },
    },
    balanced: {
      name: 'Negros + sombras',
      description: 'Reduce negro, casi negro y sombras para prendas negras.',
      settings: { blackThreshold: 22, shadowThreshold: 105, detailProtection: 60, softness: 8, noiseCleanup: 0 },
    },
    deep: {
      name: 'Agresivo',
      description: 'Reduce sombras oscuras de forma más intensa.',
      settings: { blackThreshold: 36, shadowThreshold: 150, detailProtection: 30, softness: 12, noiseCleanup: 1 },
    },
  },
  white: {
    pure: {
      name: 'Blanco puro',
      description: 'Elimina blanco RGB 255, sin afectar iluminaciones.',
      settings: { blackThreshold: 0, shadowThreshold: 0, detailProtection: 100, softness: 0, noiseCleanup: 0 },
    },
    balanced: {
      name: 'Blancos + luces',
      description: 'Elimina blanco, casi blanco y gradúa zonas iluminadas.',
      settings: { blackThreshold: 22, shadowThreshold: 105, detailProtection: 60, softness: 8, noiseCleanup: 0 },
    },
    deep: {
      name: 'Agresivo',
      description: 'Elimina también iluminaciones claras intensamente.',
      settings: { blackThreshold: 36, shadowThreshold: 150, detailProtection: 30, softness: 12, noiseCleanup: 1 },
    },
  },
  custom: {
    pure: {
      name: 'Color exacto',
      description: 'Elimina únicamente el color seleccionado.',
      settings: { blackThreshold: 0, shadowThreshold: 0, detailProtection: 100, softness: 0, noiseCleanup: 0 },
    },
    balanced: {
      name: 'Equilibrado',
      description: 'Elimina el color y pequeñas variaciones, con bordes suaves.',
      settings: { blackThreshold: 12, shadowThreshold: 36, detailProtection: 85, softness: 6, noiseCleanup: 0 },
    },
    deep: {
      name: 'Ampliado',
      description: 'Incluye más tonos parecidos al color seleccionado.',
      settings: { blackThreshold: 28, shadowThreshold: 65, detailProtection: 65, softness: 12, noiseCleanup: 0 },
    },
  },
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

/**
 * Distance from the color that the fabric supplies.
 * For black, the maximum channel preserves saturated colors (e.g. bright red).
 * For white, the inverted minimum channel preserves saturated/dark colors.
 */
const distanceFromFabric = (r: number, g: number, b: number, mode: InkRemovalMode) =>
  mode === 'black' ? Math.max(r, g, b) : 255 - Math.min(r, g, b)

/**
 * Pixel-only image treatment for art authored on a selected solid background.
 *
 * All exactly black pixels disappear in black mode; all exactly white pixels
 * disappear in white mode, even within the artwork. Midtones fade according
 * to the same adjustable threshold and detail-protection model.
 *
 * Unmatte when alpha is reduced, compensating for the original solid
 * background to avoid obvious colored edge fringes. Existing alpha
 * is never increased; there is no generative reconstruction.
 */
export function removeFabricInk(
  source: ImageData,
  settings: InkRemovalSettings,
  mode: InkRemovalMode,
): { image: ImageData; removedPixels: number } {
  const { width, height } = source
  const src = source.data
  const dst = new Uint8ClampedArray(src.length)
  const primary = Math.max(0, settings.blackThreshold)
  const secondary = Math.max(primary, settings.shadowThreshold)
  const softness = Math.max(0, settings.softness)
  const protection = clamp01(settings.detailProtection / 100)
  const cleanup = Math.max(0, Math.round(settings.noiseCleanup))
  const matte = mode === 'custom' ? keyColorRgb(settings.keyColor) : mode === 'white' ? [255, 255, 255] : [0, 0, 0]
  const distanceToKey = mode === 'custom'
    ? (r: number, g: number, b: number) => Math.max(Math.abs(r - matte[0]), Math.abs(g - matte[1]), Math.abs(b - matte[2]))
    : (r: number, g: number, b: number) => distanceFromFabric(r, g, b, mode)
  const secondaryStrength = secondary > primary ? 1 - protection * 0.72 : 0
  let removedPixels = 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4
      const originalAlpha = src[index + 3]
      if (!originalAlpha) {
        removedPixels++
        continue
      }

      const r = src[index]
      const g = src[index + 1]
      const b = src[index + 2]
      const distance = distanceToKey(r, g, b)

      if (distance === 0 || (softness === 0 && distance <= primary)) {
        removedPixels++
        continue
      }

      let cutoff = 1
      if (softness > 0) {
        const lower = Math.max(0, primary - softness * 0.5)
        const upper = primary + softness * 0.5
        cutoff = clamp01((distance - lower) / Math.max(0.0001, upper - lower))
        cutoff = cutoff * cutoff * (3 - 2 * cutoff)
      } else if (distance <= primary) {
        cutoff = 0
      }

      const nearFabric = secondary <= primary ? 0 : clamp01((secondary - distance) / (secondary - primary))
      const matteAlpha = mode === 'custom' ? Math.max(
        r >= matte[0] ? (r - matte[0]) / Math.max(1, 255 - matte[0]) : (matte[0] - r) / Math.max(1, matte[0]),
        g >= matte[1] ? (g - matte[1]) / Math.max(1, 255 - matte[1]) : (matte[1] - g) / Math.max(1, matte[1]),
        b >= matte[2] ? (b - matte[2]) / Math.max(1, 255 - matte[2]) : (matte[2] - b) / Math.max(1, matte[2]),
      ) : distance / 255
      const secondaryMix = secondaryStrength * nearFabric
      let alpha = (1 - secondaryMix + secondaryMix * matteAlpha) * cutoff

      if (protection > 0 && secondary > primary && distance > primary) {
        const neighborX = Math.min(width - 1, x + 1)
        const neighborY = Math.min(height - 1, y + 1)
        const right = (y * width + neighborX) * 4
        const below = (neighborY * width + x) * 4
        const contrast = Math.max(
          Math.abs(distance - distanceToKey(src[right], src[right + 1], src[right + 2])),
          Math.abs(distance - distanceToKey(src[below], src[below + 1], src[below + 2])),
        )
        alpha += (1 - alpha) * clamp01(contrast / 96) * protection * 0.28 * cutoff
      }

      if (cleanup && distance < secondary && alpha < 0.55 && width > 2 && height > 2) {
        let neighbors = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue
            const xx = x + dx
            const yy = y + dy
            if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue
            const j = (yy * width + xx) * 4
            if (src[j + 3] > 0 && distanceToKey(src[j], src[j + 1], src[j + 2]) > primary) neighbors++
          }
        }
        if (neighbors <= cleanup) alpha = 0
      }

      alpha = clamp01(alpha)
      const actualAlpha = originalAlpha * alpha
      if (actualAlpha < 0.5) {
        removedPixels++
        continue
      }

      const recover = alpha > 0 ? 1 / alpha : 1
      // Recover foreground from the selected matte, including chromatic
      // backgrounds. Exact removal leaves all surviving RGB bytes unchanged.
      if (mode === 'black') {
        dst[index] = Math.min(255, r * recover)
        dst[index + 1] = Math.min(255, g * recover)
        dst[index + 2] = Math.min(255, b * recover)
      } else if (mode === 'white') {
        dst[index] = Math.max(0, 255 - (255 - r) * recover)
        dst[index + 1] = Math.max(0, 255 - (255 - g) * recover)
        dst[index + 2] = Math.max(0, 255 - (255 - b) * recover)
      } else {
        dst[index] = matte[0] + (r - matte[0]) * recover
        dst[index + 1] = matte[1] + (g - matte[1]) * recover
        dst[index + 2] = matte[2] + (b - matte[2]) * recover
      }
      dst[index + 3] = Math.round(actualAlpha)
    }
  }
  return { image: new ImageData(dst, width, height), removedPixels }
}
