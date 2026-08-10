export type Vec3 = [number, number, number]
export interface PrintZone { position: Vec3; rotation: Vec3; scale: Vec3 }
export interface GarmentModelConfig {
  id: string
  name: string
  path?: string
  kind: 'procedural' | 'gltf' | 'fbx'
  transform: { scale: number; rotation: Vec3; position: Vec3 }
  camera: { position: Vec3; target: Vec3 }
  printZones: Record<'frontCenter' | 'backCenter' | 'frontChest' | 'leftSleeve' | 'rightSleeve', PrintZone>
}
