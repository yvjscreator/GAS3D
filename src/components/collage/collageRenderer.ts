import type { CollageBackground } from './collageStorage'

export type CollageImageDimensions = { width: number; height: number }
export type CollageSource = CollageImageDimensions & { url: string; background: CollageBackground }
export type CollagePanel = { x: number; width: number }

const PANEL_HEIGHT = 600
const OUTER_MARGIN = 46
const PANEL_GAP = 30
const MAX_EXPORT_WIDTH = 8192
const MAX_EXPORT_PIXELS = 16_000_000

// The export and the preview both use a common height and each source's own aspect ratio.
// Never create a fixed-width tile and letterbox artwork into it.
export function getCollageGeometry(images: readonly CollageImageDimensions[]) {
  if (!images.length) return { width: 0, height: 0, panelHeight: 0, gap: 0, margin: 0, panels: [] as CollagePanel[] }

  const panelWidths = images.map(({ width, height }) => {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new Error('Una de las imágenes no tiene dimensiones válidas.')
    }
    return PANEL_HEIGHT * width / height
  })
  const rawWidth = panelWidths.reduce((sum, width) => sum + width, 0) + (images.length - 1) * PANEL_GAP + 2 * OUTER_MARGIN
  const rawHeight = PANEL_HEIGHT + 2 * OUTER_MARGIN
  const scale = Math.min(1, MAX_EXPORT_WIDTH / rawWidth, Math.sqrt(MAX_EXPORT_PIXELS / (rawWidth * rawHeight)))
  const width = Math.max(1, Math.floor(rawWidth * scale))
  const height = Math.max(1, Math.floor(rawHeight * scale))
  const gap = PANEL_GAP * scale
  const margin = OUTER_MARGIN * scale
  const panelHeight = PANEL_HEIGHT * scale
  let x = margin
  const panels = panelWidths.map((sourceWidth) => {
    const panel = { x, width: sourceWidth * scale }
    x += panel.width + gap
    return panel
  })

  return { width, height, panelHeight, gap, margin, panels }
}

function decodeImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('No se pudo leer una de las imágenes del collage.'))
    image.src = src
  })
}

export async function getImageDimensions(src: string): Promise<CollageImageDimensions> {
  const image = await decodeImage(src)
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('Una de las imágenes no tiene dimensiones válidas.')
  return { width: image.naturalWidth, height: image.naturalHeight }
}

export async function renderCollage(sources: readonly CollageSource[]): Promise<Blob> {
  if (!sources.length) throw new Error('Primero añade al menos una imagen.')
  const size = getCollageGeometry(sources)
  if (size.panelHeight < 1 || size.panels.some((panel) => panel.width < 1)) {
    throw new Error('Las proporciones o la cantidad de imágenes exceden el tamaño de exportación compatible.')
  }
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
      const panel = size.panels[index]
      const image = await decodeImage(source.url)
      if (image.naturalWidth !== source.width || image.naturalHeight !== source.height) {
        throw new Error('Las dimensiones de una imagen han cambiado. Vuelve a añadirla.')
      }
      // This fill is only visible through transparent source pixels, never in sidebars.
      ctx.fillStyle = source.background === 'white' ? '#ffffff' : '#000000'
      ctx.fillRect(panel.x, size.margin, panel.width, size.panelHeight)
      ctx.drawImage(image, panel.x, size.margin, panel.width, size.panelHeight)
    }

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('El teléfono no pudo exportar el collage.')), 'image/png')
    })
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}
