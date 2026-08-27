import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Group } from 'three'
import type { AnimationPreset } from '../../types/studio'
import type { ProfessionalRecordingFrame } from '../../config/professionalRecording'

export function RotationController({ children, animation, duration, playbackKey, targetRotation, professionalFrame = null, onGroup }: {
  children: React.ReactNode; animation: AnimationPreset; duration: number; playbackKey: number; targetRotation: number; professionalFrame?: ProfessionalRecordingFrame | null; onGroup?: (group: Group) => void
}) {
  const group = useRef<Group>(null)
  const started = useRef<number | null>(null)
  const invalidate = useThree((state) => state.invalidate)
  useEffect(() => { started.current = performance.now(); invalidate() }, [invalidate, playbackKey])
  useEffect(() => { invalidate() }, [animation, duration, invalidate, targetRotation, professionalFrame])
  useEffect(() => { if (group.current) onGroup?.(group.current) }, [onGroup])
  useFrame(() => {
    if (!group.current) return
    const elapsed = started.current === null ? duration : (performance.now() - started.current) / 1000
    const turns = animation === 'spin180' ? Math.PI : animation === 'spin360' ? Math.PI * 2 : 0
    const active = elapsed < duration && playbackKey > 0
    const desired = professionalFrame ? professionalFrame.rotation : active ? turns * Math.min(elapsed / duration, 1) : targetRotation
    const previous = group.current.rotation.y
    group.current.rotation.y = professionalFrame ? desired : THREE.MathUtils.damp(previous, desired, 7, 1 / 60)
    if (professionalFrame || active || Math.abs(group.current.rotation.y - desired) > 0.0005) invalidate()
  })
  return <group ref={group}>{children}</group>
}
