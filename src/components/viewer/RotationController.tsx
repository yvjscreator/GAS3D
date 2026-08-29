import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Group } from 'three'
import type { DirectorFrame } from '../../types/studio'

export function RotationController({ children, targetRotation, directorFrame = null, onGroup }: {
  children: React.ReactNode; targetRotation: number; directorFrame?: DirectorFrame | null; onGroup?: (group: Group) => void
}) {
  const group = useRef<Group>(null)
  const invalidate = useThree((state) => state.invalidate)
  useEffect(() => { invalidate() }, [directorFrame, invalidate, targetRotation])
  useEffect(() => { if (group.current) onGroup?.(group.current) }, [onGroup])
  useFrame(() => {
    if (!group.current) return
    const desired = directorFrame ? directorFrame.rotation : targetRotation
    const previous = group.current.rotation.y
    group.current.rotation.y = directorFrame ? desired : THREE.MathUtils.damp(previous, desired, 7, 1 / 60)
    if (directorFrame || Math.abs(group.current.rotation.y - desired) > 0.0005) invalidate()
  })
  return <group ref={group}>{children}</group>
}
