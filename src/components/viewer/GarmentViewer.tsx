import { Canvas } from '@react-three/fiber'
import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { garmentModels } from '../../config/garmentModels'
import { GarmentScene } from './GarmentScene'
import type { AnimationPreset, BackgroundSettings, CameraViewSettings, EditorMode, PrintAlignmentRequest, PrintPlacement, PrintSettings, PrintZoneAdjustment } from '../../types/studio'
import type { ProfessionalRecordingFrame } from '../../config/professionalRecording'
import { RenderMetricsProbe } from './RenderMetricsProbe'

export interface GarmentViewerProps { garmentColor: string; printApplications: PrintSettings[]; printZoneAdjustments: Record<PrintPlacement, PrintZoneAdjustment>; activePrintPlacement: PrintPlacement; editorMode: EditorMode; alignmentRequest: PrintAlignmentRequest | null; onPrintMove?: (placement: PrintPlacement, x: number, y: number) => void; onPrintScale?: (placement: PrintPlacement, scale: number) => void; onPrintZoneChange?: (placement: PrintPlacement, value: Partial<PrintZoneAdjustment>) => void; showPrintGuides?: boolean; animation: AnimationPreset; duration: number; playbackKey: number; targetRotation: number; cameraView: CameraViewSettings; cameraFov?: number; cameraComposition?: [number, number]; onCameraViewChange?: (view: CameraViewSettings) => void; professionalFrame?: ProfessionalRecordingFrame | null; background: BackgroundSettings; backgroundMediaRef: RefObject<HTMLImageElement | HTMLVideoElement | null>; renderResolution?: { width: number; height: number } | null; onCanvasReady?: (canvas: HTMLCanvasElement) => void }
export function GarmentViewer({ onCanvasReady, ...props }: GarmentViewerProps) {
  const [draggingPrint, setDraggingPrint] = useState(false)
  const host = useRef<HTMLDivElement>(null)
  const [hostHeight, setHostHeight] = useState(1)
  useLayoutEffect(() => {
    if (!host.current) return
    const update = () => setHostHeight(Math.max(1, host.current?.getBoundingClientRect().height ?? 1))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(host.current)
    return () => observer.disconnect()
  }, [])
  const dpr = props.renderResolution ? props.renderResolution.height / hostHeight : 1
  return <div ref={host} className="garment-viewer-host"><Canvas frameloop="demand" dpr={dpr} gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' }} camera={{ fov: props.cameraFov ?? 35 }} onCreated={({ gl }) => onCanvasReady?.(gl.domElement)}>
    <RenderMetricsProbe />
    <GarmentScene config={garmentModels[0]} prints={props.printApplications} printZoneAdjustments={props.printZoneAdjustments} activePrintPlacement={props.activePrintPlacement} editorMode={props.editorMode} alignmentRequest={props.alignmentRequest} onPrintMove={props.onPrintMove} onPrintScale={props.onPrintScale} onPrintZoneChange={props.onPrintZoneChange} showPrintGuides={props.showPrintGuides ?? true} onPrintDragState={setDraggingPrint} controlsEnabled={!draggingPrint} garmentColor={props.garmentColor} animation={props.animation} duration={props.duration} playbackKey={props.playbackKey} targetRotation={props.targetRotation} cameraView={props.cameraView} cameraFov={props.cameraFov} cameraComposition={props.cameraComposition} onCameraViewChange={props.onCameraViewChange} professionalFrame={props.professionalFrame} background={props.background} backgroundMediaRef={props.backgroundMediaRef} />
  </Canvas></div>
}
