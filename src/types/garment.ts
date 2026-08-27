export type Vec3 = [number, number, number]
export type Vec2 = [number, number]
export interface PrintUvZone {
  center: Vec2
  right: Vec2
  up: Vec2
  islandMin: Vec2
  islandMax: Vec2
  surfaceNormal: Vec3
  /** Physical surface length represented by one UV unit. glTF units are metres. */
  metersPerUv: number
}
export interface PrintZone { position: Vec3; rotation: Vec3; scale: Vec3; uv?: PrintUvZone }
export interface GarmentModelConfig {
  id: string
  name: string
  path?: string
  kind: 'procedural' | 'gltf' | 'glb' | 'fbx'
  transform: { scale: number; rotation: Vec3; position: Vec3 }
  camera: { position: Vec3; target: Vec3 }
  printZones: Record<'frontCenter' | 'backCenter' | 'frontChest' | 'leftSleeve' | 'rightSleeve', PrintZone>
}
