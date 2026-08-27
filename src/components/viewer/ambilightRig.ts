import * as THREE from 'three'

export type AmbilightRig = {
  left: THREE.Color
  right: THREE.Color
  top: THREE.Color
  average: THREE.Color
  strength: number
  reach: number
}

export const createAmbilightRig = (): AmbilightRig => ({
  left: new THREE.Color('#111111'),
  right: new THREE.Color('#111111'),
  top: new THREE.Color('#111111'),
  average: new THREE.Color('#111111'),
  strength: 0,
  reach: 0.55,
})
