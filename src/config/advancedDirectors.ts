import type {
  CollectionItem,
  DirectorId,
  DirectorProject,
  GarmentVariantId,
  GarmentMotionId,
  StageOverlayLayer,
  TimelineClip,
  TimelineTrack,
  LayerTransition,
  VariantCameraPreset,
  VariantLabelSettings,
  BeatSyncSettings,
  PresentationMode,
} from '../types/studio'
import { garmentVariantPresets } from './garmentVariants'
import type { ProfessionalRecordingFrame } from './professionalRecording'
import { defaultCollectionMotionIds, defaultCollectionTransitionIds, evaluateGarmentMotion, placementFacing } from './garmentMotions'
import { cueDuration, hasBeatMap, rhythmicProgress } from '../utils/beatSync'
import { buildPresentationPlan } from '../utils/presentationPlanner'

export const ADVANCED_SCHEMA_VERSION = 5
export const directorDefinitions: { id: DirectorId; name: string; description: string; duration: number }[] = [
  { id: 'cinematic', name: 'Presentación cinematográfica', description: 'Variantes, toma hero y acercamientos dirigidos.', duration: 24 },
  { id: 'grid2x2', name: 'Comparativa 2 × 2', description: 'Las cuatro variantes giran simultáneamente.', duration: 12 },
]

const ids = () => globalThis.crypto?.randomUUID?.() ?? `clip-${Date.now()}-${Math.random().toString(16).slice(2)}`
export const variantLabelDefaults: Record<GarmentVariantId, string> = {
  frontLeftSleeve: 'Estampado al frente + manga izquierda',
  frontBack: 'Estampado al frente + espalda',
  backRightSleeve: 'Estampado en espalda + manga derecha',
  backChest: 'Estampado en espalda + pecho',
}

export function createDefaultCamera(variantId: GarmentVariantId = 'frontLeftSleeve'): VariantCameraPreset {
  const angle = variantId === 'frontBack' || variantId === 'backChest' ? .2 : -.2
  const target: [number, number, number] = [0, .18, 0]
  const distance = 11.8
  return {
    position: [Math.sin(angle) * distance, .38, Math.cos(angle) * distance],
    target,
    fov: 35,
    composition: [0, 0],
    saved: false,
  }
}

export function createDefaultLabel(textOrVariant: string | GarmentVariantId = 'frontLeftSleeve'): VariantLabelSettings {
  const text = textOrVariant in variantLabelDefaults ? variantLabelDefaults[textOrVariant as GarmentVariantId] : textOrVariant
  return {
    text,
    fontFamily: 'Manrope',
    fontSize: 3.2,
    color: '#f4f8ff',
    backgroundColor: '#101621',
    backgroundOpacity: 82,
    borderColor: '#4f88bd',
    borderRadius: 10,
    x: 50,
    y: 8,
    enter: 'fade',
    exit: 'fade',
  }
}

const clip = (value: Omit<TimelineClip, 'id' | 'sourceStart' | 'fadeIn' | 'fadeOut'> & Partial<Pick<TimelineClip, 'sourceStart' | 'fadeIn' | 'fadeOut'>>): TimelineClip => ({
  id: ids(), sourceStart: 0, fadeIn: .35, fadeOut: .35, ...value,
})

function cinematicTracks(): TimelineTrack[] {
  const showcaseDuration = 3.4
  const clips = garmentVariantPresets.map((variant, index) => clip({
    type: 'directorShot', name: `Variante ${index + 1}`, start: index * showcaseDuration, duration: showcaseDuration,
    variantId: variant.id, shotKind: 'showcase',
  }))
  const hero = garmentVariantPresets[0]
  clips.push(
    clip({ type: 'directorShot', name: 'Toma hero', start: 13.6, duration: 4.4, variantId: hero.id, shotKind: 'hero' }),
    clip({ type: 'directorShot', name: 'Acercamiento principal', start: 18, duration: 3, variantId: hero.id, shotKind: 'detailLarge' }),
    clip({ type: 'directorShot', name: 'Detalle secundario', start: 21, duration: 3, variantId: hero.id, shotKind: 'detailSmall' }),
  )
  return [
    { id: 'background', name: 'Fondo obligatorio', type: 'background', locked: true, hidden: false, clips: [clip({ type: 'background', name: 'Fondo', start: 0, duration: 24, fadeIn: 0, fadeOut: 0 })] },
    { id: 'director', name: 'Director 3D', type: 'director', locked: false, hidden: false, clips },
    ...garmentVariantPresets.map((variant, index) => ({
      id: `label-${variant.id}`, name: `Etiqueta ${index + 1}`, type: 'label' as const, locked: false, hidden: false,
      clips: [clip({ type: 'variantLabel', name: variantLabelDefaults[variant.id], start: index * showcaseDuration, duration: showcaseDuration, variantId: variant.id })],
    })),
  ]
}

