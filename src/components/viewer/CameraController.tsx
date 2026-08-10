import { OrbitControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import type { GarmentModelConfig } from '../../types/garment'

export function CameraController({ config, enabled = true }: { config: GarmentModelConfig; enabled?: boolean }) {
  const { camera } = useThree()
  useEffect(() => { camera.position.set(...config.camera.position); camera.lookAt(...config.camera.target) }, [camera, config])
  return <OrbitControls enabled={enabled} enablePan={false} minDistance={4.6} maxDistance={10} minPolarAngle={Math.PI / 2.9} maxPolarAngle={Math.PI / 1.65} />
}
