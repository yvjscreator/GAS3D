import { OrbitControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, type ComponentRef } from 'react'
import * as THREE from 'three'
import type { CameraViewSettings, DirectorFrame } from '../../types/studio'

export function CameraController({ view, onViewChange, enabled = true, directorFrame = null, fov = 35, composition = [0, 0] }: { view: CameraViewSettings; onViewChange?: (view: CameraViewSettings) => void; enabled?: boolean; directorFrame?: DirectorFrame | null; fov?: number; composition?: [number, number] }) {
  const { camera, invalidate } = useThree()
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const { position, target } = view
  const [offsetX, offsetY] = composition
  const directed = directorFrame !== null

  // The saved pose seeds the orbit. Layer selection and lens changes must
  // leave the live position under OrbitControls' ownership.
  useEffect(() => {
    if (directed) return
    camera.position.set(...position)
    camera.lookAt(...target)
    controls.current?.target.set(...target)
    invalidate()
  }, [camera, directed, invalidate, position, target])

  useEffect(() => {
    if (directed || !('fov' in camera)) return
    camera.fov = fov
    if (offsetX || offsetY) camera.setViewOffset(1000, 1000, offsetX * 115, -offsetY * 115, 1000, 1000)
    else camera.clearViewOffset()
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, directed, fov, invalidate, offsetX, offsetY])

  useEffect(() => { if (directorFrame) invalidate() }, [directorFrame, invalidate])
  useFrame(() => {
    if (!directorFrame) return
    camera.position.set(...directorFrame.cameraPosition); camera.lookAt(...directorFrame.cameraTarget)
    if ('fov' in camera && directorFrame.cameraFov) { camera.clearViewOffset(); camera.fov = directorFrame.cameraFov; camera.updateProjectionMatrix() }
  })
  return <OrbitControls
    ref={controls}
    enabled={enabled && !directorFrame}
    enableDamping={false}
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
