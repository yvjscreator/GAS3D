import type { BeatSyncSettings, CameraViewSettings, GarmentVariantId, PrintPlacement } from '../types/studio'
import type { Vec3 } from '../types/garment'
import { garmentVariantPresets, getGarmentVariantPreset } from './garmentVariants'
import { beatSequenceDuration, cueFrame, hasBeatMap, rhythmicProgress } from '../utils/beatSync'

export const PROFESSIONAL_MIN_DURATION = 24
export const PROFESSIONAL_CUE_COUNT = 7

export function getProfessionalDuration(duration: number, beatSync?: BeatSyncSettings) {
  return beatSync && hasBeatMap(beatSync) ? beatSequenceDuration(PROFESSIONAL_CUE_COUNT, beatSync, duration) : Math.max(duration, PROFESSIONAL_MIN_DURATION)
}

export interface ProfessionalRecordingFrame {
  variantId: GarmentVariantId
  collectionItemId?: string
  rotation: number
  cameraPosition: Vec3
  cameraTarget: Vec3
  cameraFov?: number
  garmentOpacity: number
  shotLabel: string
  shotIndex: number
  shotCount: number
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const smooth = (value: number) => { const t = clamp01(value); return t * t * (3 - 2 * t) }
const lerp = (from: number, to: number, value: number) => from + (to - from) * value
const facingRotation: Record<PrintPlacement, number> = { frontCenter: 0, frontChest: 0, backCenter: Math.PI, leftSleeve: Math.PI / 2, rightSleeve: -Math.PI / 2 }
const placementLabels: Record<PrintPlacement, string> = { frontCenter: 'frente', frontChest: 'pecho', backCenter: 'espalda', leftSleeve: 'manga izquierda', rightSleeve: 'manga derecha' }

function cutOpacity(progress: number, edge = .12) {
  return Math.min(smooth(progress / edge), smooth((1 - progress) / edge))
}

function placementCamera(placement: PrintPlacement, progress: number, wide = false, savedView?: CameraViewSettings) {
  if (wide) {
    const view = savedView ?? { position: [0, .15, 12.35], target: [0, .15, 0] }
    const offset = view.position.map((value, index) => value - view.target[index]) as Vec3
    const factor = lerp(1, .94, smooth(progress)); const drift = Math.sin(progress * Math.PI) * .12
    return { position: [view.target[0] + offset[0] * factor + drift, view.target[1] + offset[1] * factor, view.target[2] + offset[2] * factor] as Vec3, target: [...view.target] as Vec3 }
  }
  const distance = lerp(6.35, placement.includes('Sleeve') ? 4.65 : 5.05, smooth(progress))
  const target: Vec3 = placement === 'frontChest' ? [-.42, .67, 0] : placement.includes('Sleeve') ? [0, .62, 0] : [0, .04, 0]
  const drift = Math.sin(progress * Math.PI) * (wide ? .18 : .1)
  return { position: [target[0] + drift, target[1] + (wide ? .08 : .04), distance] as Vec3, target }
}

export function getProfessionalRecordingFrame(seconds: number, duration: number, heroVariantId: GarmentVariantId, savedView?: CameraViewSettings, beatSync?: BeatSyncSettings): ProfessionalRecordingFrame {
  const safeDuration = Math.max(1, duration); const time = Math.min(safeDuration, Math.max(0, seconds))
  const cameraAzimuth = savedView ? Math.atan2(savedView.position[0] - savedView.target[0], savedView.position[2] - savedView.target[2]) : 0
  if (beatSync && hasBeatMap(beatSync)) {
    const cue = cueFrame(time, PROFESSIONAL_CUE_COUNT, beatSync, safeDuration)
    const local = rhythmicProgress(cue.local, beatSync.style)
    if (cue.index < garmentVariantPresets.length) {
      const preset = garmentVariantPresets[cue.index]
      const camera = placementCamera(preset.largePlacement, Math.sin(local * Math.PI), true, savedView)
      return {
        variantId: preset.id,
        rotation: cameraAzimuth + facingRotation[preset.largePlacement] - .32 + local * Math.PI * 2,
        cameraPosition: [camera.position[0] + Math.sin(local * Math.PI * 2) * .16, camera.position[1], camera.position[2]],
        cameraTarget: camera.target,
        garmentOpacity: cutOpacity(cue.local, beatSync.style === 'impact' ? .06 : .12),
        shotLabel: `♪ VARIANTE ${cue.index + 1}/4 · ${preset.label.toUpperCase()}`,
        shotIndex: cue.index,
        shotCount: PROFESSIONAL_CUE_COUNT,
      }
    }
    const hero = getGarmentVariantPreset(heroVariantId)
    if (cue.index === 4) {
      const camera = placementCamera(hero.largePlacement, local, true, savedView)
      return { variantId: hero.id, rotation: cameraAzimuth + facingRotation[hero.largePlacement] - .32 + Math.sin(local * Math.PI) * .09, cameraPosition: camera.position, cameraTarget: camera.target, garmentOpacity: cutOpacity(cue.local, .14), shotLabel: `♪ HERO · ${hero.label.toUpperCase()}`, shotIndex: 4, shotCount: PROFESSIONAL_CUE_COUNT }
    }
    const detailIndex = cue.index - 5
    const placement = detailIndex === 0 ? hero.largePlacement : hero.smallPlacement
    const camera = placementCamera(placement, local)
    return {
      variantId: hero.id,
      rotation: facingRotation[placement] + Math.sin(local * Math.PI) * (placement.includes('Sleeve') ? .05 : .025),
      cameraPosition: camera.position,
      cameraTarget: camera.target,
      garmentOpacity: cutOpacity(cue.local, .1),
      shotLabel: detailIndex === 0 ? `♪ ACERCAMIENTO · ${placementLabels[placement].toUpperCase()}` : `♪ DETALLE · ${placementLabels[placement].toUpperCase()}`,
      shotIndex: cue.index,
      shotCount: PROFESSIONAL_CUE_COUNT,
    }
  }
  const showcaseEnd = safeDuration * .57
  const showcaseSegment = showcaseEnd / garmentVariantPresets.length
  if (time < showcaseEnd) {
    const index = Math.min(garmentVariantPresets.length - 1, Math.floor(time / showcaseSegment))
    const preset = garmentVariantPresets[index]; const local = clamp01((time - index * showcaseSegment) / showcaseSegment)
    const camera = placementCamera(preset.largePlacement, Math.sin(local * Math.PI), true, savedView)
    return {
      variantId: preset.id,
      rotation: cameraAzimuth + facingRotation[preset.largePlacement] - .32 + smooth(local) * Math.PI * 2,
      cameraPosition: [camera.position[0] + Math.sin(local * Math.PI * 2) * .16, camera.position[1], camera.position[2]],
      cameraTarget: camera.target,
      garmentOpacity: cutOpacity(local),
      shotLabel: `VARIANTE ${index + 1}/4 · ${preset.label.toUpperCase()}`,
      shotIndex: index,
      shotCount: 7,
    }
  }
  const hero = getGarmentVariantPreset(heroVariantId); const heroTime = time - showcaseEnd; const heroDuration = safeDuration - showcaseEnd
  const revealEnd = heroDuration * .22; const detailDuration = (heroDuration - revealEnd) / 2
  if (heroTime < revealEnd) {
    const local = clamp01(heroTime / revealEnd); const camera = placementCamera(hero.largePlacement, smooth(local), true, savedView)
    return { variantId: hero.id, rotation: cameraAzimuth + facingRotation[hero.largePlacement] - .32 + Math.sin(local * Math.PI) * .09, cameraPosition: camera.position, cameraTarget: camera.target, garmentOpacity: cutOpacity(local, .18), shotLabel: `HERO · ${hero.label.toUpperCase()}`, shotIndex: 4, shotCount: 7 }
  }
  const detailIndex = Math.min(1, Math.floor((heroTime - revealEnd) / detailDuration)); const local = clamp01((heroTime - revealEnd - detailIndex * detailDuration) / detailDuration)
  const placement = detailIndex === 0 ? hero.largePlacement : hero.smallPlacement; const camera = placementCamera(placement, local)
  return {
    variantId: hero.id,
    rotation: facingRotation[placement] + Math.sin(local * Math.PI) * (placement.includes('Sleeve') ? .05 : .025),
    cameraPosition: camera.position,
    cameraTarget: camera.target,
    garmentOpacity: cutOpacity(local, .12),
    shotLabel: detailIndex === 0 ? `ACERCAMIENTO · ${placementLabels[placement].toUpperCase()}` : `DETALLE · ${placementLabels[placement].toUpperCase()}`,
    shotIndex: 5 + detailIndex,
    shotCount: 7,
  }
}
