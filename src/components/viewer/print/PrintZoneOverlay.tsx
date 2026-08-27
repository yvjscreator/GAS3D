import { useEffect, useMemo, useRef } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { PrintPlacement, PrintZoneAdjustment } from '../../../types/studio'
import { frameQuaternion, SURFACE_UI_EPSILON, type SurfaceFrame } from './SurfaceFrame'

type MoveState = {
  mode: 'move'
  plane: THREE.Plane
  startHit: THREE.Vector3
  right: THREE.Vector3
  up: THREE.Vector3
  worldScale: number
  startX: number
  startY: number
}
type ResizeState = {
  mode: 'resize'
  plane: THREE.Plane
  center: THREE.Vector3
  right: THREE.Vector3
  up: THREE.Vector3
  worldScale: number
  baseWidth: number
  baseHeight: number
}

type PointerCaptureTarget = { setPointerCapture?: (pointerId: number) => void; releasePointerCapture?: (pointerId: number) => void }
const pointerTarget = (event: ThreeEvent<PointerEvent>) => event.target as PointerCaptureTarget | null

export function PrintZoneOverlay({ frame, adjustment, placement, normalizer, onChange, onDragState }: {
  frame: SurfaceFrame
  adjustment: PrintZoneAdjustment
  placement: PrintPlacement
  normalizer: number
  onChange?: (placement: PrintPlacement, value: Partial<PrintZoneAdjustment>) => void
  onDragState: (dragging: boolean) => void
}) {
  const root = useRef<THREE.Group>(null)
  const interaction = useRef<MoveState | ResizeState | null>(null)
  const quaternion = useMemo(() => frameQuaternion(frame), [frame])
  const displayPosition = frame.center.clone().addScaledVector(frame.normal, SURFACE_UI_EPSILON / normalizer)
  const handleSize = 0.06 / normalizer
  const geometry = useMemo(() => new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-frame.width / 2, -frame.height / 2, 0), new THREE.Vector3(frame.width / 2, -frame.height / 2, 0),
    new THREE.Vector3(frame.width / 2, -frame.height / 2, 0), new THREE.Vector3(frame.width / 2, frame.height / 2, 0),
    new THREE.Vector3(frame.width / 2, frame.height / 2, 0), new THREE.Vector3(-frame.width / 2, frame.height / 2, 0),
    new THREE.Vector3(-frame.width / 2, frame.height / 2, 0), new THREE.Vector3(-frame.width / 2, -frame.height / 2, 0),
  ]), [frame.width, frame.height])
  useEffect(() => () => geometry.dispose(), [geometry])

  const captureWorldFrame = () => {
    root.current!.updateWorldMatrix(true, false)
    const matrix = root.current!.matrixWorld
    const center = frame.center.clone().applyMatrix4(matrix)
    const right = frame.right.clone().transformDirection(matrix)
    const up = frame.up.clone().transformDirection(matrix)
    const normal = frame.normal.clone().transformDirection(matrix)
    return { matrix, center, right, up, normal, worldScale: new THREE.Vector3().setFromMatrixScale(matrix).x }
  }
  const beginMove = (event: ThreeEvent<PointerEvent>) => {
    if (!root.current) return
    event.stopPropagation()
    const world = captureWorldFrame()
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(world.normal, world.center)
    const startHit = event.ray.intersectPlane(plane, new THREE.Vector3())
    if (!startHit) return
    interaction.current = { mode: 'move', plane, startHit, right: world.right, up: world.up, worldScale: world.worldScale, startX: adjustment.x, startY: adjustment.y }
    onDragState(true)
    pointerTarget(event)?.setPointerCapture?.(event.pointerId)
  }
  const beginResize = (event: ThreeEvent<PointerEvent>) => {
    if (!root.current) return
    event.stopPropagation()
    const world = captureWorldFrame()
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(world.normal, world.center)
    if (!event.ray.intersectPlane(plane, new THREE.Vector3())) return
    interaction.current = {
      mode: 'resize', plane, center: world.center, right: world.right, up: world.up, worldScale: world.worldScale,
      baseWidth: frame.width / Math.max(adjustment.width, 0.001),
      baseHeight: frame.height / Math.max(adjustment.height, 0.001),
    }
    onDragState(true)
    pointerTarget(event)?.setPointerCapture?.(event.pointerId)
  }
  const move = (event: ThreeEvent<PointerEvent>) => {
    const state = interaction.current
    if (!state) return
    event.stopPropagation()
    const hit = event.ray.intersectPlane(state.plane, new THREE.Vector3())
    if (!hit) return
    if (state.mode === 'move') {
      const delta = hit.sub(state.startHit)
      onChange?.(placement, {
        x: state.startX + delta.dot(state.right) / state.worldScale * normalizer,
        y: state.startY + delta.dot(state.up) / state.worldScale * normalizer,
      })
      return
    }
    const delta = hit.sub(state.center)
    onChange?.(placement, {
      width: THREE.MathUtils.clamp(Math.abs(delta.dot(state.right) / state.worldScale) * 2 / state.baseWidth, 0.3, 1.8),
      height: THREE.MathUtils.clamp(Math.abs(delta.dot(state.up) / state.worldScale) * 2 / state.baseHeight, 0.3, 1.8),
    })
  }
  const end = (event: ThreeEvent<PointerEvent>) => {
    if (!interaction.current) return
    event.stopPropagation()
    interaction.current = null
    onDragState(false)
    pointerTarget(event)?.releasePointerCapture?.(event.pointerId)
  }

  return <group ref={root}>
    <group position={displayPosition} quaternion={quaternion}>
      <mesh onPointerDown={beginMove} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
        <planeGeometry args={[frame.width, frame.height]} />
        <meshBasicMaterial transparent opacity={0} colorWrite={false} depthTest depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <lineSegments geometry={geometry} renderOrder={10}>
        <lineBasicMaterial color="#43a3ff" transparent opacity={1} depthTest depthWrite={false} toneMapped={false} />
      </lineSegments>
      {([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sy], index) => <group key={index} position={[sx * frame.width / 2, sy * frame.height / 2, 0]}
        onPointerDown={beginResize} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
        <mesh><circleGeometry args={[handleSize * 1.9, 20]} /><meshBasicMaterial transparent opacity={0} colorWrite={false} depthTest depthWrite={false} /></mesh>
        <mesh><circleGeometry args={[handleSize, 20]} /><meshBasicMaterial color="#43a3ff" depthTest depthWrite={false} toneMapped={false} /></mesh>
      </group>)}
    </group>
  </group>
}