function gridTracks(): TimelineTrack[] {
  return [
    { id: 'background', name: 'Fondo obligatorio', type: 'background', locked: true, hidden: false, clips: [clip({ type: 'background', name: 'Fondo', start: 0, duration: 12, fadeIn: 0, fadeOut: 0 })] },
    { id: 'director', name: 'Comparativa 2 × 2', type: 'director', locked: false, hidden: false, clips: [clip({ type: 'gridScene', name: 'Cuatro variantes', start: 0, duration: 12, fadeIn: .5, fadeOut: .5 })] },
    ...garmentVariantPresets.map((variant, index) => ({
      id: `label-${variant.id}`, name: `Etiqueta ${index + 1}`, type: 'label' as const, locked: false, hidden: false,
      clips: [clip({ type: 'variantLabel', name: variantLabelDefaults[variant.id], start: 0, duration: 12, variantId: variant.id })],
    })),
  ]
}

export function createDirectorProject(id: DirectorId, overlays: StageOverlayLayer[] = [], musicAvailable = false, backgroundAudio = false): DirectorProject {
  if (id === 'collection') return createCollectionProject([], overlays, musicAvailable, backgroundAudio)
  const definition = directorDefinitions.find((item) => item.id === id)!
  const tracks = id === 'grid2x2' ? gridTracks() : cinematicTracks()
  overlays.forEach((layer) => tracks.push({
    id: `asset-${layer.id}`, name: layer.name, type: layer.type, locked: false, hidden: false,
    clips: [clip({ type: layer.type, name: layer.name, start: layer.timing.start, duration: layer.timing.duration, assetId: layer.id })],
  }))
  if (musicAvailable) tracks.push({ id: 'music', name: 'Música', type: 'music', locked: false, hidden: false, clips: [clip({ type: 'music', name: 'Música', start: 0, duration: definition.duration, assetId: 'music', fadeIn: .5, fadeOut: .8 })] })
  if (backgroundAudio) tracks.push({ id: 'background-audio', name: 'Audio del fondo', type: 'backgroundAudio', locked: false, hidden: false, clips: [clip({ type: 'backgroundAudio', name: 'Audio del fondo', start: 0, duration: definition.duration, assetId: 'background-audio', fadeIn: 0, fadeOut: 0 })] })
  return {
    id,
    name: definition.name,
    duration: definition.duration,
    playhead: 0,
    zoom: 1,
    cameras: Object.fromEntries(garmentVariantPresets.map((variant) => [variant.id, createDefaultCamera(variant.id)])) as Record<GarmentVariantId, VariantCameraPreset>,
    labels: Object.fromEntries(garmentVariantPresets.map((variant) => [variant.id, createDefaultLabel(variant.id)])) as Record<GarmentVariantId, VariantLabelSettings>,
    tracks,
    selectedClipId: tracks.find((track) => track.type === 'director')?.clips[0]?.id ?? null,
    initialized: true,
  }
}

export const COLLECTION_GRID_DURATION = 8
export const COLLECTION_ITEM_DURATION = 4

export const isCompleteCollectionItem = (item: CollectionItem) => Boolean(item.asset.name && item.companionAsset.name)
export const isValidCollectionSize = (count: number) => count >= 2

