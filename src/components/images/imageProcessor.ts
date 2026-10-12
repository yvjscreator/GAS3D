export type ImagePreset = 'pure' | 'balanced' | 'deep'
export type ImagePreviewMode = 'transparent' | 'black' | 'shirt'

export type BlackInkSettings = {
  blackThreshold: number
  shadowThreshold: number
  detailProtection: number
  softness: number
  noiseCleanup: number
}

export const imagePresets: Record<ImagePreset, {
  name: string
  description: string
  settings: BlackInkSettings
}> = {
  pure: {
    name: 'Negro puro',
    description: 'Quita el negro sin modificar las sombras restantes.',
    settings: { blackThreshold: 0, shadowThreshold: 0, detailProtection: 100, softness: 0, noiseCleanup: 0 },
  },
  balanced: {
    name: 'Negros + sombras',
    description: 'Transparencia gradual para integrar el diseño a la tela.',
    settings: { blackThreshold: 22, shadowThreshold: 105, detailProtection: 60, softness: 8, noiseCleanup: 0 },
  },
  deep: {
    name: 'Agresivo',
    description: 'Reduce más sombras y manchas oscuras.',
    settings: { blackThreshold: 36, shadowThreshold: 150, detailProtection: 30, softness: 12, noiseCleanup: 1 },
  },
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

/**
 * Removes ink that should be supplied by the black fabric.
 *
 * Reconstructs non-black RGB from the original black-matted image wherever
 * translucency is introduced. That avoids importing premultiplied dark fringes
 * from JPG/opaque PNG art into a transparent output.
 *
 * Original alpha is always preserved as an upper bound; there is no AI fill,
 * geometric alteration or image resampling in the export path.
 */
export function removeBlackInk(source: ImageData, settings: BlackInkSettings): {
  image: ImageData
  removedPixels: number
} {
  const { width, height } = source
  const src = source.data
  const dst = new Uint8ClampedArray(src.length)
  const black = Math.max(0, settings.blackThreshold)
  const shadow = Math.max(black, settings.shadowThreshold)
  const softness = Math.max(0, settings.softness)
  const protection = clamp01(settings.detailProtection / 100)
  const cleanup = Math.max(0, Math.round(settings.noiseCleanup))
  const shadowStrength = shadow > black ? 1 - protection * 0.72 : 0
  let removedPixels = 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4
      const originalAlpha = src[index + 3]
      if (!originalAlpha) {
        continue
      }

      const r = src[index]
      const g = src[index + 1]
      const b = src[index + 2]
      const brightness = Math.max(r, g, b)
      // Explicitly remove all pure black, even inside the artwork.
      if (brightness === 0 || (softness === 0 && brightness <= black)) {
        removedPixels++
        continue
      }

      let cutoff = 1
      if (softness > 0) {
        const lower = Math.max(0, black - softness * 0.5)
        const upper = black + softness * 0.5
        cutoff = clamp01((brightness - lower) / Math.max(0.0001, upper - lower))
        cutoff = cutoff * cutoff * (3 - 2 * cutoff)
      } else if (brightness <= black) {
        cutoff = 0
      }

      const darkerPart = shadow <= black ? 0 : clamp01((shadow - brightness) / (shadow - black))
      // 1.0 is opaque. Unmatting dark pixels recovers their original appearance
      // on black while reducing printed ink in dark/shadow regions.
      const matteAlpha = brightness / 255
      const shadowMix = shadowStrength * darkerPart
      let alpha = (1 - shadowMix + shadowMix * matteAlpha) * cutoff

      // Retain locally contrasted, non-black fine details where requested.
      if (protection > 0 && shadow > black && brightness > black) {
        const neighborX = Math.min(width - 1, x + 1)
        const neighborY = Math.min(height - 1, y + 1)
        const right = (y * width + neighborX) * 4
        const below = (neighborY * width + x) * 4
        const contrast = Math.max(
          Math.abs(brightness - Math.max(src[right], src[right + 1], src[right + 2])),
          Math.abs(brightness - Math.max(src[below], src[below + 1], src[below + 2])),
        )
        alpha += (1 - alpha) * clamp01(contrast / 96) * protection * 0.28 * cutoff
      }

      // Remove isolated faint ink dust. Never touch fully bright elements.
      if (cleanup && brightness < shadow && alpha < 0.55 && width > 2 && height > 2) {
        let neighbors = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue
            const xx = x + dx
            const yy = y + dy
            if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue
            const j = (yy * width + xx) * 4
            if (src[j + 3] > 0 && Math.max(src[j], src[j + 1], src[j + 2]) > black) neighbors++
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

      // Unmatte only to the extent that alpha was reduced, respecting gamut.
      // Composite over black closely approximates the original pixels.
      const recover = alpha > 0 ? 1 / alpha : 1
      dst[index] = Math.min(255, r * recover)
      dst[index + 1] = Math.min(255, g * recover)
      dst[index + 2] = Math.min(255, b * recover)
      dst[index + 3] = Math.round(actualAlpha)
    }
  }

  return { image: new ImageData(dst, width, height), removedPixels }
}
