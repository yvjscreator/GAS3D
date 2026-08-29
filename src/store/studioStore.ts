import { create } from 'zustand'
import type { AlphaPipelineMode, AssetQualityProfile, AudioTrackSettings, BackgroundSettings, BeatSyncSettings, CameraViewSettings, CampaignMode, CollectionAssetRole, CollectionItem, DesignCombination, DirectorId, DirectorProject, DirectorShotKind, EditorMode, ExportFps, ExportQualityId, FormatId, GarmentMotionId, GarmentVariantId, LayerTiming, LayerTransition, PresentationMode, PrintAlignment, PrintAlignmentRequest, PrintPlacement, PrintSettings, PrintZoneAdjustment, RecordingStatus, StageLayerId, StageOverlayLayer, SystemLayerId, TimelineClip, VariantAsset, VariantAssetRole, VariantCameraPreset, VariantLabelSettings } from '../types/studio'
import { ADVANCED_SCHEMA_VERSION, applyBeatSyncToProject, createCollectionProject, createDefaultCamera, createDefaultLabel, createDirectorProject, getProjectDuration, isCompleteCollectionItem } from '../config/advancedDirectors'
import { defaultCollectionMotionIds, defaultCollectionTransitionIds } from '../config/garmentMotions'
import { defaultBeatSyncSettings } from '../utils/beatSync'
import { defaultEnabledShotTypes } from '../config/directorShots'
import { garmentVariantPresets } from '../config/garmentVariants'

type StudioState = {
  canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void
  campaignMode: CampaignMode; setCampaignMode: (mode: CampaignMode) => void
  presentationMode: PresentationMode; setPresentationMode: (mode: PresentationMode) => void
  enabledShotTypes: DirectorShotKind[]; toggleShotType: (kind: DirectorShotKind) => void
  assetQualityProfile: AssetQualityProfile; setAssetQualityProfile: (profile: AssetQualityProfile) => void
  alphaPipelineMode: AlphaPipelineMode; setAlphaPipelineMode: (mode: AlphaPipelineMode) => void
  collectionItems: CollectionItem[]; activeCollectionItemId: string | null
  activeCollectionAssetRole: CollectionAssetRole; setActiveCollectionAssetRole: (role: CollectionAssetRole) => void
  collectionMotionIds: GarmentMotionId[]; toggleCollectionMotion: (id: GarmentMotionId) => void
  collectionTransitionIds: LayerTransition[]; toggleCollectionTransition: (id: LayerTransition) => void
  addCollectionItem: (item: CollectionItem) => void
  updateCollectionItem: (id: string, value: Partial<CollectionItem>) => void
  removeCollectionItem: (id: string) => void
  moveCollectionItem: (id: string, direction: -1 | 1) => void
  reorderCollectionItem: (id: string, targetId: string) => void
  setActiveCollectionItemId: (id: string | null) => void
  activeDirectorId: DirectorId; setActiveDirectorId: (id: DirectorId) => void
  advancedProjects: Record<DirectorId, DirectorProject>
  initializeAdvancedProject: (id?: DirectorId) => void
  setAdvancedPlayhead: (time: number) => void
  setAdvancedZoom: (zoom: number) => void
  updateAdvancedCamera: (variant: GarmentVariantId, value: Partial<VariantCameraPreset>) => void
  updateVariantLabel: (variant: GarmentVariantId, value: Partial<VariantLabelSettings>) => void
  selectTimelineClip: (id: string | null) => void
  updateTimelineClip: (trackId: string, clipId: string, value: Partial<TimelineClip>) => void
  splitTimelineClip: (trackId: string, clipId: string, time: number) => void
  toggleTimelineTrack: (trackId: string, field: 'locked' | 'hidden') => void
  moveTimelineTrack: (trackId: string, direction: -1 | 1) => void
  syncAdvancedAssets: () => void
  garmentColor: string; setGarmentColor: (color: string) => void
  prints: Record<PrintPlacement, PrintSettings>; activePrintPlacement: PrintPlacement
  setActivePrintPlacement: (placement: PrintPlacement) => void
  setPrint: (placement: PrintPlacement, value: Partial<PrintSettings>) => void
  resetPrint: (placement: PrintPlacement) => void
  printZoneAdjustments: Record<PrintPlacement, PrintZoneAdjustment>
  setPrintZoneAdjustment: (placement: PrintPlacement, value: Partial<PrintZoneAdjustment>) => void
  resetPrintZoneAdjustment: (placement: PrintPlacement) => void
  editorMode: EditorMode; setEditorMode: (mode: EditorMode) => void
  alignmentRequest: PrintAlignmentRequest | null; alignPrint: (placement: PrintPlacement, alignment: PrintAlignment, target: EditorMode) => void
  variantAssets: Record<VariantAssetRole, VariantAsset>; setVariantAsset: (role: VariantAssetRole, asset: VariantAsset) => void
  designCombinations: DesignCombination[]; activeDesignCombinationId: string | null
  setActiveDesignCombinationId: (id: string | null) => void
  addDesignCombination: (combination: DesignCombination) => void
  updateDesignCombination: (id: string, value: Partial<DesignCombination>) => void
  duplicateDesignCombination: (id: string) => void
  removeDesignCombination: (id: string) => void
  moveDesignCombination: (id: string, direction: -1 | 1) => void
  background: BackgroundSettings; setBackground: (value: Partial<BackgroundSettings>) => void
  music: AudioTrackSettings; setMusic: (value: Partial<AudioTrackSettings>) => void
  beatSync: BeatSyncSettings; setBeatSync: (value: Partial<BeatSyncSettings>) => void
  overlayLayers: StageOverlayLayer[]
  layerOrder: StageLayerId[]
  selectedLayerId: StageLayerId
  systemLayerTimings: Record<SystemLayerId, LayerTiming>
  addOverlayLayer: (layer: StageOverlayLayer) => void
  updateOverlayLayer: (id: string, value: Partial<StageOverlayLayer>) => void
  removeOverlayLayer: (id: string) => void
  moveLayer: (id: StageLayerId, direction: -1 | 1) => void
  selectLayer: (id: StageLayerId) => void
  setSystemLayerTiming: (id: SystemLayerId, value: Partial<LayerTiming>) => void
  format: FormatId; setFormat: (format: FormatId) => void
  exportQuality: ExportQualityId; setExportQuality: (quality: ExportQualityId) => void
  exportFps: ExportFps; setExportFps: (fps: ExportFps) => void
  targetRotation: number; setTargetRotation: (rotation: number) => void
  recordingStatus: RecordingStatus; recordingElapsed: number; recordingMessage: string | null
  recordingPreparedResources: number; recordingTotalResources: number
  setRecording: (status: RecordingStatus, elapsed?: number, message?: string | null, resources?: { completed: number; total: number }) => void
}

type HistorySnapshot = Pick<StudioState,
  'presentationMode' | 'enabledShotTypes' | 'assetQualityProfile' | 'alphaPipelineMode' | 'collectionItems' | 'collectionMotionIds' | 'collectionTransitionIds' | 'advancedProjects' |
  'garmentColor' | 'prints' | 'printZoneAdjustments' | 'variantAssets' | 'designCombinations' | 'background' | 'music' | 'beatSync' | 'overlayLayers' | 'layerOrder' |
  'systemLayerTimings' | 'format' | 'exportQuality' | 'exportFps'
