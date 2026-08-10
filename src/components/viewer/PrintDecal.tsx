import { Decal, useTexture } from '@react-three/drei'
import type { RefObject } from 'react'
import * as THREE from 'three'
import type { PrintSettings } from '../../types/studio'
import type { PrintZone } from '../../types/garment'

export function PrintDecal({ settings, zone, mesh }: { settings: PrintSettings; zone: PrintZone; mesh?: RefObject<THREE.Mesh | null> }) {
  const texture = useTexture(settings.url!)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.premultiplyAlpha = true
  texture.generateMipmaps = false
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.anisotropy = 4
  texture.needsUpdate = true
  const aspect = texture.image ? texture.image.width / texture.image.height : 1
  const scale = zone.scale[0] * settings.scale
  return <Decal
    mesh={mesh as RefObject<THREE.Mesh> | undefined}
    position={[zone.position[0] + settings.x, zone.position[1] + settings.y, zone.position[2]]}
    rotation={[zone.rotation[0], zone.rotation[1], zone.rotation[2] + THREE.MathUtils.degToRad(settings.rotation)]}
    scale={[scale, scale / Math.max(aspect, 0.1), zone.scale[2]]}
    depthTest
  >
    <meshBasicMaterial map={texture} transparent alphaTest={0.075} alphaToCoverage polygonOffset polygonOffsetFactor={-3}
      toneMapped={false} premultipliedAlpha opacity={0.88 + settings.integration * 0.0012} />
  </Decal>
}
