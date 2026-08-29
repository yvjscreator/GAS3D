import { Suspense, useMemo, type RefObject } from 'react'
import { GarmentModel } from './GarmentModel'
import { StudioLights } from './StudioLights'
import { RotationController } from './RotationController'
import { CameraController } from './CameraController'
import { createAmbilightRig } from './ambilightRig'
import type { GarmentModelConfig } from '../../types/garment'
import type { BackgroundSettings, CameraViewSettings, DirectorFrame, EditorMode, PrintAlignmentRequest, PrintPlacement, PrintSettings, PrintZoneAdjustment } from '../../types/studio'

export function GarmentScene(props: { config: GarmentModelConfig; garmentColor: string; prints: PrintSettings[]; printZoneAdjustments: Record<PrintPlacement, PrintZoneAdjustment>; activePrintPlacement: PrintPlacement; editorMode: EditorMode; alignmentRequest: PrintAlignmentRequest | null; onPrintMove?: (placement: PrintPlacement, x: number, y: number) => void; onPrintScale?: (placement: PrintPlacement, scale: number) => void; onPrintZoneChange?: (placement: PrintPlacement, value: Partial<PrintZoneAdjustment>) => void; showPrintGuides: boolean; onPrintDragState: (dragging: boolean) => void; controlsEnabled: boolean; targetRotation: number; cameraView: CameraViewSettings; cameraFov?: number; cameraComposition?: [number, number]; onCameraViewChange?: (view: CameraViewSettings) => void; directorFrame?: DirectorFrame | null; background: BackgroundSettings; backgroundMediaRef: RefObject<HTMLImageElement | HTMLVideoElement | null> }) {
  const ambilightRig = useMemo(createAmbilightRig, [])
  return <Suspense fallback={null}>
    <StudioLights background={props.background} mediaRef={props.backgroundMediaRef} rig={ambilightRig} />
    <RotationController targetRotation={props.targetRotation} directorFrame={props.directorFrame}>
      <GarmentModel color={props.garmentColor} config={props.config} prints={props.prints} printZoneAdjustments={props.printZoneAdjustments} activePrintPlacement={props.activePrintPlacement} editorMode={props.editorMode} alignmentRequest={props.alignmentRequest} onPrintMove={props.onPrintMove} onPrintScale={props.onPrintScale} onPrintZoneChange={props.onPrintZoneChange} showPrintGuides={props.showPrintGuides} onPrintDragState={props.onPrintDragState} ambilightRig={ambilightRig} ambilightEnabled={props.background.ambilight && props.background.type === 'video'} />
    </RotationController>
    <CameraController view={props.cameraView} onViewChange={props.onCameraViewChange} enabled={props.controlsEnabled} directorFrame={props.directorFrame} fov={props.cameraFov} composition={props.cameraComposition} />
  </Suspense>
}