>

const HISTORY_LIMIT = 80
let historyPast: HistorySnapshot[] = []
let historyFuture: HistorySnapshot[] = []
let historyCurrent: HistorySnapshot | null = null
let historyPendingBase: HistorySnapshot | null = null
let historyPendingTimer: number | undefined
let historyApplying = false
let historyReady = false

const cloneHistory = <T,>(value: T): T => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T
const captureHistory = (state: StudioState): HistorySnapshot => cloneHistory({
  presentationMode: state.presentationMode,
  enabledShotTypes: state.enabledShotTypes,
  assetQualityProfile: state.assetQualityProfile,
  alphaPipelineMode: state.alphaPipelineMode,
  collectionItems: state.collectionItems,
  collectionMotionIds: state.collectionMotionIds,
  collectionTransitionIds: state.collectionTransitionIds,
  advancedProjects: state.advancedProjects,
  garmentColor: state.garmentColor,
  prints: state.prints,
  printZoneAdjustments: state.printZoneAdjustments,
  variantAssets: state.variantAssets,
  designCombinations: state.designCombinations,
  background: state.background,
  music: state.music,
  beatSync: state.beatSync,
  overlayLayers: state.overlayLayers,
  layerOrder: state.layerOrder,
  systemLayerTimings: state.systemLayerTimings,
  format: state.format,
  exportQuality: state.exportQuality,
  exportFps: state.exportFps,
})
const historySignature = (snapshot: HistorySnapshot) => JSON.stringify(snapshot)
const setHistoryAvailability = () => {
  if (typeof useStudioStore === 'undefined') return
  historyApplying = true
  useStudioStore.setState({ canUndo: historyPast.length > 0 || Boolean(historyPendingBase), canRedo: historyFuture.length > 0 })
  historyApplying = false
}
const commitPendingHistory = () => {
  window.clearTimeout(historyPendingTimer)
  if (historyPendingBase && historyCurrent && historySignature(historyPendingBase) !== historySignature(historyCurrent)) {
    historyPast.push(historyPendingBase)
    if (historyPast.length > HISTORY_LIMIT) historyPast.shift()
  }
  historyPendingBase = null
  setHistoryAvailability()
}
const applyHistory = (snapshot: HistorySnapshot) => {
  const current = useStudioStore.getState()
  const advancedProjects = Object.fromEntries(Object.entries(snapshot.advancedProjects).map(([id, project]) => {
    const transient = current.advancedProjects[id as DirectorId]
    return [id, { ...project, playhead: transient.playhead, zoom: transient.zoom, selectedClipId: transient.selectedClipId }]
  })) as Record<DirectorId, DirectorProject>
  historyApplying = true
  useStudioStore.setState({ ...cloneHistory(snapshot), advancedProjects })
  historyApplying = false
}
const performUndo = () => {
  if (!historyReady) return
  commitPendingHistory()
  const target = historyPast.pop()
  if (!target) return
  historyFuture.push(captureHistory(useStudioStore.getState()))
  applyHistory(target)
  historyCurrent = captureHistory(useStudioStore.getState())
  setHistoryAvailability()
}
const performRedo = () => {
  if (!historyReady) return
  commitPendingHistory()
  const target = historyFuture.pop()
  if (!target) return
  historyPast.push(captureHistory(useStudioStore.getState()))
  applyHistory(target)
  historyCurrent = captureHistory(useStudioStore.getState())
  setHistoryAvailability()
}

