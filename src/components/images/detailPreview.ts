import { removeFabricInk, type InkRemovalMode, type InkRemovalSettings } from './imageProcessor'

type DetailPreview = {
  bitmap: ImageBitmap
  viewport: HTMLElement
  image: HTMLCanvasElement
  overlay: HTMLCanvasElement
  settings: InkRemovalSettings
  inkMode: InkRemovalMode
  showOriginal: boolean
}

const MAX_DETAIL_PIXELS = 2_500_000
const MAX_OVERLAY_PIXELS = 2_500_000
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/**
 * Redraw ONLY the visible portion of the original image into a screen-sized
 * overlay. Never zooms the downscaled preview pixels. Unlike rendering a
 * 4K frame at every wheel tick, this runs after navigation settles.
 *
 * The screen-position mapping comes from the zoomed image element's DOM rect,
 * so the overlay stays aligned with wheel-to-cursor zoom and drag pan.
 * It deliberately does not touch the export or original bitmap.
 */
export function paintNativeDetail({
  bitmap, viewport, image, overlay, settings, inkMode, showOriginal,
}: DetailPreview): boolean {
  const frame = viewport.getBoundingClientRect()
  const art = image.getBoundingClientRect()
  if (!frame.width || !frame.height || !art.width || !art.height) return false

  const left = Math.max(frame.left, art.left)
  const top = Math.max(frame.top, art.top)
  const right = Math.min(frame.right, art.right)
  const bottom = Math.min(frame.bottom, art.bottom)
  if (right <= left || bottom <= top) return false

  // The overlay is confined to a few megapixels, even on high-DPI displays.
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
  output.imageSmoothingEnabled = true
  output.imageSmoothingQuality = 'high'

  // Convert the visible part of the canvas into original image coordinates.
  const sourceL = (left - art.left) * bitmap.width / art.width
  const sourceT = (top - art.top) * bitmap.height / art.height
  const sourceR = (right - art.left) * bitmap.width / art.width
  const sourceB = (bottom - art.top) * bitmap.height / art.height

  // Include adjacent original pixels for texture/edge protection at crop seams.
  const sx = clamp(Math.floor(sourceL) - 2, 0, bitmap.width - 1)
  const sy = clamp(Math.floor(sourceT) - 2, 0, bitmap.height - 1)
  const ex = clamp(Math.ceil(sourceR) + 2, sx + 1, bitmap.width)
  const ey = clamp(Math.ceil(sourceB) + 2, sy + 1, bitmap.height)
  const sw = ex - sx
  const sh = ey - sy

  // If the area covers millions of source pixels, sample at DISPLAY density.
  // When zoomed far enough, native pixels are retained one-for-one.
  const displayWidth = (sw / bitmap.width) * art.width * pixelRatio
  const displayHeight = (sh / bitmap.height) * art.height * pixelRatio
  const density = Math.min(
    1,
    Math.max(displayWidth / sw, displayHeight / sh),
    Math.sqrt(MAX_DETAIL_PIXELS / (sw * sh)),
  )
  const work = document.createElement('canvas')
  work.width = Math.max(1, Math.round(sw * density))
  work.height = Math.max(1, Math.round(sh * density))
  try {
    const ctx = work.getContext('2d', { willReadFrequently: !showOriginal })
    if (!ctx) return false
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, work.width, work.height)

    if (!showOriginal) {
      const pixels = ctx.getImageData(0, 0, work.width, work.height)
      const processed = removeFabricInk(pixels, settings, inkMode)
      ctx.putImageData(processed.image, 0, 0)
    }

    const destLeft = (art.left - frame.left + sx * art.width / bitmap.width) * pixelRatio
    const destTop = (art.top - frame.top + sy * art.height / bitmap.height) * pixelRatio
    const destWidth = sw * art.width / bitmap.width * pixelRatio
    const destHeight = sh * art.height / bitmap.height * pixelRatio
    output.drawImage(work, destLeft, destTop, destWidth, destHeight)
    return true
  } finally {
    work.width = 0
    work.height = 0
  }
}
