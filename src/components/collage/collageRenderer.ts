import type { CollageBackground } from './collageStorage'

export type CollageSource = { url: string; background: CollageBackground }

const PANEL_WIDTH = 480
const PANEL_HEIGHT = 600
const OUTER_MARGIN = 46
const PANEL_GAP = 30
const MAX_EXPORT_WIDTH = 8192
const MAX_EXPORT_PIXELS = 16_000_000

export function getCollageGeometry(count: number) {
  const n = Math.max(1, Math.floor(Number.isFinite(count) ? count : 1))
  const rawWidth = n * PANEL_WIDTH + (n - 1) * PANEL_GAP + 2 * OUTER_MARGIN
  const rawHeight = PANEL_HEIGHT + 2 * OUTER_MARGIN
  const scale = Math.min(1, MAX_EXPORT_WIDTH / rawWidth, Math.sqrt(MAX_EXPORT_PIXELS / (rawWidth * rawHeight)))
  const width = Math.max(1, Math.floor(rawWidth * scale))
  const height = Math.max(1, Math.floor(rawHeight * scale))
  return {
    width,
    height,
    panelWidth: PANEL_WIDTH * scale,
    panelHeight: PANEL_HEIGHT * scale,
    gap: PANEL_GAP * scale,
    margin: OUTER_MARGIN * scale,
  }
}

function decodeImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('No se pudo leer una de las imágenes del collage.'))
    image.src = src
  })
}

export async function renderCollage(sources: readonly CollageSource[]): Promise<Blob> {
  if (!sources.length) throw new Error('Primero añade al menos una imagen.')
  const size = getCollageGeometry(sources.length)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('No se pudo crear el lienzo de exportación en este dispositivo.')

  try {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, size.width, size.height)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    for (const [index, source] of sources.entries()) {
      const x = size.margin + index * (size.panelWidth + size.gap)
      const y = size.margin
      ctx.fillStyle = source.background === 'white' ? '#ffffff' : '#000000'
      ctx.fillRect(x, y, size.panelWidth, size.panelHeight)

      const image = await decodeImage(source.url)
      const imageWidth = image.naturalWidth
      const imageHeight = image.naturalHeight
      if (!imageWidth || !imageHeight) throw new Error('Una de las imágenes no tiene dimensiones válidas.')
      const ratio = Math.min(size.panelWidth / imageWidth, size.panelHeight / imageHeight)
      const drawWidth = imageWidth * ratio
      const drawHeight = imageHeight * ratio
      ctx.drawImage(image, x + (size.panelWidth - drawWidth) / 2, y + (size.panelHeight - drawHeight) / 2, drawWidth, drawHeight)
    }

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('El teléfono no pudo exportar el collage.')), 'image/png')
    })
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}
