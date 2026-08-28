export type BackgroundType = 'color' | 'image' | 'video'
export type AnimationPreset = 'still' | 'spin180' | 'spin360'
export type FormatId = 'reel' | 'feed' | 'square'
export type ExportQualityId = 'high' | 'ultra'
export type RecordingStatus = 'idle' | 'recording' | 'ready' | 'error'
export type EditorMode = 'design' | 'zone'
export type PrintAlignment = 'topLeft' | 'topCenter' | 'topRight' | 'middleLeft' | 'center' | 'middleRight' | 'bottomLeft' | 'bottomCenter' | 'bottomRight'
export interface PrintAlignmentRequest { placement: PrintPlacement; alignment: PrintAlignment; target: EditorMode; id: number }
export type PrintPlacement = 'frontCenter' | 'backCenter' | 'frontChest' | 'leftSleeve' | 'rightSleeve'
export const printPlacements: PrintPlacement[] = ['frontCenter', 'frontChest', 'backCenter', 'leftSleeve', 'rightSleeve']
export type VariantAssetRole = 'large' | 'small'
export type GarmentVariantId = 'frontLeftSleeve' | 'frontBack' | 'backRightSleeve' | 'backChest'
export type LayerTransition = 'none' | 'fade' | 'slideLeft' | 'slideRight' | 'slideUp' | 'zoom'
export type SystemLayerId = 'background' | 'garment'
export type StudioMode = 'basic' | 'advanced'
export type CampaignMode = 'variants' | 'collection'
export type PresentationMode = 'grouped' | 'sequential' | 'mixed'
export type PresentationSceneKind = 'group' | 'item'
export type BeatSyncSource = 'music' | 'background'
export type BeatSyncStyle = 'elegant' | 'dynamic' | 'impact'
export type CollectionAssetRole = 'main' | 'companion'
export type DirectorId = 'cinematic' | 'grid2x2' | 'collection'
export type TimelineTrackType = 'background' | 'director' | 'label' | 'image' | 'text' | 'music' | 'backgroundAudio'
export type TimelineClipType = 'background' | 'directorShot' | 'gridScene' | 'variantLabel' | 'image' | 'text' | 'music' | 'backgroundAudio'
export type GarmentMotionId = 'turntableRight' | 'turntableLeft' | 'whipCompanion' | 'heroArc' | 'detailPush' | 'companionReveal'
export type DirectorShotKind = 'showcase' | 'hero' | 'detailLarge' | 'detailSmall'

export interface PresentationScene {
  id: string
  kind: PresentationSceneKind
  itemIds: string[]
  order: number
  rhythmicUnits: number
}

export interface PresentationPlan {
  mode: PresentationMode
  itemIds: string[]
  groups: string[][]
  scenes: PresentationScene[]
}

export interface BeatSyncSettings {
  enabled: boolean
  source: BeatSyncSource
  style: BeatSyncStyle
  barsPerChange: 1 | 2 | 4 | 8
  stagger: boolean
  sensitivity: number
  bpm: number
  offset: number
  beats: number[]
  confidence: number
  analyzedAssetName: string | null
}

export interface LayerTiming {
  start: number
  duration: number
  enter: LayerTransition
  exit: LayerTransition
}

interface OverlayLayerBase {
  id: string
  name: string
  x: number
  y: number
  width: number
  rotation: number
  opacity: number
  timing: LayerTiming
}

export interface ImageOverlayLayer extends OverlayLayerBase {
  type: 'image'
  url: string | null
  sourceName: string | null
  naturalWidth: number
  naturalHeight: number
}

export interface TextOverlayLayer extends OverlayLayerBase {
  type: 'text'
  text: string
  color: string
  fontSize: number
  fontWeight: number
}

export type StageOverlayLayer = ImageOverlayLayer | TextOverlayLayer
export type StageLayerId = SystemLayerId | string

export interface CameraViewSettings {
  position: [number, number, number]
  target: [number, number, number]
}

export interface VariantCameraPreset extends CameraViewSettings {
  fov: number
  composition: [number, number]
  saved: boolean
}

export interface VariantLabelSettings {
  text: string
  fontFamily: string
  fontSize: number
  color: string
  backgroundColor: string
  backgroundOpacity: number
  borderColor: string
  borderRadius: number
  x: number
  y: number
  enter: LayerTransition
  exit: LayerTransition
}

export interface TimelineClip {
  id: string
  type: TimelineClipType
  name: string
  start: number
  duration: number
  sourceStart: number
  fadeIn: number
  fadeOut: number
  assetId?: string
  variantId?: GarmentVariantId
  collectionItemId?: string
  sceneId?: string
  itemIds?: string[]
  shotKind?: DirectorShotKind
  garmentMotion?: GarmentMotionId
  sceneTransition?: LayerTransition
  unsyncedStart?: number
  unsyncedDuration?: number
}

export interface TimelineTrack {
  id: string
  name: string
  type: TimelineTrackType
  locked: boolean
  hidden: boolean
  clips: TimelineClip[]
}

export interface DirectorProject {
  id: DirectorId
  name: string
  duration: number
  playhead: number
  zoom: number
  cameras: Record<GarmentVariantId, VariantCameraPreset>
  labels: Record<GarmentVariantId, VariantLabelSettings>
  tracks: TimelineTrack[]
  selectedClipId: string | null
  initialized: boolean
  presentationPlan?: PresentationPlan
}

export interface SharedAsset {
  id: string
  kind: 'print' | 'image' | 'audio' | 'background'
  name: string
  url: string | null
}

export interface CollectionItem {
  id: string
  name: string
  asset: VariantAsset
  garmentColor: string
  placement: PrintPlacement
  print: PrintSettings
  zoneAdjustment: PrintZoneAdjustment
  companionAsset: VariantAsset
  companionPlacement: PrintPlacement
  companionPrint: PrintSettings
  companionZoneAdjustment: PrintZoneAdjustment
  camera: VariantCameraPreset
  label: VariantLabelSettings
}

export interface AudioTrackSettings {
  url: string | null
  name: string | null
  volume: number
  start: number
  duration: number
  sourceDuration: number
  fadeIn: number
  fadeOut: number
}

export interface VariantAsset {
  url: string | null
  name: string | null
  width: number
  height: number
}

export interface PrintSettings {
  url: string | null
  name: string | null
  scale: number
  x: number
  y: number
  rotation: number
  integration: number
  placement: PrintPlacement
}

export interface PrintZoneAdjustment {
  x: number
  y: number
  z: number
  width: number
  height: number
  rotation: [number, number, number] | null
}

export interface BackgroundSettings {
  type: BackgroundType
  color: string
  url: string | null
  name: string | null
  blur: number
  darkness: number
  ambilight: boolean
  ambilightStrength: number
  ambilightReach: number
  videoPaused: boolean
  videoAudioEnabled: boolean
  videoVolume: number
}
