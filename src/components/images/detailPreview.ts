import { removeFabricInk, type InkRemovalMode, type InkRemovalSettings } from './imageProcessor'
import { optimizeImageAlpha, shouldOptimizeAlpha, type AlphaOptimizationSettings } from './alphaOptimization'

type DetailPreview = {
  bitmap: ImageBitmap | null
  file: Blob
  dimensions: { width: number; height: number }
  signal: AbortSignal
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
export async function paintNativeDetail({
  bitmap, file, dimensions, signal, viewport, image, overlay, settings, inkMode, showOriginal, alphaSettings,
}: DetailPreview): Promise<boolean> {
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
  const sourceL = (left - art.left) * dimensions.width / art.width
  const sourceT = (top - art.top) * dimensions.height / art.height
  const sourceR = (right - art.left) * dimensions.width / art.width
  const sourceB = (bottom - art.top) * dimensions.height / art.height

  // Keep a tiny native halo so edge/detail protection has neighboring pixels.
  const sx = clamp(Math.floor(sourceL) - 2, 0, dimensions.width - 1)
  const sy = clamp(Math.floor(sourceT) - 2, 0, dimensions.height - 1)
  const ex = clamp(Math.ceil(sourceR) + 2, sx + 1, dimensions.width)
  const ey = clamp(Math.ceil(sourceB) + 2, sy + 1, dimensions.height)
  const sw = ex - sx
  const sh = ey - sy

  // Do not fake "native detail" by shrinking the crop before processing.
  if (sw * sh > MAX_DETAIL_PIXELS) return false

  const work = document.createElement('canvas')
  work.width = sw
  work.height = sh
  let crop: ImageBitmap | null = null
  try {
    // Large-image mode retains the Blob instead of a full native bitmap.
    // Decode only this bounded crop; failure leaves the general preview usable.
    if (!bitmap) crop = await createImageBitmap(file, sx, sy, sw, sh, { colorSpaceConversion: 'default' })
    if (signal.aborted) return false
    overlay.width = Math.max(1, Math.round(frame.width * pixelRatio))
    overlay.height = Math.max(1, Math.round(frame.height * pixelRatio))
    const output = overlay.getContext('2d')
    if (!output) return false
    output.clearRect(0, 0, overlay.width, overlay.height)
    const ctx = work.getContext('2d', { willReadFrequently: !showOriginal })
    if (!ctx) return false
    ctx.imageSmoothingEnabled = false
    if (crop) ctx.drawImage(crop, 0, 0)
    else if (bitmap) ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh)

    if (!showOriginal) {
      const pixels = ctx.getImageData(0, 0, sw, sh)
      const processed = removeFabricInk(pixels, settings, inkMode)
      if (shouldOptimizeAlpha(alphaSettings)) optimizeImageAlpha(processed.image, alphaSettings, sy, sx)
      ctx.putImageData(processed.image, 0, 0)
    }

    const destLeft = (art.left - frame.left + sx * art.width / dimensions.width) * pixelRatio
    const destTop = (art.top - frame.top + sy * art.height / dimensions.height) * pixelRatio
    const destWidth = sw * art.width / dimensions.width * pixelRatio
    const destHeight = sh * art.height / dimensions.height * pixelRatio

    // When source pixels are being enlarged, keep them crisp. Only use high
    // quality filtering when the native crop is being reduced to the display.
    const sourceToScreen = Math.min(destWidth / sw, destHeight / sh)
    output.imageSmoothingEnabled = sourceToScreen < 1
    if (output.imageSmoothingEnabled) output.imageSmoothingQuality = 'high'
    output.drawImage(work, destLeft, destTop, destWidth, destHeight)
    return true
  } finally {
    crop?.close()
    work.width = 0
    work.height = 0
  }
}
