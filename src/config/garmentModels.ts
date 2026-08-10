import type { GarmentModelConfig } from '../types/garment'

// Replace `kind` and add `path` when a licensed .glb/.gltf is placed in public/assets/models/garments.
export const garmentModels: GarmentModelConfig[] = [{
  id: 'male-oversized-tshirt-01', name: 'Male oversized T-shirt', kind: 'fbx',
  path: '/assets/models/garments/garment-source/fbx/fbx.fbx',
  transform: { scale: 1, rotation: [0, 0, 0], position: [0, 0, 0] },
  camera: { position: [0, 0.15, 8.4], target: [0, 0.15, 0] },
  printZones: {
    // Values are calibrated from this FBX's actual bounding box. The third scale
    // component is projection depth, not visible print thickness.
    frontCenter: { position: [0, 0.12, 1.1], rotation: [0, 0, 0], scale: [1.65, 2.05, 1.05] },
    backCenter: { position: [0, 0.12, -1.1], rotation: [0, Math.PI, 0], scale: [1.65, 2.05, 1.05] },
    frontChest: { position: [-0.56, 0.76, 1.06], rotation: [0, 0, 0], scale: [0.7, 0.85, 0.45] },
    leftSleeve: { position: [-1.87, 0.77, -0.03], rotation: [-2.526, -1.155, -2.567], scale: [0.52, 0.58, 0.3] },
    rightSleeve: { position: [1.88, 0.79, -0.01], rotation: [-2.597, 1.135, 2.639], scale: [0.52, 0.58, 0.3] },
  },
}]
