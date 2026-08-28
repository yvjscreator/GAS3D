import type { BeatSyncSettings, CameraViewSettings, DirectorShotKind, GarmentVariantId, PrintPlacement } from '../types/studio'
import type { Vec3 } from '../types/garment'
import { garmentVariantPresets, getGarmentVariantPreset } from './garmentVariants'
import { beatSequenceDuration, cueFrame, hasBeatMap, rhythmicProgress } from '../utils/beatSync'
import { defaultEnabledShotTypes } from './directorShots'

export const PROFESSIONAL_MIN_DURATION = 24

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

type ProfessionalShot = {
  kind: Exclude<DirectorShotKind, 'groupShowcase'>
  variantId: GarmentVariantId
  placement: PrintPlacement
  label: string
}

const placementLabels: Record<PrintPlacement, string> = { frontCenter: 'frente', frontChest: 'pecho', backCenter: 'espalda', leftSleeve: 'manga izquierda', rightSleeve: 'manga derecha' }

export function buildProfessionalShotSequence(heroVariantId: GarmentVariantId, enabledShotTypes: readonly DirectorShotKind[] = defaultEnabledShotTypes): ProfessionalShot[] {
  const enabled = new Set(enabledShotTypes)
  const shots: ProfessionalShot[] = []
  if (enabled.has('itemShowcase')) garmentVariantPresets.forEach((variant, index) => shots.push({ kind: 'itemShowcase', variantId: variant.id, placement: variant.largePlacement, label: `VARIANTE ${index + 1}/${garmentVariantPresets.length} · ${variant.label.toUpperCase()}` }))
  const hero = getGarmentVariantPreset(heroVariantId)
  if (enabled.has('hero')) shots.push({ kind: 'hero', variantId: hero.id, placement: hero.largePlacement, label: `HERO · ${hero.label.toUpperCase()}` })
  if (enabled.has('detailLarge')) shots.push({ kind: 'detailLarge', variantId: hero.id, placement: hero.largePlacement, label: `ACERCAMIENTO · ${placementLabels[hero.largePlacement].toUpperCase()}` })
  if (enabled.has('detailSmall')) shots.push({ kind: 'detailSmall', variantId: hero.id, placement: hero.smallPlacement, label: `DETALLE · ${placementLabels[hero.smallPlacement].toUpperCase()}` })
  return shots
}

export function getProfessionalDuration(duration: number, beatSync?: BeatSyncSettings, enabledShotTypes: readonly DirectorShotKind[] = defaultEnabledShotTypes) {
  const cueCount = buildProfessionalShotSequence('frontLeftSleeve', enabledShotTypes).length
  return beatSync && hasBeatMap(beatSync) ? beatSequenceDuration(cueCount, beatSync, duration) : Math.max(duration, PROFESSIONAL_MIN_DURATION)
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const smooth = (value: number) => { const t = clamp01(value); return t * t * (3 - 2 * t) }
const lerp = (from: number, to: number, value: number) => from + (to - from) * value
const facingRotation: Record<PrintPlacement, number> = { frontCenter: 0, frontChest: 0, backCenter: Math.PI, leftSleeve: Math.PI / 2, rightSleeve: -Math.PI / 2 }

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
  const drift = Math.sin(progress * Math.PI) * .1
  return { position: [target[0] + drift, target[1] + .04, distance] as Vec3, target }
}

export function getProfessionalRecordingFrame(seconds: number, duration: number, heroVariantId: GarmentVariantId, savedView?: CameraViewSettings, beatSync?: BeatSyncSettings, enabledShotTypes: readonly DirectorShotKind[] = defaultEnabledShotTypes): ProfessionalRecordingFrame {
  const safeDuration = Math.max(1, duration)
  const time = Math.min(safeDuration, Math.max(0, seconds))
  const sequence = buildProfessionalShotSequence(heroVariantId, enabledShotTypes)
  const fallbackVariant = getGarmentVariantPreset(heroVariantId)
  if (!sequence.length) return { variantId: fallbackVariant.id, rotation: facingRotation[fallbackVariant.largePlacement], cameraPosition: savedView?.position ?? [0, .15, 12.35], cameraTarget: savedView?.target ?? [0, .15, 0], garmentOpacity: 0, shotLabel: 'SIN TOMAS ACTIVAS', shotIndex: 0, shotCount: 0 }
  const cue = beatSync && hasBeatMap(beatSync)
    ? cueFrame(time, sequence.length, beatSync, safeDuration)
    : (() => { const segment = safeDuration / sequence.length; const index = Math.min(sequence.length - 1, Math.floor(time / Math.max(.1, segment))); return { index, local: clamp01((time - index * segment) / Math.max(.1, segment)), duration: safeDuration } })()
  const shot = sequence[cue.index]
  const local = beatSync && hasBeatMap(beatSync) ? rhythmicProgress(cue.local, beatSync.style) : smooth(cue.local)
  const cameraAzimuth = savedView ? Math.atan2(savedView.position[0] - savedView.target[0], savedView.position[2] - savedView.target[2]) : 0
  const wide = shot.kind === 'itemShowcase' || shot.kind === 'hero'
  const camera = placementCamera(shot.placement, shot.kind === 'itemShowcase' ? Math.sin(local * Math.PI) : local, wide, savedView)
  const rotation = shot.kind === 'itemShowcase'
    ? cameraAzimuth + facingRotation[shot.placement] - .32 + local * Math.PI * 2
    : facingRotation[shot.placement] + Math.sin(local * Math.PI) * (shot.placement.includes('Sleeve') ? .05 : shot.kind === 'hero' ? .09 : .025)
  return {
    variantId: shot.variantId,
    rotation,
    cameraPosition: shot.kind === 'itemShowcase' ? [camera.position[0] + Math.sin(local * Math.PI * 2) * .16, camera.position[1], camera.position[2]] : camera.position,
    cameraTarget: camera.target,
    garmentOpacity: cutOpacity(cue.local, beatSync?.style === 'impact' ? .06 : shot.kind === 'hero' ? .14 : .1),
    shotLabel: shot.label,
    shotIndex: cue.index,
    shotCount: sequence.length,
  }
}
