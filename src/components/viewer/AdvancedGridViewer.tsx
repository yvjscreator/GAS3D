import { Canvas, createPortal, useFrame, useThree } from '@react-three/fiber'
import { Fragment, Suspense, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import { garmentModels } from '../../config/garmentModels'
import type { BackgroundSettings, BeatSyncStyle, PrintPlacement, PrintSettings, PrintZoneAdjustment, VariantCameraPreset } from '../../types/studio'
import { GarmentModel } from './GarmentModel'
import { createAmbilightRig } from './ambilightRig'
import { getGridLayout } from '../../utils/gridLayout'
import { evaluateGarmentMotion } from '../../config/garmentMotions'
import type { GarmentMotionId } from '../../types/studio'
import { rhythmicProgress } from '../../utils/beatSync'
import { renderAssetManager } from '../../render/RenderAssetManager'

export type GridVariantView = {
  id: string
  prints: PrintSettings[]
  zones: Record<PrintPlacement, PrintZoneAdjustment>
  camera: VariantCameraPreset
  garmentColor?: string
  baseRotation?: number
  primaryPlacement?: PrintPlacement
  companionPlacement?: PrintPlacement
  motion?: GarmentMotionId
  beatDelay?: number
  beatStyle?: BeatSyncStyle
}

const createGridRenderState = (ids: string[]) => ({
  scenes: ids.map(() => new THREE.Scene()),
  cameras: ids.map(() => new THREE.PerspectiveCamera(35, 1, .1, 100)),
})

function GridGarment({ view, color, time, duration }: { view: GridVariantView; color: string; time: number; duration: number }) {
  const group = useRef<THREE.Group>(null)
  const rig = useMemo(createAmbilightRig, [])
  useFrame(() => {
    if (!group.current) return
    const localTime = time - (view.beatDelay ?? 0)
    const rawProgress = Math.max(0, Math.min(1, localTime / Math.max(.1, duration - (view.beatDelay ?? 0))))
    const progress = view.beatStyle ? rhythmicProgress(rawProgress, view.beatStyle) : rawProgress
    group.current.visible = localTime >= 0
    const entrance = Math.max(0, Math.min(1, localTime / .24))
    const scale = .86 + .14 * entrance * entrance * (3 - 2 * entrance)
    group.current.scale.setScalar(scale)
    group.current.rotation.y = view.motion && view.companionPlacement
      ? evaluateGarmentMotion(view.motion, progress, view.primaryPlacement ?? 'frontCenter', view.companionPlacement).rotation
      : (view.baseRotation ?? 0) + progress * Math.PI * 2
  })
  return <>
    <ambientLight intensity={.68} />
    <directionalLight position={[4, 5, 5]} intensity={2.05} />
    <directionalLight position={[-5, 2, 3]} intensity={.95} />
    <directionalLight position={[0, 3, -5]} intensity={1.4} />
    <group ref={group}>
      <GarmentModel
        color={view.garmentColor ?? color} config={garmentModels[0]} prints={view.prints} printZoneAdjustments={view.zones}
        activePrintPlacement="frontCenter" editorMode="design" alignmentRequest={null} ambilightRig={rig}
        ambilightEnabled={false} showPrintGuides={false} onPrintDragState={() => undefined}
      />
    </group>
  </>
}

function GridRenderer({ views, color, time, duration }: { views: GridVariantView[]; color: string; time: number; duration: number }) {
  const { gl, size, invalidate } = useThree()
  const viewIdsKey = views.map((view) => view.id).join('\u0000')
  const { scenes, cameras } = useMemo(() => createGridRenderState(viewIdsKey ? viewIdsKey.split('\u0000') : []), [viewIdsKey])
  useLayoutEffect(() => { invalidate() }, [color, duration, invalidate, time, views])
  useFrame(() => {
    gl.setClearColor(0x000000, 0)
    gl.setScissorTest(false)
    gl.setViewport(0, 0, size.width, size.height)
    gl.clear(true, true, true)
    gl.setScissorTest(true)
    const layout = getGridLayout(views.length)
    views.forEach((view, index) => {
      const cell = layout[index]; const x = cell.x * size.width; const y = cell.y * size.height
      const width = Math.ceil(cell.width * size.width); const height = Math.ceil(cell.height * size.height)
      const camera = cameras[index]
      const localTime = time - (view.beatDelay ?? 0)
      const rawProgress = Math.max(0, Math.min(1, localTime / Math.max(.1, duration - (view.beatDelay ?? 0))))
      const progress = view.beatStyle ? rhythmicProgress(rawProgress, view.beatStyle) : rawProgress
      const cameraScale = view.motion && view.companionPlacement ? evaluateGarmentMotion(view.motion, progress, view.primaryPlacement ?? 'frontCenter', view.companionPlacement).cameraScale : 1
      camera.position.set(...view.camera.position).sub(new THREE.Vector3(...view.camera.target)).multiplyScalar(cameraScale).add(new THREE.Vector3(...view.camera.target))
      camera.lookAt(view.camera.target[0] - view.camera.composition[0] * 1.25, view.camera.target[1] + view.camera.composition[1] * 1.5, view.camera.target[2])
      camera.fov = view.camera.fov; camera.aspect = width / height; camera.updateProjectionMatrix()
      gl.setViewport(x, y, width, height); gl.setScissor(x + 1, y + 1, Math.max(1, width - 2), Math.max(1, height - 2))
      gl.clearDepth(); gl.render(scenes[index], camera)
    })
    gl.setScissorTest(false)
    gl.setViewport(0, 0, size.width, size.height)
    renderAssetManager.updateRendererInfo(gl.info)
  }, 1)
  return <>{views.map((view, index) => <Fragment key={view.id}>{createPortal(<Suspense fallback={null}><group name={view.id}><GridGarment view={view} color={color} time={time} duration={duration} /></group></Suspense>, scenes[index])}</Fragment>)}</>
}

export function AdvancedGridViewer({ views, garmentColor, time, duration, renderResolution, onCanvasReady }: {
  views: GridVariantView[]
  garmentColor: string
  time: number
  duration: number
  background: BackgroundSettings
  backgroundMediaRef: RefObject<HTMLImageElement | HTMLVideoElement | null>
  renderResolution?: { width: number; height: number } | null
  onCanvasReady?: (canvas: HTMLCanvasElement) => void
}) {
  const host = useRef<HTMLDivElement>(null); const [height, setHeight] = useState(1)
  useLayoutEffect(() => {
    if (!host.current) return
    const update = () => setHeight(Math.max(1, host.current?.getBoundingClientRect().height ?? 1)); update()
    const observer = new ResizeObserver(update); observer.observe(host.current); return () => observer.disconnect()
  }, [])
  const dpr = renderResolution ? renderResolution.height / height : 1
  return <div ref={host} className="garment-viewer-host advanced-grid-viewer"><Canvas frameloop="demand" dpr={dpr} gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' }} onCreated={({ gl }) => onCanvasReady?.(gl.domElement)}>
    <GridRenderer views={views} color={garmentColor} time={time} duration={duration} />
  </Canvas></div>
}
