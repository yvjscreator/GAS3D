export type BackgroundType = 'color' | 'image' | 'video'
export type AnimationPreset = 'still' | 'spin180' | 'spin360'
export type FormatId = 'reel' | 'feed' | 'square'
export type RecordingStatus = 'idle' | 'recording' | 'ready' | 'error'
export type PrintPlacement = 'frontCenter' | 'backCenter' | 'frontChest' | 'leftSleeve' | 'rightSleeve'
export const printPlacements: PrintPlacement[] = ['frontCenter', 'frontChest', 'backCenter', 'leftSleeve', 'rightSleeve']

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
}