const createPrint = (placement: PrintPlacement): PrintSettings => ({ url: null, name: null, scale: 1, x: 0, y: 0, rotation: 0, integration: 78, placement })
const defaultPrints: Record<PrintPlacement, PrintSettings> = {
  frontCenter: createPrint('frontCenter'), frontChest: createPrint('frontChest'), backCenter: createPrint('backCenter'),
  leftSleeve: createPrint('leftSleeve'), rightSleeve: createPrint('rightSleeve'),
}
const createZoneAdjustment = (): PrintZoneAdjustment => ({ x: 0, y: 0, z: 0, width: 1, height: 1, rotation: null })
const defaultZoneAdjustments: Record<PrintPlacement, PrintZoneAdjustment> = {
  frontCenter: createZoneAdjustment(), frontChest: createZoneAdjustment(), backCenter: createZoneAdjustment(),
  leftSleeve: createZoneAdjustment(), rightSleeve: createZoneAdjustment(),
}
const emptyVariantAsset = (): VariantAsset => ({ url: null, name: null, width: 0, height: 0 })
const defaultVariantAssets: Record<VariantAssetRole, VariantAsset> = { large: emptyVariantAsset(), small: emptyVariantAsset() }
const variantIds: GarmentVariantId[] = ['frontLeftSleeve', 'frontBack', 'backRightSleeve', 'backChest']
const STORAGE_KEY = 'garment-ad-studio:settings:v1'
const defaultLayerTiming = (duration = 8): LayerTiming => ({ start: 0, duration, enter: 'none', exit: 'none' })
type PersistedState = Pick<StudioState, 'campaignMode' | 'presentationMode' | 'enabledShotTypes' | 'assetQualityProfile' | 'alphaPipelineMode' | 'collectionItems' | 'activeCollectionItemId' | 'activeCollectionAssetRole' | 'collectionMotionIds' | 'collectionTransitionIds' | 'activeDirectorId' | 'advancedProjects' | 'garmentColor' | 'activePrintPlacement' | 'printZoneAdjustments' | 'editorMode' | 'variantAssets' | 'designCombinations' | 'activeDesignCombinationId' | 'background' | 'music' | 'beatSync' | 'overlayLayers' | 'layerOrder' | 'selectedLayerId' | 'systemLayerTimings' | 'format' | 'exportQuality' | 'exportFps' | 'targetRotation'> & {
  schemaVersion: number
  prints: Record<PrintPlacement, PrintSettings>
  /** Legacy fields used once to migrate sessions saved before the unified director. */
  studioMode?: 'basic' | 'advanced'
  duration?: number
  cameraView?: CameraViewSettings
  variantPrintSettings?: Record<GarmentVariantId, Record<PrintPlacement, PrintSettings>>
  variantZoneAdjustments?: Record<GarmentVariantId, Record<PrintPlacement, PrintZoneAdjustment>>
  activeVariantId?: GarmentVariantId
  animation?: 'still' | 'spin180' | 'spin360'
  /** Compatibility with sessions saved before explicit editor modes existed. */
  zoneEditMode?: boolean
}
const loadPersistedState = (): Partial<PersistedState> => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<PersistedState> } catch { return {} }
}
const persisted = typeof localStorage === 'undefined' ? {} : loadPersistedState()
const initialBeatSync: BeatSyncSettings = { ...defaultBeatSyncSettings(), ...persisted.beatSync, beats: persisted.beatSync?.beats ?? [] }
const initialPrints = Object.fromEntries(Object.entries(defaultPrints).map(([placement, value]) => [placement, { ...value, ...(persisted.prints?.[placement as PrintPlacement] ?? {}), url: null }])) as Record<PrintPlacement, PrintSettings>
const initialZones = Object.fromEntries(Object.entries(defaultZoneAdjustments).map(([placement, value]) => [placement, { ...value, ...(persisted.printZoneAdjustments?.[placement as PrintPlacement] ?? {}) }])) as Record<PrintPlacement, PrintZoneAdjustment>
const initialVariantPrintSettings = Object.fromEntries(variantIds.map((variant) => [variant, Object.fromEntries(Object.entries(initialPrints).map(([placement, value]) => [placement, { ...value, ...(persisted.variantPrintSettings?.[variant]?.[placement as PrintPlacement] ?? {}), url: null }]))])) as Record<GarmentVariantId, Record<PrintPlacement, PrintSettings>>
const initialVariantZones = Object.fromEntries(variantIds.map((variant) => [variant, Object.fromEntries(Object.entries(initialZones).map(([placement, value]) => [placement, { ...value, ...(persisted.variantZoneAdjustments?.[variant]?.[placement as PrintPlacement] ?? {}) }]))])) as Record<GarmentVariantId, Record<PrintPlacement, PrintZoneAdjustment>>
const initialVariantAssets = Object.fromEntries(Object.entries(defaultVariantAssets).map(([role, value]) => [role, { ...value, ...(persisted.variantAssets?.[role as VariantAssetRole] ?? {}), url: null, thumbnailUrl: null }])) as Record<VariantAssetRole, VariantAsset>
const initialCollectionItems = (persisted.collectionItems ?? []).map((item) => {
  const requestedCompanion = item.companionPlacement ?? (item.placement === 'leftSleeve' ? 'rightSleeve' : 'leftSleeve')
  const companionPlacement = requestedCompanion === item.placement ? (item.placement === 'frontCenter' ? 'backCenter' : 'frontCenter') : requestedCompanion
  return {
    ...item,
    asset: { ...item.asset, url: null, thumbnailUrl: null }, print: { ...item.print, url: null },
    companionAsset: { ...emptyVariantAsset(), ...(item.companionAsset ?? {}), url: null, thumbnailUrl: null },
    companionPlacement,
    companionPrint: { ...createPrint(companionPlacement), ...(item.companionPrint ?? {}), placement: companionPlacement, url: null },
    companionZoneAdjustment: { ...createZoneAdjustment(), ...(item.companionZoneAdjustment ?? {}) },
    label: { ...createDefaultLabel(item.name), ...(item.label ?? {}) },
  }
})
const initialCollectionMotionIds = persisted.collectionMotionIds?.filter((id) => defaultCollectionMotionIds.includes(id)) ?? defaultCollectionMotionIds
const initialCollectionTransitionIds = persisted.collectionTransitionIds?.filter((id) => defaultCollectionTransitionIds.includes(id)) ?? defaultCollectionTransitionIds
const initialPresentationMode: PresentationMode = persisted.presentationMode ?? 'mixed'
const initialEnabledShotTypes = persisted.enabledShotTypes?.filter((kind) => defaultEnabledShotTypes.includes(kind)) ?? defaultEnabledShotTypes
const initialOverlayLayers = (persisted.overlayLayers ?? []).map((layer) => layer.type === 'image' ? { ...layer, url: null } : layer)
const initialLayerOrder = (persisted.layerOrder ?? ['garment']).filter((id, index, order) => id !== 'background' && order.indexOf(id) === index && (id === 'garment' || initialOverlayLayers.some((layer) => layer.id === id)))
if (!initialLayerOrder.includes('garment')) initialLayerOrder.unshift('garment')
const persistedProjects = persisted.advancedProjects
const makeCombinationId = () => globalThis.crypto?.randomUUID?.() ?? `combination-${Date.now()}-${Math.random().toString(16).slice(2)}`
const normalizeCombination = (combination: DesignCombination, index: number): DesignCombination => {
  const companionPlacement = combination.companionPlacement === combination.mainPlacement ? (combination.mainPlacement === 'frontCenter' ? 'backCenter' : 'frontCenter') : combination.companionPlacement
  return {
    ...combination,
    companionPlacement,
    order: index,
    garmentColor: combination.garmentColor ?? persisted.garmentColor ?? '#050505',
    printSettings: Object.fromEntries(Object.entries(initialPrints).map(([placement, value]) => [placement, { ...value, ...(combination.printSettings?.[placement as PrintPlacement] ?? {}), placement, url: null }])) as Record<PrintPlacement, PrintSettings>,
    zoneAdjustments: Object.fromEntries(Object.entries(initialZones).map(([placement, value]) => [placement, { ...value, ...(combination.zoneAdjustments?.[placement as PrintPlacement] ?? {}) }])) as Record<PrintPlacement, PrintZoneAdjustment>,
    camera: { ...createDefaultCamera(combination.presetId), ...(combination.camera ?? {}) },
    label: { ...createDefaultLabel(combination.name), ...(combination.label ?? {}) },
  }
}
const migratedCombinations = garmentVariantPresets.map((preset, index) => normalizeCombination({
  id: preset.id,
  presetId: preset.id,
  name: preset.label,
  enabled: true,
  order: index,
  mainPlacement: preset.largePlacement,
  companionPlacement: preset.smallPlacement,
  focusRole: preset.focusPlacement === preset.smallPlacement ? 'companion' : 'main',
  garmentColor: persisted.garmentColor ?? '#050505',
  printSettings: initialVariantPrintSettings[preset.id],
  zoneAdjustments: initialVariantZones[preset.id],
  camera: persistedProjects?.cinematic?.cameras[preset.id] ?? createDefaultCamera(preset.id),
  label: { ...createDefaultLabel(preset.id), ...(persistedProjects?.cinematic?.labels[preset.id] ?? {}) },
}, index))
const initialDesignCombinations = (persisted.designCombinations?.length ? persisted.designCombinations : migratedCombinations).map(normalizeCombination)
const initialActiveDesignCombinationId = persisted.activeDesignCombinationId && initialDesignCombinations.some((item) => item.id === persisted.activeDesignCombinationId)
  ? persisted.activeDesignCombinationId
  : initialDesignCombinations.find((item) => item.enabled)?.id ?? initialDesignCombinations[0]?.id ?? null
