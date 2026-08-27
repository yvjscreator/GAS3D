import * as THREE from 'three'

const preparedTextures = new WeakMap<THREE.Texture, boolean>()

function cleanTransparentRgb(texture: THREE.Texture) {
  const image = texture.image as (CanvasImageSource & { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number }) | undefined
  const width = image?.naturalWidth ?? image?.width ?? 0
  const height = image?.naturalHeight ?? image?.height ?? 0
  if (!image || width <= 0 || height <= 0 || width * height > 4_000_000) return

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return
  try {
    context.clearRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)
    const imageData = context.getImageData(0, 0, width, height)
    const source = new Uint8ClampedArray(imageData.data)
    const output = imageData.data
    const radius = 3

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4
        const alpha = source[index + 3]
        if (alpha > 32) continue
        let red = 0, green = 0, blue = 0, weight = 0
        for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
          const sampleY = y + offsetY
          if (sampleY < 0 || sampleY >= height) continue
          for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
            const sampleX = x + offsetX
            if (sampleX < 0 || sampleX >= width || (offsetX === 0 && offsetY === 0)) continue
            const sampleIndex = (sampleY * width + sampleX) * 4
            const sampleAlpha = source[sampleIndex + 3]
            if (sampleAlpha < 48) continue
            const distanceWeight = 1 / (1 + offsetX * offsetX + offsetY * offsetY)
            const sampleWeight = sampleAlpha * distanceWeight
            red += source[sampleIndex] * sampleWeight
            green += source[sampleIndex + 1] * sampleWeight
            blue += source[sampleIndex + 2] * sampleWeight
            weight += sampleWeight
          }
        }
        if (weight > 0) {
          output[index] = Math.round(red / weight)
          output[index + 1] = Math.round(green / weight)
          output[index + 2] = Math.round(blue / weight)
        } else if (alpha === 0) {
          output[index] = 0
          output[index + 1] = 0
          output[index + 2] = 0
        }
      }
    }
    context.putImageData(imageData, 0, 0)
    texture.image = canvas
    texture.userData.printEdgeCleanup = 'straight-alpha-rgb-dilation-v1'
  } catch {
    // Cross-origin images can taint a canvas; keep the mathematically correct straight-alpha fallback.
  }
}

/**
 * Keeps uploaded PNG/WebP data in straight-alpha form. The shader performs the
 * single alpha multiplication, so faint glows and antialiased edges stay intact.
 */
export function preparePrintTexture(texture: THREE.Texture, premultiplyAlpha = false) {
  if (!premultiplyAlpha && !preparedTextures.has(texture)) {
    cleanTransparentRgb(texture)
  }
  preparedTextures.set(texture, premultiplyAlpha)
  texture.colorSpace = THREE.SRGBColorSpace
  // Premultiplication happens during the GPU upload, before mipmaps are built.
  // This is the alpha-correct path for very large transparent artwork, whose
  // invisible RGB data would otherwise bleed into downscaled edges.
  texture.premultiplyAlpha = premultiplyAlpha
  texture.generateMipmaps = true
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.needsUpdate = true
  return texture
}
