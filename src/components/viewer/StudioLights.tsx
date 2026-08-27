import { useEffect, type RefObject } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { BackgroundSettings } from '../../types/studio'
import type { AmbilightRig } from './ambilightRig'

const SAMPLE_WIDTH = 24
const SAMPLE_HEIGHT = 14
const SAMPLE_INTERVAL_MS = 120

function sampleRegion(data: Uint8ClampedArray, fromX: number, toX: number, fromY: number, toY: number) {
  let red = 0
  let green = 0
  let blue = 0
  let count = 0
  for (let y = fromY; y < toY; y += 1) {
    for (let x = fromX; x < toX; x += 1) {
      const index = (y * SAMPLE_WIDTH + x) * 4
      // RMS retains small, saturated light sources better than a flat average.
      red += (data[index] / 255) ** 2
      green += (data[index + 1] / 255) ** 2
      blue += (data[index + 2] / 255) ** 2
      count += 1
    }
  }
  return new THREE.Color().setRGB(
    Math.sqrt(red / Math.max(count, 1)),
    Math.sqrt(green / Math.max(count, 1)),
    Math.sqrt(blue / Math.max(count, 1)),
    THREE.SRGBColorSpace,
  )
}

function sourceDimensions(media: HTMLImageElement | HTMLVideoElement) {
  return media instanceof HTMLVideoElement
    ? { width: media.videoWidth, height: media.videoHeight }
    : { width: media.naturalWidth, height: media.naturalHeight }
}

export function StudioLights({ background, mediaRef, rig }: { background: BackgroundSettings; mediaRef: RefObject<HTMLImageElement | HTMLVideoElement | null>; rig: AmbilightRig }) {
  const { invalidate } = useThree()

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined
    rig.reach = background.ambilightReach / 100
    const enabled = background.type === 'video' && background.ambilight && Boolean(background.url)
    if (!enabled) {
      rig.strength = 0
      invalidate()
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = SAMPLE_WIDTH
    canvas.height = SAMPLE_HEIGHT
    const context = canvas.getContext('2d', { willReadFrequently: true })
    const smoothed = [new THREE.Color('#111111'), new THREE.Color('#111111'), new THREE.Color('#111111')]

    const update = () => {
      if (cancelled) return
      const media = mediaRef.current
      const ready = media instanceof HTMLVideoElement ? media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA : Boolean(media?.complete)
      const dimensions = media ? sourceDimensions(media) : { width: 0, height: 0 }
      if (context && media && ready && dimensions.width > 0 && dimensions.height > 0) {
        try {
          const viewportRatio = Math.max(media.clientWidth, 1) / Math.max(media.clientHeight, 1)
          const sourceRatio = dimensions.width / dimensions.height
          let sx = 0, sy = 0, sw = dimensions.width, sh = dimensions.height
          if (sourceRatio > viewportRatio) {
            sw = dimensions.height * viewportRatio
            sx = (dimensions.width - sw) * 0.5
          } else {
            sh = dimensions.width / viewportRatio
            sy = (dimensions.height - sh) * 0.5
          }
          context.drawImage(media, sx, sy, sw, sh, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT)
          const pixels = context.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data
          const targets = [
            sampleRegion(pixels, 0, 7, 0, SAMPLE_HEIGHT),
            sampleRegion(pixels, SAMPLE_WIDTH - 7, SAMPLE_WIDTH, 0, SAMPLE_HEIGHT),
            sampleRegion(pixels, 5, SAMPLE_WIDTH - 5, 0, 5),
          ]
          const strength = background.ambilightStrength / 100 * (1 - background.darkness / 100)
          smoothed.forEach((color, index) => color.lerp(targets[index], 0.24))
          rig.left.copy(smoothed[0])
          rig.right.copy(smoothed[1])
          rig.top.copy(smoothed[2])
          rig.average.copy(smoothed[0]).add(smoothed[1]).add(smoothed[2]).multiplyScalar(1 / 3)
          rig.strength = strength
          invalidate()
        } catch {
          // A future cross-origin source may forbid canvas reads. Keep studio lights usable.
          rig.strength = 0
        }
      }
      timer = window.setTimeout(update, SAMPLE_INTERVAL_MS)
    }
    update()
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [background.ambilight, background.ambilightReach, background.ambilightStrength, background.darkness, background.type, background.url, invalidate, mediaRef, rig])

  return <>
    <ambientLight intensity={0.62} />
    <directionalLight position={[4, 5, 5]} intensity={background.ambilight && background.type === 'video' ? 1.55 : 2.15} />
    <directionalLight position={[-5, 2, 3]} intensity={background.ambilight && background.type === 'video' ? 0.72 : 1.05} />
    <directionalLight position={[0, 3, -5]} intensity={background.ambilight && background.type === 'video' ? 1.0 : 1.55} />
  </>
}
