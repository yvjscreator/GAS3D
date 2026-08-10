import { Canvas } from '@react-three/fiber'
import { useState } from 'react'
import { garmentModels } from '../../config/garmentModels'
import { GarmentScene } from './GarmentScene'
import type { AnimationPreset, PrintPlacement, PrintSettings, PrintZoneAdjustment } from '../../types/studio'

export interface GarmentViewerProps { garmentColor: string; printApplications: PrintSettings[]; printZoneAdjustments: Record<PrintPlacement, PrintZoneAdjustment>; activePrintPlacement: PrintPlacement; zoneEditMode: boolean; onPrintMove?: (placement: PrintPlacement, x: number, y: number) => void; onPrintScale?: (placement: PrintPlacement, scale: number) => void; onPrintZoneChange?: (placement: PrintPlacement, value: Partial<PrintZoneAdjustment>) => void; showPrintGuides?: boolean; animation: AnimationPreset; duration: number; playbackKey: number; targetRotation: number; onCanvasReady?: (canvas: HTMLCanvasElement) => void }
export function GarmentViewer({ onCanvasReady, ...props }: GarmentViewerProps) {
  const [draggingPrint, setDraggingPrint] = useState(false)
  return <Canvas dpr={1} gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' }} camera={{ fov: 35 }} onCreated={({ gl }) => onCanvasReady?.(gl.domElement)}>
    <GarmentScene config={garmentModels[0]} prints={props.printApplications} printZoneAdjustments={props.printZoneAdjustments} activePrintPlacement={props.activePrintPlacement} zoneEditMode={props.zoneEditMode} onPrintMove={props.onPrintMove} onPrintScale={props.onPrintScale} onPrintZoneChange={props.onPrintZoneChange} showPrintGuides={props.showPrintGuides ?? true} onPrintDragState={setDraggingPrint} controlsEnabled={!draggingPrint} garmentColor={props.garmentColor} animation={props.animation} duration={props.duration} playbackKey={props.playbackKey} targetRotation={props.targetRotation} />
  </Canvas>
}
