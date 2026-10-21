import type { CollageBackground } from './collageStorage'

export type CollageImageDimensions = { width: number; height: number }
export type CollageQuality = 'maximum' | 'compatible'
export type CollageSource = CollageImageDimensions & { url: string; background: CollageBackground }
export type CollagePanel = { x: number; width: number }

const REFERENCE_HEIGHT = 600
const OUTER_MARGIN = 46
const PANEL_GAP = 30
const COMPATIBLE_MAX_WIDTH = 8192
const COMPATIBLE_MAX_HEIGHT = 8192
const COMPATIBLE_MAX_PIXELS = 16_000_000
const MAXIMUM_MAX_WIDTH = 16384
const MAXIMUM_MAX_HEIGHT = 16384
const MAXIMUM_MAX_PIXELS = 80_000_000

// Use the tallest original pixel height without silently reducing resolution.
// The output is one raster: images of different heights must be resampled
// to the common height, even when PNG encoding itself is lossless.
export function getCollageGeometry(images: readonly CollageImageDimensions[], quality: CollageQuality = 'maximum') {
  if (!images.length) return { width: 0, height: 0, panelHeight: 0, gap: 0, margin: 0, panels: [] as CollagePanel[], scale: 1, withinLimits: false }

  images.forEach(({ width, height }) => {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new Error('Una de las imágenes no tiene dimensiones válidas.')
    }
  })
  const commonHeight = Math.max(...images.map((image) => image.height))
  const ratio = commonHeight / REFERENCE_HEIGHT
  const rawMargin = OUTER_MARGIN * ratio
  const rawGap = PANEL_GAP * ratio
  const widths = images.map(({ width, height }) => commonHeight * width / height)
  const rawWidth = widths.reduce((total, width) => total + width, 0) + (images.length - 1) * rawGap + 2 * rawMargin
  const rawHeight = commonHeight + 2 * rawMargin
  const maxWidth = quality === 'compatible' ? COMPATIBLE_MAX_WIDTH : MAXIMUM_MAX_WIDTH
  const maxHeight = quality === 'compatible' ? COMPATIBLE_MAX_HEIGHT : MAXIMUM_MAX_HEIGHT
  const maxPixels = quality === 'compatible' ? COMPATIBLE_MAX_PIXELS : MAXIMUM_MAX_PIXELS
  const scale = quality === 'compatible'
    ? Math.min(1, maxWidth / rawWidth, maxHeight / rawHeight, Math.sqrt(maxPixels / (rawWidth * rawHeight)))
    : 1
  const width = quality === 'compatible' ? Math.max(1, Math.floor(rawWidth * scale)) : Math.max(1, Math.ceil(rawWidth))
  const height = quality === 'compatible' ? Math.max(1, Math.floor(rawHeight * scale)) : Math.max(1, Math.ceil(rawHeight))
  const margin = rawMargin * scale
  const gap = rawGap * scale
  const panelHeight = commonHeight * scale
  let x = margin
  const panels = widths.map((originalWidth) => {
    const panel = { x, width: originalWidth * scale }
    x += panel.width + gap
    return panel
  })
  const withinLimits = width <= maxWidth && height <= maxHeight && width * height <= maxPixels &&
    panelHeight >= 1 && panels.every((panel) => panel.width >= 1)
  return { width, height, panelHeight, gap, margin, panels, scale, withinLimits }
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

export async function renderCollage(sources: readonly CollageSource[], quality: CollageQuality = 'maximum'): Promise<Blob> {
  if (!sources.length) throw new Error('Primero añade al menos una imagen.')
  const size = getCollageGeometry(sources, quality)
  if (!size.withinLimits) {
    throw new Error('La resolución máxima supera el límite seguro. Selecciona Compatible para exportar este collage.')
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
      ctx.fillStyle = source.background === 'white' ? '#ffffff' : '#000000'
      ctx.fillRect(panel.x, size.margin, panel.width, size.panelHeight)
      ctx.drawImage(image, panel.x, size.margin, panel.width, size.panelHeight)
    }
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('El navegador no pudo generar el PNG a esta resolución. Prueba Compatible.')), 'image/png')
    })
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}
