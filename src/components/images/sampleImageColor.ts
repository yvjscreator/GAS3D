/** Map the transformed preview to ORIGINAL pixels, including zoom and pan. */
export function sourcePixelAt(
  clientX: number, clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  dimensions: { width: number; height: number },
): { x: number; y: number } | null {
  if (rect.width <= 0 || rect.height <= 0 || clientX < rect.left || clientY < rect.top
    || clientX >= rect.left + rect.width || clientY >= rect.top + rect.height) return null
  return {
    x: Math.min(dimensions.width - 1, Math.floor((clientX - rect.left) * (dimensions.width / rect.width))),
    y: Math.min(dimensions.height - 1, Math.floor((clientY - rect.top) * (dimensions.height / rect.height))),
  }
}

/** Read source color, never the already cleaned / halftoned preview. */
export async function sampleImageColor(file: Blob, bitmap: ImageBitmap | null, x: number, y: number): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  let crop: ImageBitmap | null = null
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' })
    if (!ctx) throw new Error('No se pudo leer el color de la imagen.')
    ctx.imageSmoothingEnabled = false
    if (bitmap) ctx.drawImage(bitmap, x, y, 1, 1, 0, 0, 1, 1)
    else {
      crop = await createImageBitmap(file, x, y, 1, 1, { colorSpaceConversion: 'default' })
      ctx.drawImage(crop, 0, 0)
    }
    const [r, g, b, alpha] = ctx.getImageData(0, 0, 1, 1).data
    if (!alpha) throw new Error('Ese punto ya es transparente. Tocá un píxel visible del fondo.')
    return '#' + [r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')
  } finally {
    crop?.close()
    canvas.width = 0
    canvas.height = 0
  }
}
