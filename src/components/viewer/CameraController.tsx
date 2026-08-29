import { OrbitControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, type ComponentRef } from 'react'
import * as THREE from 'three'
import type { CameraViewSettings, DirectorFrame } from '../../types/studio'

export function CameraController({ view, onViewChange, enabled = true, directorFrame = null, fov = 35, composition = [0, 0] }: { view: CameraViewSettings; onViewChange?: (view: CameraViewSettings) => void; enabled?: boolean; directorFrame?: DirectorFrame | null; fov?: number; composition?: [number, number] }) {
  const { camera, invalidate } = useThree()
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  useEffect(() => { if (!directorFrame) { camera.position.set(...view.position); camera.lookAt(...view.target); if ('fov' in camera) { camera.fov = fov; if (composition[0] || composition[1]) camera.setViewOffset(1000, 1000, composition[0] * 115, -composition[1] * 115, 1000, 1000); else camera.clearViewOffset(); camera.updateProjectionMatrix() } if (controls.current) controls.current.target.set(...view.target); invalidate() } }, [camera, composition, directorFrame, fov, invalidate, view])
  useEffect(() => { if (directorFrame) invalidate() }, [directorFrame, invalidate])
  useFrame(() => {
    if (!directorFrame) return
    camera.position.set(...directorFrame.cameraPosition); camera.lookAt(...directorFrame.cameraTarget)
    if ('fov' in camera && directorFrame.cameraFov) { camera.clearViewOffset(); camera.fov = directorFrame.cameraFov; camera.updateProjectionMatrix() }
  })
  return <OrbitControls
    ref={controls}
    enabled={enabled && !directorFrame}
    target={view.target}
    onEnd={() => {
      const target = controls.current?.target ?? new THREE.Vector3(...view.target)
      onViewChange?.({ position: [camera.position.x, camera.position.y, camera.position.z], target: [target.x, target.y, target.z] })
    }}
    enablePan
    screenSpacePanning
    panSpeed={0.72}
    mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN }}
    minDistance={4.6}
    maxDistance={22}
    minPolarAngle={Math.PI / 2.9}
    maxPolarAngle={Math.PI / 1.65}
  />
}
