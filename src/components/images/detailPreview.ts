import { removeFabricInk, type InkRemovalMode, type InkRemovalSettings } from './imageProcessor'
import { optimizeImageAlpha, shouldOptimizeAlpha, type AlphaOptimizationSettings } from './alphaOptimization'

type DetailPreview = {
  bitmap: ImageBitmap
  viewport: HTMLElement
  image: HTMLCanvasElement
  overlay: HTMLCanvasElement
  settings: InkRemovalSettings
  inkMode: InkRemovalMode
  showOriginal: boolean
  alphaSettings: AlphaOptimizationSettings
}

const MAX_DETAIL_PIXELS = 2_500_000
const MAX_OVERLAY_PIXELS = 2_500_000
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/**
 * Redraw ONLY the visible portion of the original bitmap.
 *
 * Important: processing happens at native source resolution. We deliberately
 * refuse to build a "detail" overlay while the visible crop is still too large
 * instead of downsampling it first. That prevents the creamy/soft appearance
 * caused by processing already-interpolated pixels.
 */
export function paintNativeDetail({
  bitmap, viewport, image, overlay, settings, inkMode, showOriginal, alphaSettings,
}: DetailPreview): boolean {
  const frame = viewport.getBoundingClientRect()
  const art = image.getBoundingClientRect()
  if (!frame.width || !frame.height || !art.width || !art.height) return false

  const left = Math.max(frame.left, art.left)
  const top = Math.max(frame.top, art.top)
  const right = Math.min(frame.right, art.right)
  const bottom = Math.min(frame.bottom, art.bottom)
  if (right <= left || bottom <= top) return false

  const pixelRatio = clamp(
    Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(MAX_OVERLAY_PIXELS / (frame.width * frame.height))),
    0.7,
    2,
  )
  overlay.width = Math.max(1, Math.round(frame.width * pixelRatio))
  overlay.height = Math.max(1, Math.round(frame.height * pixelRatio))
  const output = overlay.getContext('2d')
  if (!output) return false
  output.clearRect(0, 0, overlay.width, overlay.height)

  const sourceL = (left - art.left) * bitmap.width / art.width
  const sourceT = (top - art.top) * bitmap.height / art.height
  const sourceR = (right - art.left) * bitmap.width / art.width
  const sourceB = (bottom - art.top) * bitmap.height / art.height

  // Keep a tiny native halo so edge/detail protection has neighboring pixels.
  const sx = clamp(Math.floor(sourceL) - 2, 0, bitmap.width - 1)
  const sy = clamp(Math.floor(sourceT) - 2, 0, bitmap.height - 1)
  const ex = clamp(Math.ceil(sourceR) + 2, sx + 1, bitmap.width)
  const ey = clamp(Math.ceil(sourceB) + 2, sy + 1, bitmap.height)
  const sw = ex - sx
  const sh = ey - sy

  // Do not fake "native detail" by shrinking the crop before processing.
  if (sw * sh > MAX_DETAIL_PIXELS) return false

  const work = document.createElement('canvas')
  work.width = sw
  work.height = sh
  try {
    const ctx = work.getContext('2d', { willReadFrequently: !showOriginal })
    if (!ctx) return false
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh)

    if (!showOriginal) {
      const pixels = ctx.getImageData(0, 0, sw, sh)
      const processed = removeFabricInk(pixels, settings, inkMode)
      if (shouldOptimizeAlpha(alphaSettings)) optimizeImageAlpha(processed.image, alphaSettings, sy)
      ctx.putImageData(processed.image, 0, 0)
    }

    const destLeft = (art.left - frame.left + sx * art.width / bitmap.width) * pixelRatio
    const destTop = (art.top - frame.top + sy * art.height / bitmap.height) * pixelRatio
    const destWidth = sw * art.width / bitmap.width * pixelRatio
    const destHeight = sh * art.height / bitmap.height * pixelRatio

    // When source pixels are being enlarged, keep them crisp. Only use high
    // quality filtering when the native crop is being reduced to the display.
    const sourceToScreen = Math.min(destWidth / sw, destHeight / sh)
    output.imageSmoothingEnabled = sourceToScreen < 1
    if (output.imageSmoothingEnabled) output.imageSmoothingQuality = 'high'
    output.drawImage(work, destLeft, destTop, destWidth, destHeight)
    return true
  } finally {
    work.width = 0
    work.height = 0
  }
}