export function createCollectionProject(items: CollectionItem[], overlays: StageOverlayLayer[] = [], musicAvailable = false, backgroundAudio = false, motions: GarmentMotionId[] = defaultCollectionMotionIds, transitions: LayerTransition[] = defaultCollectionTransitionIds, previous?: DirectorProject, beatSync?: BeatSyncSettings, presentationMode: PresentationMode = 'mixed'): DirectorProject {
  const enabledMotions = motions.length ? motions : defaultCollectionMotionIds.slice(0, 1)
  const transitionAt = (index: number) => transitions.length ? transitions[index % transitions.length] : 'none' as const
  const directorClips: TimelineClip[] = []
  const labelClips = new Map<string, TimelineClip[]>()
  const plan = buildPresentationPlan(items.map((item) => item.id), presentationMode)
  let cursor = 0
  plan.scenes.forEach((scene, sceneIndex) => {
    const rhythmicCue = beatSync && hasBeatMap(beatSync) ? cueDuration(beatSync) : null
    const duration = rhythmicCue ? rhythmicCue * scene.rhythmicUnits + (sceneIndex === 0 ? beatSync!.offset : 0) : scene.kind === 'group' ? COLLECTION_GRID_DURATION : COLLECTION_ITEM_DURATION
    const sceneItems = scene.itemIds.map((id) => items.find((item) => item.id === id)).filter((item): item is CollectionItem => Boolean(item))
    if (scene.kind === 'group') {
      const groupNumber = plan.groups.findIndex((group) => group[0] === scene.itemIds[0]) + 1
      directorClips.push(clip({ type: 'gridScene', name: `Colección ${groupNumber} · ${sceneItems.length} diseños`, start: cursor, duration, sceneId: scene.id, itemIds: scene.itemIds, sceneTransition: transitionAt(directorClips.length), fadeIn: 0, fadeOut: 0 }))
    } else {
      const item = sceneItems[0]
      if (item) {
        const itemIndex = items.findIndex((candidate) => candidate.id === item.id)
        directorClips.push(clip({ type: 'directorShot', name: item.name, start: cursor, duration, collectionItemId: item.id, sceneId: scene.id, itemIds: scene.itemIds, shotKind: 'showcase', garmentMotion: enabledMotions[itemIndex % enabledMotions.length], sceneTransition: transitionAt(directorClips.length), fadeIn: 0, fadeOut: 0 }))
      }
    }
    sceneItems.forEach((item) => {
      const clips = labelClips.get(item.id) ?? []
      clips.push(clip({ type: 'variantLabel', name: item.name, start: cursor, duration, collectionItemId: item.id, sceneId: scene.id, itemIds: scene.itemIds }))
      labelClips.set(item.id, clips)
    })
    cursor += duration
  })
  const labelTracks: TimelineTrack[] = items.map((item) => ({ id: `collection-label-${item.id}`, name: item.name, type: 'label', locked: false, hidden: false, clips: labelClips.get(item.id) ?? [] }))
  const duration = Math.max(1, cursor)
  const preservedTracks = previous?.tracks.filter((track) => ['image', 'text', 'music', 'backgroundAudio'].includes(track.type)).map((track) => (track.type === 'music' || track.type === 'backgroundAudio') ? { ...track, clips: track.clips.map((item) => item.start === 0 && Math.abs(item.duration - previous.duration) < .01 ? { ...item, duration } : item) } : track) ?? []
  const tracks: TimelineTrack[] = [
    { id: 'background', name: 'Fondo obligatorio', type: 'background', locked: true, hidden: false, clips: [clip({ type: 'background', name: 'Fondo', start: 0, duration, fadeIn: 0, fadeOut: 0 })] },
    { id: 'director', name: 'Director de colección', type: 'director', locked: false, hidden: false, clips: directorClips },
    ...labelTracks,
    ...preservedTracks,
  ]
  overlays.forEach((layer) => {
    if (tracks.some((track) => track.id === `asset-${layer.id}`)) return
    tracks.push({ id: `asset-${layer.id}`, name: layer.name, type: layer.type, locked: false, hidden: false, clips: [clip({ type: layer.type, name: layer.name, start: 0, duration, assetId: layer.id })] })
  })
  if (musicAvailable && !tracks.some((track) => track.id === 'music')) tracks.push({ id: 'music', name: 'Música', type: 'music', locked: false, hidden: false, clips: [clip({ type: 'music', name: 'Música', start: 0, duration, assetId: 'music', fadeIn: .5, fadeOut: .8 })] })
  if (backgroundAudio && !tracks.some((track) => track.id === 'background-audio')) tracks.push({ id: 'background-audio', name: 'Audio del fondo', type: 'backgroundAudio', locked: false, hidden: false, clips: [clip({ type: 'backgroundAudio', name: 'Audio del fondo', start: 0, duration, assetId: 'background-audio', fadeIn: 0, fadeOut: 0 })] })
  return {
    id: 'collection', name: 'Colección de diseños', duration, playhead: Math.min(previous?.playhead ?? 0, duration), zoom: previous?.zoom ?? 1,
    cameras: previous?.cameras ?? Object.fromEntries(garmentVariantPresets.map((variant) => [variant.id, createDefaultCamera(variant.id)])) as Record<GarmentVariantId, VariantCameraPreset>,
    labels: previous?.labels ?? Object.fromEntries(garmentVariantPresets.map((variant) => [variant.id, createDefaultLabel(variant.id)])) as Record<GarmentVariantId, VariantLabelSettings>,
    tracks, selectedClipId: directorClips[0]?.id ?? null, initialized: true, presentationPlan: plan,
  }
}

