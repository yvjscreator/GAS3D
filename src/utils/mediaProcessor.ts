export type VideoAssetProfile = 'performance' | 'automatic' | 'quality'

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
  profile: VideoAssetProfile
  alphaMode: string
  mimeType: string
  createdAt: number
}

export interface PreparedVideoAsset {
  renderBlob: Blob
  thumbnailBlob: Blob
  metadata: PreparedVideoAssetMetadata
}

export type PrepareVideoAssetSettings = {
  profile?: VideoAssetProfile
  maxEdge?: number
  thumbnailEdge?: number
  mimeType?: 'image/png' | 'image/webp'
  quality?: number
  alphaMode?: string
}

const profileEdges: Record<VideoAssetProfile, number> = { performance: 1536, automatic: 3072, quality: 4096 }

function fittedSize(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('No se pudo codificar la imagen.')), type, quality))
}

async function renderBitmap(bitmap: ImageBitmap, width: number, height: number, mimeType: string, quality?: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const context = canvas.getContext('2d', { alpha: true })
  if (!context) throw new Error('No se pudo preparar el canvas de imagen.')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.clearRect(0, 0, width, height)
  context.drawImage(bitmap, 0, 0, width, height)
  return canvasBlob(canvas, mimeType, quality)
}

export async function prepareVideoAsset(file: File, settings: PrepareVideoAssetSettings = {}): Promise<PreparedVideoAsset> {
  const profile = settings.profile ?? 'automatic'
  const maxEdge = settings.maxEdge ?? profileEdges[profile]
  const thumbnailEdge = settings.thumbnailEdge ?? 256
  const mimeType = settings.mimeType ?? 'image/png'
  const bitmap = await createImageBitmap(file)
  try {
    const proxy = fittedSize(bitmap.width, bitmap.height, maxEdge)
    const thumbnail = fittedSize(bitmap.width, bitmap.height, thumbnailEdge)
    const [renderBlob, thumbnailBlob] = await Promise.all([
      renderBitmap(bitmap, proxy.width, proxy.height, mimeType, settings.quality),
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
        alphaMode: settings.alphaMode ?? 'current',
        mimeType,
        createdAt: Date.now(),
      },
    }
  } finally { bitmap.close() }
}
