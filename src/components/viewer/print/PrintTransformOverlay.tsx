import { useEffect, useMemo, useRef } from 'react'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { PrintPlacement, PrintSettings } from '../../../types/studio'
import { frameQuaternion, getPrintMovementLimits, SURFACE_UI_EPSILON, type PrintSurfaceFrame } from './SurfaceFrame'

type DragState =
  | { mode: 'move'; plane: THREE.Plane; zoneCenter: THREE.Vector3; right: THREE.Vector3; up: THREE.Vector3; worldScale: number; offsetX: number; offsetY: number }
  | { mode: 'scale'; centerX: number; centerY: number; startDistance: number; startScale: number }

type PointerCaptureTarget = { setPointerCapture?: (pointerId: number) => void; releasePointerCapture?: (pointerId: number) => void }
const pointerTarget = (event: ThreeEvent<PointerEvent>) => event.target as PointerCaptureTarget | null

export function PrintTransformOverlay({ frame, settings, normalizer, onMove, onScale, onCommit, onDragState }: {
  frame: PrintSurfaceFrame
  settings: PrintSettings
  normalizer: number
  onMove?: (placement: PrintPlacement, x: number, y: number) => void
  onScale?: (placement: PrintPlacement, scale: number) => void
  onCommit?: () => void
  onDragState: (dragging: boolean) => void
}) {
  const root = useRef<THREE.Group>(null)
  const interaction = useRef<DragState | null>(null)
  const { camera, gl } = useThree()
  const quaternion = useMemo(() => frameQuaternion(frame), [frame])
  const geometry = useMemo(() => new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-frame.width / 2, -frame.height / 2, 0), new THREE.Vector3(frame.width / 2, -frame.height / 2, 0),
    new THREE.Vector3(frame.width / 2, -frame.height / 2, 0), new THREE.Vector3(frame.width / 2, frame.height / 2, 0),
    new THREE.Vector3(frame.width / 2, frame.height / 2, 0), new THREE.Vector3(-frame.width / 2, frame.height / 2, 0),
    new THREE.Vector3(-frame.width / 2, frame.height / 2, 0), new THREE.Vector3(-frame.width / 2, -frame.height / 2, 0),
  ]), [frame.width, frame.height])
  useEffect(() => () => geometry.dispose(), [geometry])
  const limits = getPrintMovementLimits(frame.zone, frame, settings.rotation, normalizer)
  const displayPosition = frame.center.clone().addScaledVector(frame.normal, SURFACE_UI_EPSILON / normalizer)
  const handleSize = 0.055 / normalizer

  const worldDirection = (direction: THREE.Vector3) => direction.clone().transformDirection(root.current!.matrixWorld)
  const beginMove = (event: ThreeEvent<PointerEvent>) => {
    if (!root.current) return
    event.stopPropagation()
    root.current.updateWorldMatrix(true, false)
    const matrix = root.current.matrixWorld
    const worldScale = new THREE.Vector3().setFromMatrixScale(matrix).x
    const zoneCenter = frame.zone.center.clone().applyMatrix4(matrix)
    const right = worldDirection(frame.zone.right)
    const up = worldDirection(frame.zone.up)
    const normal = worldDirection(frame.zone.normal)
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, zoneCenter)
    const hit = event.ray.intersectPlane(plane, new THREE.Vector3())
    if (!hit) return
    interaction.current = {
      mode: 'move', plane, zoneCenter, right, up, worldScale,
      offsetX: hit.clone().sub(zoneCenter).dot(right) / worldScale * normalizer - settings.x,
      offsetY: hit.clone().sub(zoneCenter).dot(up) / worldScale * normalizer - settings.y,
    }
    onDragState(true)
    pointerTarget(event)?.setPointerCapture?.(event.pointerId)
  }
  const beginScale = (event: ThreeEvent<PointerEvent>) => {
    if (!root.current) return
    event.stopPropagation()
    root.current.updateWorldMatrix(true, false)
    const rect = gl.domElement.getBoundingClientRect()
    const projected = frame.center.clone().applyMatrix4(root.current.matrixWorld).project(camera)
    const centerX = rect.left + (projected.x + 1) * rect.width * 0.5
    const centerY = rect.top + (1 - projected.y) * rect.height * 0.5
    interaction.current = {
      mode: 'scale', centerX, centerY,
      startDistance: Math.max(8, Math.hypot(event.clientX - centerX, event.clientY - centerY)),
      startScale: settings.scale,
    }
    onDragState(true)
    pointerTarget(event)?.setPointerCapture?.(event.pointerId)
  }
  const move = (event: ThreeEvent<PointerEvent>) => {
    const state = interaction.current
    if (!state) return
    event.stopPropagation()
    if (state.mode === 'scale') {
      const distance = Math.hypot(event.clientX - state.centerX, event.clientY - state.centerY)
      onScale?.(settings.placement, THREE.MathUtils.clamp(state.startScale * distance / state.startDistance, 0.2, 2.5))
      return
    }
    const hit = event.ray.intersectPlane(state.plane, new THREE.Vector3())
    if (!hit) return
    const delta = hit.sub(state.zoneCenter)
    const x = THREE.MathUtils.clamp(delta.dot(state.right) / state.worldScale * normalizer - state.offsetX, -limits.x, limits.x)
    const y = THREE.MathUtils.clamp(delta.dot(state.up) / state.worldScale * normalizer - state.offsetY, -limits.y, limits.y)
    onMove?.(settings.placement, x, y)
  }
  const end = (event: ThreeEvent<PointerEvent>) => {
    if (!interaction.current) return
    event.stopPropagation()
    onCommit?.()
    interaction.current = null
    onDragState(false)
    pointerTarget(event)?.releasePointerCapture?.(event.pointerId)
  }

  return <group ref={root}>
    <group position={displayPosition} quaternion={quaternion}>
      <mesh onPointerDown={beginMove} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
        <planeGeometry args={[frame.width, frame.height]} />
        <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} depthTest side={THREE.DoubleSide} />
      </mesh>
      <lineSegments geometry={geometry} renderOrder={10}>
        <lineBasicMaterial color="#9bd0ff" transparent opacity={0.95} depthTest depthWrite={false} toneMapped={false} />
      </lineSegments>
      {([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sy], index) => <group key={index} position={[sx * frame.width / 2, sy * frame.height / 2, 0]}
        onPointerDown={beginScale} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
        <mesh><circleGeometry args={[handleSize * 1.9, 20]} /><meshBasicMaterial transparent opacity={0} colorWrite={false} depthTest depthWrite={false} /></mesh>
        <mesh><circleGeometry args={[handleSize, 20]} /><meshBasicMaterial color="#eaf6ff" depthTest depthWrite={false} toneMapped={false} /></mesh>
      </group>)}
    </group>
  </group>
}