export function getProjectDuration(project: DirectorProject) {
  const end = project.tracks
    .filter((track) => track.type !== 'background' && !track.hidden)
    .flatMap((track) => track.clips)
    .reduce((maximum, item) => Math.max(maximum, item.start + item.duration), 0)
  return Math.max(.1, end || project.duration)
}

export function applyBeatSyncToProject(project: DirectorProject, beatSync: BeatSyncSettings): DirectorProject {
  if (project.id === 'collection') return project
  const directorTrack = project.tracks.find((track) => track.type === 'director')
  if (!directorTrack) return project
  const restoreClip = (item: TimelineClip): TimelineClip => item.unsyncedStart === undefined ? item : {
    ...item, start: item.unsyncedStart, duration: item.unsyncedDuration ?? item.duration,
    unsyncedStart: undefined, unsyncedDuration: undefined,
  }
  if (!hasBeatMap(beatSync)) {
    const tracks = project.tracks.map((track) => ({ ...track, clips: track.clips.map(restoreClip) }))
    const restored = { ...project, tracks } as DirectorProject
    const duration = getProjectDuration(restored)
    return { ...restored, duration, playhead: Math.min(restored.playhead, duration), tracks: tracks.map((track) => track.id === 'background' ? { ...track, clips: track.clips.map((item, index) => index === 0 ? { ...item, duration } : item) } : track) }
  }
  const cue = cueDuration(beatSync)
  const ordered = [...directorTrack.clips].sort((a, b) => a.start - b.start)
  const timing = new Map<string, { start: number; duration: number }>()
  ordered.forEach((item, index) => {
    const units = item.type === 'gridScene' ? 2 : 1
    const start = index === 0 ? 0 : [...timing.values()].reduce((end, value) => Math.max(end, value.start + value.duration), 0)
    timing.set(item.id, { start, duration: cue * units + (index === 0 ? beatSync.offset : 0) })
  })
  const alignedDirector = directorTrack.clips.map((item) => {
    const next = timing.get(item.id)!
    return { ...item, unsyncedStart: item.unsyncedStart ?? item.start, unsyncedDuration: item.unsyncedDuration ?? item.duration, ...next }
  })
  const alignedByVariant = new Map<GarmentVariantId, TimelineClip>()
  alignedDirector.forEach((item) => { if (item.variantId && !alignedByVariant.has(item.variantId)) alignedByVariant.set(item.variantId, item) })
  const grid = alignedDirector.find((item) => item.type === 'gridScene')
  const directorEnd = alignedDirector.reduce((end, item) => Math.max(end, item.start + item.duration), 0)
  let tracks = project.tracks.map((track) => {
    if (track.id === directorTrack.id) return { ...track, clips: alignedDirector }
    if (track.type === 'music' || track.type === 'backgroundAudio') return { ...track, clips: track.clips.map((item) => item.start === 0 && (item.unsyncedDuration !== undefined || Math.abs(item.duration - project.duration) < .01) ? { ...item, unsyncedStart: item.unsyncedStart ?? item.start, unsyncedDuration: item.unsyncedDuration ?? item.duration, duration: directorEnd } : item) }
    if (track.type !== 'label') return track
    return { ...track, clips: track.clips.map((item) => {
      const target = item.variantId ? alignedByVariant.get(item.variantId) : grid
      if (!target) return item
      return { ...item, unsyncedStart: item.unsyncedStart ?? item.start, unsyncedDuration: item.unsyncedDuration ?? item.duration, start: target.start, duration: target.duration }
    }) }
  })
  const aligned = { ...project, tracks } as DirectorProject
  const duration = getProjectDuration(aligned)
  tracks = tracks.map((track) => track.id === 'background' ? { ...track, clips: track.clips.map((item, index) => index === 0 ? { ...item, duration } : item) } : track)
  return { ...aligned, tracks, duration, playhead: Math.min(project.playhead, duration) }
}

export function activeClip(project: DirectorProject, type: TimelineTrack['type'], time: number) {
  const track = project.tracks.find((item) => item.type === type && !item.hidden)
  return track?.clips.find((item) => time >= item.start && time <= item.start + item.duration) ?? null
}

export function clipOpacity(item: TimelineClip, time: number) {
  if (time < item.start || time > item.start + item.duration) return 0
  const local = time - item.start
  const fadeIn = item.fadeIn > 0 ? Math.min(1, local / item.fadeIn) : 1
  const fadeOut = item.fadeOut > 0 ? Math.min(1, (item.duration - local) / item.fadeOut) : 1
  return Math.max(0, Math.min(fadeIn, fadeOut))
}