const createSeededProject = (id: DirectorId) => {
  const project = applyBeatSyncToProject(createDirectorProject(id, initialOverlayLayers, Boolean(persisted.music?.name), Boolean(persisted.background?.videoAudioEnabled), initialEnabledShotTypes, initialPresentationMode, initialDesignCombinations, initialCollectionMotionIds, initialCollectionTransitionIds), initialBeatSync)
  const previous = persistedProjects?.[id]
  if (previous) return {
    ...project,
    cameras: Object.fromEntries(variantIds.map((variant) => [variant, { ...project.cameras[variant], ...previous.cameras?.[variant] }])) as Record<GarmentVariantId, VariantCameraPreset>,
    labels: Object.fromEntries(variantIds.map((variant) => [variant, { ...project.labels[variant], ...previous.labels?.[variant] }])) as Record<GarmentVariantId, VariantLabelSettings>,
    zoom: previous.zoom ?? project.zoom,
    playhead: Math.min(previous.playhead ?? 0, project.duration),
  }
  if (!persisted.cameraView) return project
  return { ...project, cameras: Object.fromEntries(variantIds.map((variant) => [variant, { ...project.cameras[variant], position: [...persisted.cameraView!.position], target: [...persisted.cameraView!.target] }])) as Record<GarmentVariantId, VariantCameraPreset> }
}
const initialAdvancedProjects: Record<DirectorId, DirectorProject> = {
  cinematic: persisted.schemaVersion === ADVANCED_SCHEMA_VERSION && persistedProjects?.cinematic ? persistedProjects.cinematic : createSeededProject('cinematic'),
  grid2x2: persisted.schemaVersion === ADVANCED_SCHEMA_VERSION && persistedProjects?.grid2x2 ? persistedProjects.grid2x2 : createSeededProject('grid2x2'),
  collection: persisted.schemaVersion === ADVANCED_SCHEMA_VERSION && persistedProjects?.collection
    ? persistedProjects.collection
    : createCollectionProject(initialCollectionItems.filter(isCompleteCollectionItem), initialOverlayLayers, Boolean(persisted.music?.name), Boolean(persisted.background?.videoAudioEnabled), initialCollectionMotionIds, initialCollectionTransitionIds, persistedProjects?.collection, initialBeatSync, initialPresentationMode, initialEnabledShotTypes),
}
const makeClipId = () => globalThis.crypto?.randomUUID?.() ?? `clip-${Date.now()}-${Math.random().toString(16).slice(2)}`
const syncProjectAssets = (project: DirectorProject, overlays: StageOverlayLayer[], music: AudioTrackSettings | null, backgroundAudio: boolean): DirectorProject => {
  const validOverlayIds = new Set(overlays.map((layer) => layer.id))
  let tracks = project.tracks.filter((track) => !track.id.startsWith('asset-') || validOverlayIds.has(track.id.slice(6)))
  overlays.forEach((layer) => {
    if (tracks.some((track) => track.id === `asset-${layer.id}`)) return
    tracks = [...tracks, { id: `asset-${layer.id}`, name: layer.name, type: layer.type, locked: false, hidden: false, clips: [{ id: makeClipId(), type: layer.type, name: layer.name, start: layer.timing.start, duration: layer.timing.duration, sourceStart: 0, fadeIn: .35, fadeOut: .35, assetId: layer.id }] }]
  })
  if (music?.name && !tracks.some((track) => track.id === 'music')) tracks = [...tracks, { id: 'music', name: 'Música', type: 'music', locked: false, hidden: false, clips: [{ id: makeClipId(), type: 'music', name: music.name, start: Math.min(project.duration, music.start), duration: Math.min(music.duration, Math.max(.1, project.duration - music.start)), sourceStart: 0, fadeIn: music.fadeIn, fadeOut: music.fadeOut, assetId: 'music' }] }]
  if (!music?.name) tracks = tracks.filter((track) => track.id !== 'music')
  if (backgroundAudio && !tracks.some((track) => track.id === 'background-audio')) tracks = [...tracks, { id: 'background-audio', name: 'Audio del fondo', type: 'backgroundAudio', locked: false, hidden: false, clips: [{ id: makeClipId(), type: 'backgroundAudio', name: 'Audio del fondo', start: 0, duration: project.duration, sourceStart: 0, fadeIn: 0, fadeOut: 0, assetId: 'background-audio' }] }]
  if (!backgroundAudio) tracks = tracks.filter((track) => track.id !== 'background-audio')
  return { ...project, tracks }
}
const rebuildCollectionProject = (state: StudioState, items: CollectionItem[], motions = state.collectionMotionIds, transitions = state.collectionTransitionIds, beatSync = state.beatSync, presentationMode = state.presentationMode, enabledShotTypes = state.enabledShotTypes) => createCollectionProject(items.filter(isCompleteCollectionItem), state.overlayLayers, Boolean(state.music.name), Boolean(state.background.videoAudioEnabled), motions, transitions, state.advancedProjects.collection, beatSync, presentationMode, enabledShotTypes)
const rebuildVariantProject = (state: StudioState, id: 'cinematic' | 'grid2x2', enabledShotTypes = state.enabledShotTypes, presentationMode = state.presentationMode) => {
  const current = state.advancedProjects[id]
  const next = applyBeatSyncToProject(createDirectorProject(id, state.overlayLayers, Boolean(state.music.name), Boolean(state.background.videoAudioEnabled), enabledShotTypes, presentationMode, state.designCombinations, state.collectionMotionIds, state.collectionTransitionIds), state.beatSync)
  return { ...next, cameras: current.cameras, labels: current.labels, zoom: current.zoom, playhead: Math.min(current.playhead, next.duration) }
}
export const useStudioStore = create<StudioState>((set) => ({
  canUndo: false, canRedo: false, undo: performUndo, redo: performRedo,
  campaignMode: persisted.campaignMode ?? 'variants',
  setCampaignMode: (campaignMode) => set({ campaignMode, activeDirectorId: campaignMode === 'collection' ? 'collection' : 'cinematic' }),
  presentationMode: initialPresentationMode,
  setPresentationMode: (presentationMode) => set((state) => ({ presentationMode, advancedProjects: {
    cinematic: rebuildVariantProject(state, 'cinematic', state.enabledShotTypes, presentationMode),
    grid2x2: rebuildVariantProject(state, 'grid2x2', state.enabledShotTypes, 'grouped'),
    collection: rebuildCollectionProject(state, state.collectionItems, state.collectionMotionIds, state.collectionTransitionIds, state.beatSync, presentationMode),
  } })),
  enabledShotTypes: initialEnabledShotTypes,
  toggleShotType: (kind) => set((state) => {
    const enabledShotTypes = state.enabledShotTypes.includes(kind) ? state.enabledShotTypes.filter((item) => item !== kind) : [...state.enabledShotTypes, kind]
    return { enabledShotTypes, advancedProjects: { cinematic: rebuildVariantProject(state, 'cinematic', enabledShotTypes), grid2x2: rebuildVariantProject(state, 'grid2x2', enabledShotTypes, 'grouped'), collection: rebuildCollectionProject(state, state.collectionItems, state.collectionMotionIds, state.collectionTransitionIds, state.beatSync, state.presentationMode, enabledShotTypes) } }
  }),
  assetQualityProfile: persisted.assetQualityProfile ?? 'automatic',
  setAssetQualityProfile: (assetQualityProfile) => set({ assetQualityProfile }),
  alphaPipelineMode: persisted.alphaPipelineMode ?? 'pngCurrent',
  setAlphaPipelineMode: (alphaPipelineMode) => set({ alphaPipelineMode }),
  collectionItems: initialCollectionItems,
  activeCollectionItemId: persisted.activeCollectionItemId && initialCollectionItems.some((item) => item.id === persisted.activeCollectionItemId) ? persisted.activeCollectionItemId : initialCollectionItems[0]?.id ?? null,
  activeCollectionAssetRole: persisted.activeCollectionAssetRole ?? 'main',
  setActiveCollectionAssetRole: (activeCollectionAssetRole) => set({ activeCollectionAssetRole }),
  collectionMotionIds: initialCollectionMotionIds,
  toggleCollectionMotion: (id) => set((state) => {
    const collectionMotionIds = state.collectionMotionIds.includes(id) ? state.collectionMotionIds.filter((motion) => motion !== id) : [...state.collectionMotionIds, id]
    const nextState = { ...state, collectionMotionIds }
    return { collectionMotionIds, advancedProjects: { cinematic: rebuildVariantProject(nextState, 'cinematic'), grid2x2: rebuildVariantProject(nextState, 'grid2x2', state.enabledShotTypes, 'grouped'), collection: rebuildCollectionProject(nextState, state.collectionItems, collectionMotionIds) } }
  }),
  collectionTransitionIds: initialCollectionTransitionIds,
  toggleCollectionTransition: (id) => set((state) => {
    const collectionTransitionIds = state.collectionTransitionIds.includes(id) ? state.collectionTransitionIds.filter((transition) => transition !== id) : [...state.collectionTransitionIds, id]
    const nextState = { ...state, collectionTransitionIds }
    return { collectionTransitionIds, advancedProjects: { cinematic: rebuildVariantProject(nextState, 'cinematic'), grid2x2: rebuildVariantProject(nextState, 'grid2x2', state.enabledShotTypes, 'grouped'), collection: rebuildCollectionProject(nextState, state.collectionItems, state.collectionMotionIds, collectionTransitionIds) } }
  }),
  addCollectionItem: (item) => set((state) => {
    if (item.placement === item.companionPlacement) return state
    const collectionItems = [...state.collectionItems, item]
    return { collectionItems, activeCollectionItemId: item.id, advancedProjects: { ...state.advancedProjects, collection: rebuildCollectionProject(state, collectionItems) } }
  }),
  updateCollectionItem: (id, value) => set((state) => {
    const previousItem = state.collectionItems.find((item) => item.id === id)
    if (previousItem && (value.placement ?? previousItem.placement) === (value.companionPlacement ?? previousItem.companionPlacement)) return state
    const collectionItems = state.collectionItems.map((item) => item.id === id ? { ...item, ...value, asset: value.asset ? { ...item.asset, ...value.asset } : item.asset, print: value.print ? { ...item.print, ...value.print } : item.print, companionAsset: value.companionAsset ? { ...item.companionAsset, ...value.companionAsset } : item.companionAsset, companionPrint: value.companionPrint ? { ...item.companionPrint, ...value.companionPrint } : item.companionPrint, companionZoneAdjustment: value.companionZoneAdjustment ? { ...item.companionZoneAdjustment, ...value.companionZoneAdjustment } : item.companionZoneAdjustment, camera: value.camera ? { ...item.camera, ...value.camera } : item.camera, label: value.label ? { ...item.label, ...value.label } : item.label } : item)
    const nextItem = collectionItems.find((item) => item.id === id)
    let collectionProject = previousItem && nextItem && isCompleteCollectionItem(previousItem) !== isCompleteCollectionItem(nextItem) ? rebuildCollectionProject(state, collectionItems) : state.advancedProjects.collection
    if (previousItem && nextItem && previousItem.label.enabled !== nextItem.label.enabled) collectionProject = rebuildCollectionProject(state, collectionItems)
    if (value.name !== undefined) collectionProject = { ...collectionProject, tracks: collectionProject.tracks.map((track) => track.id === `collection-label-${id}` ? { ...track, name: value.name!, clips: track.clips.map((item) => ({ ...item, name: value.name! })) } : { ...track, clips: track.clips.map((item) => item.collectionItemId === id ? { ...item, name: value.name! } : item) }) }
    return { collectionItems, advancedProjects: { ...state.advancedProjects, collection: collectionProject } }
  }),
  removeCollectionItem: (id) => set((state) => {
    const collectionItems = state.collectionItems.filter((item) => item.id !== id)
    return { collectionItems, activeCollectionItemId: state.activeCollectionItemId === id ? collectionItems[0]?.id ?? null : state.activeCollectionItemId, advancedProjects: { ...state.advancedProjects, collection: rebuildCollectionProject(state, collectionItems) } }
  }),
  moveCollectionItem: (id, direction) => set((state) => {
    const index = state.collectionItems.findIndex((item) => item.id === id); const target = index + direction
    if (index < 0 || target < 0 || target >= state.collectionItems.length) return state
    const collectionItems = [...state.collectionItems]; [collectionItems[index], collectionItems[target]] = [collectionItems[target], collectionItems[index]]
    return { collectionItems, advancedProjects: { ...state.advancedProjects, collection: rebuildCollectionProject(state, collectionItems) } }
  }),
  reorderCollectionItem: (id, targetId) => set((state) => {
    const from = state.collectionItems.findIndex((item) => item.id === id); const to = state.collectionItems.findIndex((item) => item.id === targetId)
    if (from < 0 || to < 0 || from === to) return state
    const collectionItems = [...state.collectionItems]; const [item] = collectionItems.splice(from, 1); collectionItems.splice(to, 0, item)
    return { collectionItems, advancedProjects: { ...state.advancedProjects, collection: rebuildCollectionProject(state, collectionItems) } }
  }),
  setActiveCollectionItemId: (activeCollectionItemId) => set({ activeCollectionItemId }),
  activeDirectorId: persisted.campaignMode === 'collection' ? 'collection' : 'cinematic',
  setActiveDirectorId: (activeDirectorId) => set((state) => {
    if (state.campaignMode === 'collection' && activeDirectorId !== 'collection') return state
    const project = syncProjectAssets(state.advancedProjects[activeDirectorId], state.overlayLayers, state.music, Boolean(state.background.videoAudioEnabled))
    return { activeDirectorId, advancedProjects: { ...state.advancedProjects, [activeDirectorId]: project } }
  }),
  advancedProjects: initialAdvancedProjects,
  initializeAdvancedProject: (id) => set((state) => {
    const directorId = id ?? state.activeDirectorId
    if (state.advancedProjects[directorId]?.initialized) return state
    return { advancedProjects: { ...state.advancedProjects, [directorId]: createDirectorProject(directorId, state.overlayLayers, Boolean(state.music.name), Boolean(state.background.videoAudioEnabled), state.enabledShotTypes, state.presentationMode, state.designCombinations, state.collectionMotionIds, state.collectionTransitionIds) } }
  }),
  setAdvancedPlayhead: (time) => { historyApplying = true; set((state) => {
    const project = state.advancedProjects[state.activeDirectorId]
    return { advancedProjects: { ...state.advancedProjects, [state.activeDirectorId]: { ...project, playhead: Math.min(project.duration, Math.max(0, time)) } } }
  }); historyApplying = false },
  setAdvancedZoom: (zoom) => { historyApplying = true; set((state) => {
    const project = state.advancedProjects[state.activeDirectorId]
    return { advancedProjects: { ...state.advancedProjects, [state.activeDirectorId]: { ...project, zoom: Math.min(4, Math.max(.5, zoom)) } } }
  }); historyApplying = false },
  updateAdvancedCamera: (variant, value) => set((state) => {
    const project = state.advancedProjects[state.activeDirectorId]
    return { advancedProjects: { ...state.advancedProjects, [state.activeDirectorId]: { ...project, cameras: { ...project.cameras, [variant]: { ...project.cameras[variant], ...value } } } } }
  }),
  updateVariantLabel: (variant, value) => set((state) => {
    const project = state.advancedProjects[state.activeDirectorId]
    return { advancedProjects: { ...state.advancedProjects, [state.activeDirectorId]: { ...project, labels: { ...project.labels, [variant]: { ...project.labels[variant], ...value } } } } }
  }),
  selectTimelineClip: (selectedClipId) => { historyApplying = true; set((state) => {
    const project = state.advancedProjects[state.activeDirectorId]
    return { advancedProjects: { ...state.advancedProjects, [state.activeDirectorId]: { ...project, selectedClipId } } }
  }); historyApplying = false },
  updateTimelineClip: (trackId, clipId, value) => set((state) => {
    const project = state.advancedProjects[state.activeDirectorId]
    const tracks = project.tracks.map((track) => {
      if (track.id !== trackId || track.locked) return track
      const ordered = [...track.clips].sort((a, b) => a.start - b.start); const orderedIndex = ordered.findIndex((item) => item.id === clipId); const previous = ordered[orderedIndex - 1]; const following = ordered[orderedIndex + 1]
      return { ...track, clips: track.clips.map((item) => {
        if (item.id !== clipId) return item
        let duration = Math.max(.1, value.duration ?? item.duration); let start = Math.max(0, value.start ?? item.start)
        if (track.type === 'director') {
          const minimumStart = previous ? previous.start + previous.duration : 0
          const maximumEnd = following ? following.start : Number.POSITIVE_INFINITY
          start = Math.max(minimumStart, Math.min(start, maximumEnd - duration))
          duration = Math.max(.1, Math.min(duration, maximumEnd - start))
        }
        return { ...item, ...value, start, duration, sourceStart: Math.max(0, value.sourceStart ?? item.sourceStart), fadeIn: Math.max(0, Math.min(value.fadeIn ?? item.fadeIn, duration / 2)), fadeOut: Math.max(0, Math.min(value.fadeOut ?? item.fadeOut, duration / 2)) }
      }) }
    })
    let next = { ...project, tracks } as DirectorProject; next.duration = getProjectDuration(next)
    next = { ...next, tracks: next.tracks.map((track) => track.id === 'background' ? { ...track, clips: track.clips.map((item, index) => index === 0 ? { ...item, duration: next.duration } : item) } : track) }
    return { advancedProjects: { ...state.advancedProjects, [state.activeDirectorId]: next } }
  }),
  splitTimelineClip: (trackId, clipId, time) => set((state) => {
    const project = state.advancedProjects[state.activeDirectorId]
    const track = project.tracks.find((item) => item.id === trackId)
    const original = track?.clips.find((item) => item.id === clipId)
    if (!track || track.locked || !original || time <= original.start + .1 || time >= original.start + original.duration - .1) return state
    const leftDuration = time - original.start; const rightDuration = original.duration - leftDuration
    const left = { ...original, duration: leftDuration, fadeOut: Math.min(original.fadeOut, leftDuration / 2) }
    const right = { ...original, id: makeClipId(), start: time, duration: rightDuration, sourceStart: original.sourceStart + leftDuration, fadeIn: Math.min(original.fadeIn, rightDuration / 2) }
    const tracks = project.tracks.map((item) => item.id === trackId ? { ...item, clips: item.clips.flatMap((clip) => clip.id === clipId ? [left, right] : [clip]) } : item)
    return { advancedProjects: { ...state.advancedProjects, [state.activeDirectorId]: { ...project, tracks, selectedClipId: right.id } } }
  }),
  toggleTimelineTrack: (trackId, field) => set((state) => {
    const project = state.advancedProjects[state.activeDirectorId]
    const tracks = project.tracks.map((track) => track.id === trackId && track.type !== 'background' ? { ...track, [field]: !track[field] } : track)
    let next = { ...project, tracks } as DirectorProject; next.duration = getProjectDuration(next)
    next = { ...next, playhead: Math.min(next.playhead, next.duration), tracks: next.tracks.map((track) => track.id === 'background' ? { ...track, clips: track.clips.map((item, index) => index === 0 ? { ...item, duration: next.duration } : item) } : track) }
    return { advancedProjects: { ...state.advancedProjects, [state.activeDirectorId]: next } }
  }),
  moveTimelineTrack: (trackId, direction) => set((state) => {
    const project = state.advancedProjects[state.activeDirectorId]; const index = project.tracks.findIndex((track) => track.id === trackId); const nextIndex = index + direction
    if (index <= 0 || nextIndex <= 0 || nextIndex >= project.tracks.length) return state
    const tracks = [...project.tracks]; [tracks[index], tracks[nextIndex]] = [tracks[nextIndex], tracks[index]]
    return { advancedProjects: { ...state.advancedProjects, [state.activeDirectorId]: { ...project, tracks } } }
  }),
  syncAdvancedAssets: () => set((state) => ({ advancedProjects: {
    cinematic: syncProjectAssets(state.advancedProjects.cinematic, state.overlayLayers, state.music, Boolean(state.background.videoAudioEnabled)),
    grid2x2: syncProjectAssets(state.advancedProjects.grid2x2, state.overlayLayers, state.music, Boolean(state.background.videoAudioEnabled)),
    collection: syncProjectAssets(state.advancedProjects.collection, state.overlayLayers, state.music, Boolean(state.background.videoAudioEnabled)),
  } })),
  garmentColor: persisted.garmentColor ?? '#050505', setGarmentColor: (garmentColor) => set({ garmentColor }),
  prints: initialPrints, activePrintPlacement: persisted.activePrintPlacement ?? 'frontCenter', setActivePrintPlacement: (activePrintPlacement) => set({ activePrintPlacement }),
  setPrint: (placement, value) => set((state) => ({ prints: { ...state.prints, [placement]: { ...state.prints[placement], ...value, placement } } })),
  resetPrint: (placement) => set((state) => ({ prints: { ...state.prints, [placement]: createPrint(placement) } })),
  printZoneAdjustments: initialZones,
  setPrintZoneAdjustment: (placement, value) => set((state) => ({ printZoneAdjustments: { ...state.printZoneAdjustments, [placement]: { ...state.printZoneAdjustments[placement], ...value } } })),
  resetPrintZoneAdjustment: (placement) => set((state) => ({ printZoneAdjustments: { ...state.printZoneAdjustments, [placement]: createZoneAdjustment() } })),
  editorMode: persisted.editorMode ?? (persisted.zoneEditMode ? 'zone' : 'design'), setEditorMode: (editorMode) => set({ editorMode }),
  alignmentRequest: null,
  alignPrint: (placement, alignment, target) => set((state) => ({ alignmentRequest: { placement, alignment, target, id: (state.alignmentRequest?.id ?? 0) + 1 } })),
  variantAssets: initialVariantAssets,
  setVariantAsset: (role, asset) => set((state) => ({ variantAssets: { ...state.variantAssets, [role]: asset } })),
  designCombinations: initialDesignCombinations,
  activeDesignCombinationId: initialActiveDesignCombinationId,
  setActiveDesignCombinationId: (activeDesignCombinationId) => set((state) => {
    const combination = state.designCombinations.find((item) => item.id === activeDesignCombinationId)
    return { activeDesignCombinationId, ...(combination ? { activePrintPlacement: combination.focusRole === 'main' ? combination.mainPlacement : combination.companionPlacement } : {}) }
  }),
  addDesignCombination: (combination) => set((state) => {
    if (combination.mainPlacement === combination.companionPlacement) return state
    const designCombinations = [...state.designCombinations, normalizeCombination({ ...combination, id: combination.id || makeCombinationId() }, state.designCombinations.length)]
    const nextState = { ...state, designCombinations }
    return { designCombinations, activeDesignCombinationId: designCombinations.at(-1)!.id, advancedProjects: { ...state.advancedProjects, cinematic: rebuildVariantProject(nextState, 'cinematic'), grid2x2: rebuildVariantProject(nextState, 'grid2x2', state.enabledShotTypes, 'grouped') } }
  }),
  updateDesignCombination: (id, value) => set((state) => {
    const previous = state.designCombinations.find((item) => item.id === id)
    if (previous && (value.mainPlacement ?? previous.mainPlacement) === (value.companionPlacement ?? previous.companionPlacement)) return state
    const designCombinations = state.designCombinations.map((item) => item.id === id ? normalizeCombination({ ...item, ...value, printSettings: value.printSettings ?? item.printSettings, zoneAdjustments: value.zoneAdjustments ?? item.zoneAdjustments, camera: value.camera ? { ...item.camera, ...value.camera } : item.camera, label: value.label ? { ...item.label, ...value.label } : item.label }, item.order) : item)
    const activeDesignCombinationId = designCombinations.some((item) => item.id === state.activeDesignCombinationId && item.enabled) ? state.activeDesignCombinationId : designCombinations.find((item) => item.enabled)?.id ?? designCombinations[0]?.id ?? null
    const nextState = { ...state, designCombinations }
    const rebuild = value.enabled !== undefined || value.name !== undefined || value.label?.enabled !== undefined
    if (rebuild) return { designCombinations, activeDesignCombinationId, advancedProjects: { ...state.advancedProjects, cinematic: rebuildVariantProject(nextState, 'cinematic'), grid2x2: rebuildVariantProject(nextState, 'grid2x2', state.enabledShotTypes, 'grouped') } }
    if (value.label?.text !== undefined) {
      const rename = (project: DirectorProject): DirectorProject => ({ ...project, tracks: project.tracks.map((track) => ({ ...track, clips: track.clips.map((item) => item.designCombinationId === id && item.type === 'variantLabel' ? { ...item, name: value.label!.text! } : item) })) })
      return { designCombinations, activeDesignCombinationId, advancedProjects: { ...state.advancedProjects, cinematic: rename(state.advancedProjects.cinematic), grid2x2: rename(state.advancedProjects.grid2x2) } }
    }
    return { designCombinations, activeDesignCombinationId }
  }),
  duplicateDesignCombination: (id) => set((state) => {
    const source = state.designCombinations.find((item) => item.id === id); if (!source) return state
    const copy = normalizeCombination({ ...cloneHistory(source), id: makeCombinationId(), presetId: undefined, name: `${source.name} copia`, enabled: true }, state.designCombinations.length)
    const designCombinations = [...state.designCombinations, copy]; const nextState = { ...state, designCombinations }
    return { designCombinations, activeDesignCombinationId: copy.id, advancedProjects: { ...state.advancedProjects, cinematic: rebuildVariantProject(nextState, 'cinematic'), grid2x2: rebuildVariantProject(nextState, 'grid2x2', state.enabledShotTypes, 'grouped') } }
  }),
  removeDesignCombination: (id) => set((state) => {
    const designCombinations = state.designCombinations.filter((item) => item.id !== id).map((item, order) => ({ ...item, order })); if (!designCombinations.length) return state
    const nextState = { ...state, designCombinations }
    return { designCombinations, activeDesignCombinationId: state.activeDesignCombinationId === id ? designCombinations.find((item) => item.enabled)?.id ?? designCombinations[0].id : state.activeDesignCombinationId, advancedProjects: { ...state.advancedProjects, cinematic: rebuildVariantProject(nextState, 'cinematic'), grid2x2: rebuildVariantProject(nextState, 'grid2x2', state.enabledShotTypes, 'grouped') } }
  }),
  moveDesignCombination: (id, direction) => set((state) => {
    const from = state.designCombinations.findIndex((item) => item.id === id); const to = from + direction
    if (from < 0 || to < 0 || to >= state.designCombinations.length) return state
    const designCombinations = [...state.designCombinations]; [designCombinations[from], designCombinations[to]] = [designCombinations[to], designCombinations[from]]
    const ordered = designCombinations.map((item, order) => ({ ...item, order })); const nextState = { ...state, designCombinations: ordered }
    return { designCombinations: ordered, advancedProjects: { ...state.advancedProjects, cinematic: rebuildVariantProject(nextState, 'cinematic'), grid2x2: rebuildVariantProject(nextState, 'grid2x2', state.enabledShotTypes, 'grouped') } }
  }),
  background: { type: 'color', color: '#1b1d24', name: null, blur: 0, darkness: 15, ambilight: true, ambilightStrength: 70, ambilightReach: 55, videoPaused: false, videoAudioEnabled: false, videoVolume: 80, ...persisted.background, url: null },
  setBackground: (value) => set((state) => ({ background: { ...state.background, ...value } })),
  music: { name: null, volume: 80, start: 0, duration: persisted.duration ?? 8, sourceDuration: 0, fadeIn: .5, fadeOut: .8, ...persisted.music, url: null },
  setMusic: (value) => set((state) => {
    const music = { ...state.music, ...value }
    const timingChanged = value.start !== undefined || value.duration !== undefined || value.fadeIn !== undefined || value.fadeOut !== undefined
    if (!timingChanged) return { music }
    const updateProject = (project: DirectorProject): DirectorProject => ({ ...project, tracks: project.tracks.map((track) => track.type !== 'music' ? track : { ...track, clips: track.clips.map((item) => ({ ...item, ...(value.start !== undefined ? { start: Math.max(0, value.start) } : {}), ...(value.duration !== undefined ? { duration: Math.max(.1, value.duration) } : {}), ...(value.fadeIn !== undefined ? { fadeIn: Math.max(0, value.fadeIn) } : {}), ...(value.fadeOut !== undefined ? { fadeOut: Math.max(0, value.fadeOut) } : {}) })) }) })
    return { music, advancedProjects: { cinematic: updateProject(state.advancedProjects.cinematic), grid2x2: updateProject(state.advancedProjects.grid2x2), collection: updateProject(state.advancedProjects.collection) } }
  }),
  beatSync: initialBeatSync,
  setBeatSync: (value) => set((state) => {
    const beatSync = { ...state.beatSync, ...value }
    return { beatSync, advancedProjects: {
      cinematic: applyBeatSyncToProject(state.advancedProjects.cinematic, beatSync),
      grid2x2: applyBeatSyncToProject(state.advancedProjects.grid2x2, beatSync),
      collection: rebuildCollectionProject(state, state.collectionItems, state.collectionMotionIds, state.collectionTransitionIds, beatSync),
    } }
  }),
  overlayLayers: initialOverlayLayers,
  layerOrder: initialLayerOrder,
  selectedLayerId: persisted.selectedLayerId === 'background' || persisted.selectedLayerId === 'garment' || initialOverlayLayers.some((layer) => layer.id === persisted.selectedLayerId) ? persisted.selectedLayerId! : 'garment',
  systemLayerTimings: {
    background: { ...defaultLayerTiming(persisted.duration ?? 8), ...persisted.systemLayerTimings?.background },
    garment: { ...defaultLayerTiming(persisted.duration ?? 8), ...persisted.systemLayerTimings?.garment },
  },
  addOverlayLayer: (layer) => set((state) => ({ overlayLayers: [...state.overlayLayers, layer], layerOrder: [...state.layerOrder, layer.id], selectedLayerId: layer.id })),
  updateOverlayLayer: (id, value) => set((state) => ({ overlayLayers: state.overlayLayers.map((layer) => layer.id === id ? { ...layer, ...value } as StageOverlayLayer : layer) })),
  removeOverlayLayer: (id) => set((state) => ({ overlayLayers: state.overlayLayers.filter((layer) => layer.id !== id), layerOrder: state.layerOrder.filter((layerId) => layerId !== id), selectedLayerId: state.selectedLayerId === id ? 'garment' : state.selectedLayerId })),
  moveLayer: (id, direction) => set((state) => {
    const index = state.layerOrder.indexOf(id); const next = index + direction
    if (index < 0 || next < 0 || next >= state.layerOrder.length) return state
    const layerOrder = [...state.layerOrder]; [layerOrder[index], layerOrder[next]] = [layerOrder[next], layerOrder[index]]
    return { layerOrder }
  }),
  selectLayer: (selectedLayerId) => set({ selectedLayerId }),
  setSystemLayerTiming: (id, value) => set((state) => ({ systemLayerTimings: { ...state.systemLayerTimings, [id]: { ...state.systemLayerTimings[id], ...value } } })),
  format: persisted.format ?? 'reel', setFormat: (format) => set({ format }),
  exportQuality: (persisted.exportQuality as string) === 'high' ? 'hd' : (persisted.exportQuality as string) === 'ultra' ? '4k' : persisted.exportQuality ?? '4k', setExportQuality: (exportQuality) => set({ exportQuality }),
  exportFps: persisted.exportFps ?? 30, setExportFps: (exportFps) => set({ exportFps }),
  targetRotation: persisted.targetRotation ?? 0, setTargetRotation: (targetRotation) => set({ targetRotation }),
  recordingStatus: 'idle', recordingElapsed: 0, recordingMessage: null, recordingPreparedResources: 0, recordingTotalResources: 0,
  setRecording: (recordingStatus, recordingElapsed = 0, recordingMessage = null, resources) => set((state) => ({ recordingStatus, recordingElapsed, recordingMessage, recordingPreparedResources: resources?.completed ?? (recordingStatus === 'idle' ? 0 : state.recordingPreparedResources), recordingTotalResources: resources?.total ?? (recordingStatus === 'idle' ? 0 : state.recordingTotalResources) })),
}))

