import { useFrame } from '@react-three/fiber'
import { renderAssetManager } from '../../render/RenderAssetManager'

export function RenderMetricsProbe() {
  useFrame(({ gl }) => renderAssetManager.updateRendererInfo(gl.info))
  return null
}
