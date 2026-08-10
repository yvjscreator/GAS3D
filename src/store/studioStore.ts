import { create } from 'zustand'
import type { AnimationPreset, BackgroundSettings, FormatId, PrintPlacement, PrintSettings, PrintZoneAdjustment, RecordingStatus } from '../types/studio'

type StudioState = {
  garmentColor: string; setGarmentColor: (color: string) => void
  prints: Record<PrintPlacement, PrintSettings>; activePrintPlacement: PrintPlacement
  setActivePrintPlacement: (placement: PrintPlacement) => void
  setPrint: (placement: PrintPlacement, value: Partial<PrintSettings>) => void
  resetPrint: (placement: PrintPlacement) => void
  printZoneAdjustments: Record<PrintPlacement, PrintZoneAdjustment>
  setPrintZoneAdjustment: (placement: PrintPlacement, value: Partial<PrintZoneAdjustment>) => void
  resetPrintZoneAdjustment: (placement: PrintPlacement) => void
  zoneEditMode: boolean; setZoneEditMode: (enabled: boolean) => void
  background: BackgroundSettings; setBackground: (value: Partial<BackgroundSettings>) => void
  format: FormatId; setFormat: (format: FormatId) => void
  animation: AnimationPreset; setAnimation: (animation: AnimationPreset) => void
  duration: number; setDuration: (duration: number) => void
  targetRotation: number; setTargetRotation: (rotation: number) => void
  playbackKey: number; play: () => void
  recordingStatus: RecordingStatus; recordingElapsed: number; recordingMessage: string | null
  setRecording: (status: RecordingStatus, elapsed?: number, message?: string | null) => void
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
const STORAGE_KEY = 'garment-ad-studio:settings:v1'
type PersistedState = Pick<StudioState, 'garmentColor' | 'activePrintPlacement' | 'printZoneAdjustments' | 'zoneEditMode' | 'background' | 'format' | 'animation' | 'duration' | 'targetRotation'> & { prints: Record<PrintPlacement, PrintSettings> }
const loadPersistedState = (): Partial<PersistedState> => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<PersistedState> } catch { return {} }
}
const persisted = typeof localStorage === 'undefined' ? {} : loadPersistedState()
const initialPrints = Object.fromEntries(Object.entries(defaultPrints).map(([placement, value]) => [placement, { ...value, ...(persisted.prints?.[placement as PrintPlacement] ?? {}), url: null }])) as Record<PrintPlacement, PrintSettings>
const initialZones = Object.fromEntries(Object.entries(defaultZoneAdjustments).map(([placement, value]) => [placement, { ...value, ...(persisted.printZoneAdjustments?.[placement as PrintPlacement] ?? {}) }])) as Record<PrintPlacement, PrintZoneAdjustment>
export const useStudioStore = create<StudioState>((set) => ({
  garmentColor: persisted.garmentColor ?? '#050505', setGarmentColor: (garmentColor) => set({ garmentColor }),
  prints: initialPrints, activePrintPlacement: persisted.activePrintPlacement ?? 'frontCenter', setActivePrintPlacement: (activePrintPlacement) => set({ activePrintPlacement }),
  setPrint: (placement, value) => set((state) => ({ prints: { ...state.prints, [placement]: { ...state.prints[placement], ...value, placement } } })),
  resetPrint: (placement) => set((state) => ({ prints: { ...state.prints, [placement]: createPrint(placement) } })),
  printZoneAdjustments: initialZones,
  setPrintZoneAdjustment: (placement, value) => set((state) => ({ printZoneAdjustments: { ...state.printZoneAdjustments, [placement]: { ...state.printZoneAdjustments[placement], ...value } } })),
  resetPrintZoneAdjustment: (placement) => set((state) => ({ printZoneAdjustments: { ...state.printZoneAdjustments, [placement]: createZoneAdjustment() } })),
  zoneEditMode: persisted.zoneEditMode ?? false, setZoneEditMode: (zoneEditMode) => set({ zoneEditMode }),
  background: { type: 'color', color: '#1b1d24', name: null, blur: 0, darkness: 15, ...persisted.background, url: null },
  setBackground: (value) => set((state) => ({ background: { ...state.background, ...value } })),
  format: persisted.format ?? 'reel', setFormat: (format) => set({ format }), animation: persisted.animation ?? 'spin360', setAnimation: (animation) => set({ animation }),
  duration: persisted.duration ?? 8, setDuration: (duration) => set({ duration }), targetRotation: persisted.targetRotation ?? 0, setTargetRotation: (targetRotation) => set({ targetRotation }),
  playbackKey: 0, play: () => set((state) => ({ playbackKey: state.playbackKey + 1, targetRotation: 0 })),
  recordingStatus: 'idle', recordingElapsed: 0, recordingMessage: null,
  setRecording: (recordingStatus, recordingElapsed = 0, recordingMessage = null) => set({ recordingStatus, recordingElapsed, recordingMessage }),
}))

let persistTimer: number | undefined
useStudioStore.subscribe((state) => {
  window.clearTimeout(persistTimer)
  persistTimer = window.setTimeout(() => {
    const prints = Object.fromEntries(Object.entries(state.prints).map(([placement, print]) => [placement, { ...print, url: null }])) as Record<PrintPlacement, PrintSettings>
    const snapshot: PersistedState = {
      garmentColor: state.garmentColor, prints, activePrintPlacement: state.activePrintPlacement,
      printZoneAdjustments: state.printZoneAdjustments, zoneEditMode: state.zoneEditMode,
      background: { ...state.background, url: null }, format: state.format, animation: state.animation,
      duration: state.duration, targetRotation: state.targetRotation,
    }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)) } catch { /* Storage may be disabled by the browser. */ }
  }, 180)
})