let persistTimer: number | undefined
useStudioStore.subscribe((state) => {
  if (historyApplying) return
  const next = captureHistory(state)
  if (!historyReady) { historyCurrent = next; return }
  if (historyCurrent && historySignature(historyCurrent) === historySignature(next)) return
  if (!historyPendingBase) { historyPendingBase = historyCurrent; historyFuture = [] }
  historyCurrent = next
  window.clearTimeout(historyPendingTimer)
  historyPendingTimer = window.setTimeout(commitPendingHistory, 240)
  setHistoryAvailability()
})

window.setTimeout(() => {
  historyPast = []; historyFuture = []; historyPendingBase = null
  historyCurrent = captureHistory(useStudioStore.getState())
  historyReady = true
  setHistoryAvailability()
}, 1200)

useStudioStore.subscribe((state) => {
  window.clearTimeout(persistTimer)
  persistTimer = window.setTimeout(() => {
    const prints = Object.fromEntries(Object.entries(state.prints).map(([placement, print]) => [placement, { ...print, url: null }])) as Record<PrintPlacement, PrintSettings>
    const snapshot: PersistedState = {
      schemaVersion: ADVANCED_SCHEMA_VERSION, campaignMode: state.campaignMode, presentationMode: state.presentationMode, enabledShotTypes: state.enabledShotTypes, assetQualityProfile: state.assetQualityProfile, alphaPipelineMode: state.alphaPipelineMode, collectionItems: state.collectionItems.map((item) => ({ ...item, asset: { ...item.asset, url: null, thumbnailUrl: null }, print: { ...item.print, url: null }, companionAsset: { ...item.companionAsset, url: null, thumbnailUrl: null }, companionPrint: { ...item.companionPrint, url: null } })), activeCollectionItemId: state.activeCollectionItemId, activeCollectionAssetRole: state.activeCollectionAssetRole, collectionMotionIds: state.collectionMotionIds, collectionTransitionIds: state.collectionTransitionIds, activeDirectorId: state.activeDirectorId, advancedProjects: state.advancedProjects,
      garmentColor: state.garmentColor, prints, activePrintPlacement: state.activePrintPlacement,
      printZoneAdjustments: state.printZoneAdjustments, editorMode: state.editorMode,
      variantAssets: { large: { ...state.variantAssets.large, url: null, thumbnailUrl: null }, small: { ...state.variantAssets.small, url: null, thumbnailUrl: null } }, designCombinations: state.designCombinations.map((item) => ({ ...item, printSettings: Object.fromEntries(Object.entries(item.printSettings).map(([placement, print]) => [placement, { ...print, url: null }])) as Record<PrintPlacement, PrintSettings> })), activeDesignCombinationId: state.activeDesignCombinationId,
      background: { ...state.background, url: null }, music: { ...state.music, url: null }, beatSync: state.beatSync,
      overlayLayers: state.overlayLayers.map((layer) => layer.type === 'image' ? { ...layer, url: null } : layer), layerOrder: state.layerOrder,
      selectedLayerId: state.selectedLayerId, systemLayerTimings: state.systemLayerTimings,
      format: state.format, exportQuality: state.exportQuality, exportFps: state.exportFps, targetRotation: state.targetRotation,
    }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)) } catch { /* Storage may be disabled by the browser. */ }
  }, 180)
})
