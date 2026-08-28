import type { AlphaPipelineMode, AssetQualityProfile } from '../types/studio'

export interface PreparedVideoAssetMetadata {
  originalName: string
  originalWidth: number
  originalHeight: number
  originalBytes: number
  proxyWidth: number
  proxyHeight: number
  renderBytes: number
  thumbnailWidth: number
  thumbnailHeight: number
  thumbnailBytes: number
  profile: AssetQualityProfile
  alphaMode: AlphaPipelineMode
  mimeType: string
  createdAt: number
}

export interface PreparedVideoAsset {
  renderBlob: Blob
  thumbnailBlob: Blob
  metadata: PreparedVideoAssetMetadata
}

export type PrepareVideoAssetSettings = {
  profile?: AssetQualityProfile
  maxEdge?: number
  thumbnailEdge?: number
  mimeType?: 'image/png' | 'image/webp'
  quality?: number
  alphaMode?: AlphaPipelineMode
}

const profileEdges: Record<AssetQualityProfile, number> = { performance: 1536, automatic: 3072, quality: 4096 }

function fittedSize(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('No se pudo codificar la imagen.')), type, quality))
}

function cleanTransparentRgb(context: CanvasRenderingContext2D, width: number, height: number) {
  if (width * height > 4_200_000) return
  const image = context.getImageData(0, 0, width, height)
  const source = new Uint8ClampedArray(image.data)
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const index = (y * width + x) * 4
    if (source[index + 3] > 32) continue
    let red = 0; let green = 0; let blue = 0; let weight = 0
    for (let oy = -2; oy <= 2; oy += 1) for (let ox = -2; ox <= 2; ox += 1) {
      const sx = x + ox; const sy = y + oy
      if (sx < 0 || sx >= width || sy < 0 || sy >= height || (!ox && !oy)) continue
      const sample = (sy * width + sx) * 4; const alpha = source[sample + 3]
      if (alpha < 48) continue
      const sampleWeight = alpha / (1 + ox * ox + oy * oy)
      red += source[sample] * sampleWeight; green += source[sample + 1] * sampleWeight; blue += source[sample + 2] * sampleWeight; weight += sampleWeight
    }
    if (weight) { image.data[index] = red / weight; image.data[index + 1] = green / weight; image.data[index + 2] = blue / weight }
    else if (!source[index + 3]) { image.data[index] = 0; image.data[index + 1] = 0; image.data[index + 2] = 0 }
  }
  context.putImageData(image, 0, 0)
}

async function renderBitmap(bitmap: ImageBitmap, width: number, height: number, mimeType: string, quality?: number, cleanup = false) {
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const context = canvas.getContext('2d', { alpha: true })
  if (!context) throw new Error('No se pudo preparar el canvas de imagen.')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.clearRect(0, 0, width, height)
  context.drawImage(bitmap, 0, 0, width, height)
  if (cleanup) cleanTransparentRgb(context, width, height)
  return canvasBlob(canvas, mimeType, quality)
}

export async function prepareVideoAsset(file: File, settings: PrepareVideoAssetSettings = {}): Promise<PreparedVideoAsset> {
  const profile = settings.profile ?? 'automatic'
  const alphaMode = settings.alphaMode ?? 'pngCurrent'
  const maxEdge = settings.maxEdge ?? profileEdges[profile]
  const thumbnailEdge = settings.thumbnailEdge ?? 256
  const mimeType = settings.mimeType ?? (alphaMode === 'webpLossless' || alphaMode === 'webpHigh' ? 'image/webp' : 'image/png')
  const quality = settings.quality ?? (alphaMode === 'webpHigh' ? .92 : alphaMode === 'webpLossless' ? 1 : undefined)
  const bitmap = await createImageBitmap(file)
  try {
    const proxy = fittedSize(bitmap.width, bitmap.height, maxEdge)
    const thumbnail = fittedSize(bitmap.width, bitmap.height, thumbnailEdge)
    const [renderBlob, thumbnailBlob] = await Promise.all([
      renderBitmap(bitmap, proxy.width, proxy.height, mimeType, quality, alphaMode === 'straightAlpha'),
      renderBitmap(bitmap, thumbnail.width, thumbnail.height, 'image/webp', .86),
    ])
    return {
      renderBlob,
      thumbnailBlob,
      metadata: {
        originalName: file.name,
        originalWidth: bitmap.width,
        originalHeight: bitmap.height,
        originalBytes: file.size,
        proxyWidth: proxy.width,
        proxyHeight: proxy.height,
        renderBytes: renderBlob.size,
        thumbnailWidth: thumbnail.width,
        thumbnailHeight: thumbnail.height,
        thumbnailBytes: thumbnailBlob.size,
        profile,
        alphaMode,
        mimeType,
        createdAt: Date.now(),
      },
    }
  } finally { bitmap.close() }
}
