import { Suspense } from 'react'
import { GarmentModel } from './GarmentModel'
import { StudioLights } from './StudioLights'
import { RotationController } from './RotationController'
import { CameraController } from './CameraController'
import type { GarmentModelConfig } from '../../types/garment'
import type { AnimationPreset, PrintPlacement, PrintSettings, PrintZoneAdjustment } from '../../types/studio'

export function GarmentScene(props: { config: GarmentModelConfig; garmentColor: string; prints: PrintSettings[]; printZoneAdjustments: Record<PrintPlacement, PrintZoneAdjustment>; activePrintPlacement: PrintPlacement; zoneEditMode: boolean; onPrintMove?: (placement: PrintPlacement, x: number, y: number) => void; onPrintScale?: (placement: PrintPlacement, scale: number) => void; onPrintZoneChange?: (placement: PrintPlacement, value: Partial<PrintZoneAdjustment>) => void; showPrintGuides: boolean; onPrintDragState: (dragging: boolean) => void; controlsEnabled: boolean; animation: AnimationPreset; duration: number; playbackKey: number; targetRotation: number }) {
  return <Suspense fallback={null}>
    <StudioLights />
    <RotationController animation={props.animation} duration={props.duration} playbackKey={props.playbackKey} targetRotation={props.targetRotation}>
      <GarmentModel color={props.garmentColor} config={props.config} prints={props.prints} printZoneAdjustments={props.printZoneAdjustments} activePrintPlacement={props.activePrintPlacement} zoneEditMode={props.zoneEditMode} onPrintMove={props.onPrintMove} onPrintScale={props.onPrintScale} onPrintZoneChange={props.onPrintZoneChange} showPrintGuides={props.showPrintGuides} onPrintDragState={props.onPrintDragState} />
    </RotationController>
    <CameraController config={props.config} enabled={props.controlsEnabled} />
  </Suspense>
}
