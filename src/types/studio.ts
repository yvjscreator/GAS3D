export type BackgroundType = 'color' | 'image' | 'video'
export type FormatId = 'reel' | 'feed' | 'square'
export type ExportQualityId = 'hd' | '2k' | '4k'
export type ExportFps = 24 | 30 | 60
export type AssetQualityProfile = 'performance' | 'automatic' | 'quality'
export type AlphaPipelineMode = 'pngCurrent' | 'webpLossless' | 'webpHigh' | 'straightAlpha'
export type RecordingStatus = 'idle' | 'preparing' | 'preloading' | 'warming' | 'ready' | 'recording' | 'finalizing' | 'done' | 'error'
export type EditorMode = 'design' | 'zone'
export type PrintAlignment = 'topLeft' | 'topCenter' | 'topRight' | 'middleLeft' | 'center' | 'middleRight' | 'bottomLeft' | 'bottomCenter' | 'bottomRight'
export interface PrintAlignmentRequest { placement: PrintPlacement; alignment: PrintAlignment; target: EditorMode; id: number }
export type PrintPlacement = 'frontCenter' | 'backCenter' | 'frontChest' | 'leftSleeve' | 'rightSleeve'
export const printPlacements: PrintPlacement[] = ['frontCenter', 'frontChest', 'backCenter', 'leftSleeve', 'rightSleeve']
export type VariantAssetRole = 'large' | 'small'
export type GarmentVariantId = 'frontLeftSleeve' | 'frontBack' | 'backRightSleeve' | 'backChest'
export type LayerTransition = 'none' | 'fade' | 'slideLeft' | 'slideRight' | 'slideUp' | 'zoom'
export type SystemLayerId = 'background' | 'garment'
export type CampaignMode = 'variants' | 'collection'
export type PresentationMode = 'grouped' | 'sequential' | 'mixed'
export type DirectorShotKind = 'groupShowcase' | 'itemShowcase' | 'hero' | 'detailLarge' | 'detailSmall'
export type PresentationSceneKind = DirectorShotKind
export type BeatSyncSource = 'music' | 'background'
export type BeatSyncStyle = 'elegant' | 'dynamic' | 'impact'
export type CollectionAssetRole = 'main' | 'companion'
export type DesignAssetRole = 'main' | 'companion'
export type DirectorId = 'cinematic' | 'grid2x2' | 'collection'
export type TimelineTrackType = 'background' | 'director' | 'label' | 'image' | 'text' | 'music' | 'backgroundAudio'
export type TimelineClipType = 'background' | 'directorShot' | 'gridScene' | 'variantLabel' | 'image' | 'text' | 'music' | 'backgroundAudio'
export type GarmentMotionId = 'turntableRight' | 'turntableLeft' | 'whipCompanion' | 'heroArc' | 'detailPush' | 'companionReveal'

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

export interface DirectorFrame {
  variantId: GarmentVariantId
  designCombinationId?: string
  collectionItemId?: string
  rotation: number
  cameraPosition: [number, number, number]
  cameraTarget: [number, number, number]
  cameraFov?: number
  garmentOpacity: number
  shotLabel: string
  shotIndex: number
  shotCount: number
}

export interface VariantLabelSettings {
  enabled: boolean
  text: string
  fontFamily: string
  fontSize: number
  color: string
  backgroundColor: string
  backgroundOpacity: number
  backgroundEnabled: boolean
  borderColor: string
  borderEnabled: boolean
  borderWidth: number
  borderRadius: number
  shadowEnabled: boolean
  backdropBlurEnabled: boolean
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
  designCombinationId?: string
  collectionItemId?: string
  sceneId?: string
  itemIds?: string[]
  shotKind?: DirectorShotKind
  garmentMotion?: GarmentMotionId
  sceneTransition?: LayerTransition
  unsyncedStart?: number
  unsyncedDuration?: number
  /** El usuario modificó el montaje temporal y una regeneración no debe sobrescribirlo. */
  manualTiming?: boolean
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

export interface DesignCombination {
  id: string
  presetId?: GarmentVariantId
  name: string
  enabled: boolean
  order: number
  mainPlacement: PrintPlacement
  companionPlacement: PrintPlacement
  focusRole: DesignAssetRole
  garmentColor: string
  printSettings: Record<PrintPlacement, PrintSettings>
  zoneAdjustments: Record<PrintPlacement, PrintZoneAdjustment>
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
  thumbnailUrl?: string | null
  name: string | null
  width: number
  height: number
  originalWidth?: number
  originalHeight?: number
  originalBytes?: number
  renderBytes?: number
  profile?: string
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
