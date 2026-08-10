import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Group } from 'three'
import type { AnimationPreset } from '../../types/studio'

export function RotationController({ children, animation, duration, playbackKey, targetRotation, onGroup }: {
  children: React.ReactNode; animation: AnimationPreset; duration: number; playbackKey: number; targetRotation: number; onGroup?: (group: Group) => void
}) {
  const group = useRef<Group>(null)
  const started = useRef<number | null>(null)
  useEffect(() => { started.current = performance.now(); }, [playbackKey])
  useEffect(() => { if (group.current) onGroup?.(group.current) }, [onGroup])
  useFrame(() => {
    if (!group.current) return
    const elapsed = started.current === null ? duration : (performance.now() - started.current) / 1000
    const turns = animation === 'spin180' ? Math.PI : animation === 'spin360' ? Math.PI * 2 : 0
    const active = elapsed < duration && playbackKey > 0
    const desired = active ? turns * Math.min(elapsed / duration, 1) : targetRotation
    group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, desired, 7, 1 / 60)
  })
  return <group ref={group}>{children}</group>
}