export function getAdvancedDirectorFrame(project: DirectorProject, time: number, beatSync?: BeatSyncSettings): ProfessionalRecordingFrame | null {
  if (project.id !== 'cinematic') return null
  const track = project.tracks.find((item) => item.type === 'director' && !item.hidden)
  const item = track?.clips.find((candidate) => time >= candidate.start && time <= candidate.start + candidate.duration)
  if (!item?.variantId) return null
  const variant = garmentVariantPresets.find((candidate) => candidate.id === item.variantId) ?? garmentVariantPresets[0]
  const camera = project.cameras[item.variantId]
  const rawLocal = Math.min(1, Math.max(0, (time - item.start) / Math.max(.1, item.duration)))
  const local = beatSync && hasBeatMap(beatSync) ? rhythmicProgress(rawLocal, beatSync.style) : rawLocal
  const smooth = local * local * (3 - 2 * local)
  const placement = item.shotKind === 'detailSmall' ? variant.smallPlacement : variant.largePlacement
  const baseFacing = placementFacing[placement]
  const spin = item.shotKind === 'showcase' ? smooth * Math.PI * 2 : Math.sin(local * Math.PI) * (item.shotKind?.startsWith('detail') ? .045 : .09)
  const target: [number, number, number] = [
    camera.target[0] - camera.composition[0] * 1.35,
    camera.target[1] + camera.composition[1] * 1.75 + (placement === 'frontChest' ? .42 : placement.includes('Sleeve') ? .34 : 0),
    camera.target[2],
  ]
  const distanceScale = item.shotKind?.startsWith('detail') ? .58 + .08 * (1 - smooth) : item.shotKind === 'hero' ? .94 : 1
  const position = camera.position.map((value, index) => target[index] + (value - camera.target[index]) * distanceScale) as [number, number, number]
  const shotIndex = track?.clips.indexOf(item) ?? 0
  return {
    variantId: item.variantId,
    rotation: baseFacing - .28 + spin,
    cameraPosition: position,
    cameraTarget: target,
    cameraFov: camera.fov,
    garmentOpacity: clipOpacity(item, time),
    shotLabel: item.name.toUpperCase(),
    shotIndex,
    shotCount: track?.clips.length ?? 1,
  }
}

export function getCollectionDirectorFrame(project: DirectorProject, time: number, items: CollectionItem[], beatSync?: BeatSyncSettings): ProfessionalRecordingFrame | null {
  if (project.id !== 'collection') return null
  const track = project.tracks.find((item) => item.type === 'director' && !item.hidden)
  const shot = track?.clips.find((candidate) => candidate.type === 'directorShot' && time >= candidate.start && time <= candidate.start + candidate.duration)
  const item = shot?.collectionItemId ? items.find((candidate) => candidate.id === shot.collectionItemId) : null
  if (!shot || !item) return null
  const rawLocal = Math.min(1, Math.max(0, (time - shot.start) / Math.max(.1, shot.duration)))
  const local = beatSync && hasBeatMap(beatSync) ? rhythmicProgress(rawLocal, beatSync.style) : rawLocal
  const camera = item.camera
  const motion = evaluateGarmentMotion(shot.garmentMotion ?? 'turntableRight', local, item.placement, item.companionPlacement)
  const target: [number, number, number] = [camera.target[0] - camera.composition[0] * 1.35, camera.target[1] + camera.composition[1] * 1.75, camera.target[2]]
  const position = camera.position.map((value, index) => target[index] + (value - camera.target[index]) * motion.cameraScale) as [number, number, number]
  return {
    variantId: 'frontLeftSleeve', collectionItemId: item.id, rotation: motion.rotation,
    cameraPosition: position, cameraTarget: target, cameraFov: camera.fov, garmentOpacity: clipOpacity(shot, time),
    shotLabel: item.name.toUpperCase(), shotIndex: track?.clips.indexOf(shot) ?? 0, shotCount: track?.clips.length ?? 1,
  }
}

export function activeAssetClips(project: DirectorProject, assetId: string, time: number) {
  return project.tracks
    .filter((track) => !track.hidden)
    .flatMap((track) => track.clips)
    .filter((item) => item.assetId === assetId && time >= item.start && time <= item.start + item.duration)
}

export function activeLabelClips(project: DirectorProject, time: number) {
  return project.tracks
    .filter((track) => track.type === 'label' && !track.hidden)
    .flatMap((track) => track.clips)
    .filter((item) => (item.variantId || item.collectionItemId) && time >= item.start && time <= item.start + item.duration)
}
