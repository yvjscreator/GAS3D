import type { GarmentModelConfig, PrintZone } from '../types/garment'

const projectionZones: Record<keyof GarmentModelConfig['printZones'], PrintZone> = {
  frontCenter: { position: [0, 0.12, 1.1], rotation: [0, 0, 0], scale: [1.65, 2.05, 1.05] },
  backCenter: { position: [0, 0.12, -1.1], rotation: [0, Math.PI, 0], scale: [1.65, 2.05, 1.05] },
  frontChest: { position: [-0.56, 0.76, 1.06], rotation: [0, 0, 0], scale: [0.7, 0.85, 0.45] },
  leftSleeve: { position: [-1.87, 0.77, -0.03], rotation: [-2.526, -1.155, -2.567], scale: [0.52, 0.58, 0.3] },
  rightSleeve: { position: [1.88, 0.79, -0.01], rotation: [-2.597, 1.135, 2.639], scale: [0.52, 0.58, 0.3] },
}

const METERS_PER_UV = 1.86
const uvZones: GarmentModelConfig['printZones'] = {
  frontCenter: { ...projectionZones.frontCenter, uv: { center: [0.224, 0.800], right: [1, 0], up: [0, -1], islandMin: [0.048, 0.617], islandMax: [0.400, 0.975], surfaceNormal: [0, 0, 1], metersPerUv: METERS_PER_UV } },
  frontChest: { ...projectionZones.frontChest, uv: { center: [0.170, 0.710], right: [1, 0], up: [0, -1], islandMin: [0.048, 0.617], islandMax: [0.400, 0.975], surfaceNormal: [0, 0, 1], metersPerUv: METERS_PER_UV } },
  backCenter: { ...projectionZones.backCenter, uv: { center: [0.583, 0.800], right: [1, 0], up: [0, -1], islandMin: [0.407, 0.610], islandMax: [0.759, 0.982], surfaceNormal: [0, 0, -1], metersPerUv: METERS_PER_UV } },
  leftSleeve: { ...projectionZones.leftSleeve, uv: { center: [0.853, 0.522], right: [1, 0], up: [0, -1], islandMin: [0.713, 0.450], islandMax: [0.992, 0.593], surfaceNormal: [-1, 0, 0], metersPerUv: METERS_PER_UV } },
  rightSleeve: { ...projectionZones.rightSleeve, uv: { center: [0.549, 0.522], right: [1, 0], up: [0, -1], islandMin: [0.410, 0.450], islandMax: [0.689, 0.593], surfaceNormal: [1, 0, 0], metersPerUv: METERS_PER_UV } },
}

export const garmentModels: GarmentModelConfig[] = [
  {
    id: 'male-oversized-tshirt-glb-01', name: 'Male oversized T-shirt · optimized GLB', kind: 'glb',
    path: '/assets/models/garments/optimized/garment_web_v2.glb',
    transform: { scale: 1, rotation: [0, 0, 0], position: [0, 0, 0] },
    camera: { position: [0, 0.15, 12.35], target: [0, 0.15, 0] },
    printZones: uvZones,
  },
  {
    id: 'male-oversized-tshirt-fbx-01', name: 'Male oversized T-shirt · FBX fallback', kind: 'fbx',
    path: '/assets/models/garments/garment-source/fbx/fbx.fbx',
    transform: { scale: 1, rotation: [0, 0, 0], position: [0, 0, 0] },
    camera: { position: [0, 0.15, 12.35], target: [0, 0.15, 0] },
    printZones: projectionZones,
  },
]
