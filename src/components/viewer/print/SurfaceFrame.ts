import * as THREE from 'three'
import type { GarmentModelConfig } from '../../../types/garment'
import type { PrintPlacement, PrintSettings, PrintZoneAdjustment } from '../../../types/studio'
import { printZoneBaseSizesCm } from '../../../config/printZoneSizes'

/** One small visual offset, expressed in normalized viewer units. */
export const SURFACE_UI_EPSILON = 0.0025

export interface SurfaceFrame {
  center: THREE.Vector3
  right: THREE.Vector3
  up: THREE.Vector3
  normal: THREE.Vector3
  width: number
  height: number
  depth: number
}

export interface PrintSurfaceFrame extends SurfaceFrame {
  zone: SurfaceFrame
  texture?: THREE.Texture
}

export interface UvSurfaceFrame {
  center: THREE.Vector2
  right: THREE.Vector2
  up: THREE.Vector2
  width: number
  height: number
  islandMin: THREE.Vector2
  islandMax: THREE.Vector2
  metersPerUv: number
}

export interface PrintUvSurfaceFrame extends UvSurfaceFrame {
  zone: UvSurfaceFrame
}

const axesFromRotation = (rotation: [number, number, number]) => {
  const euler = new THREE.Euler(...rotation)
  return {
    right: new THREE.Vector3(1, 0, 0).applyEuler(euler).normalize(),
    up: new THREE.Vector3(0, 1, 0).applyEuler(euler).normalize(),
    normal: new THREE.Vector3(0, 0, 1).applyEuler(euler).normalize(),
  }
}

export function createZoneSurfaceFrame(
  config: GarmentModelConfig,
  placement: PrintPlacement,
  adjustment: PrintZoneAdjustment,
  normalizer: number,
  sourceCenter: THREE.Vector3,
): SurfaceFrame {
  const zone = config.printZones[placement]
  const baseAxes = axesFromRotation(zone.rotation)
  const axes = axesFromRotation(adjustment.rotation ?? zone.rotation)
  const center = new THREE.Vector3(
    zone.position[0] / normalizer + sourceCenter.x,
    zone.position[1] / normalizer + sourceCenter.y,
    zone.position[2] / normalizer + sourceCenter.z,
  )
    .addScaledVector(baseAxes.right, adjustment.x / normalizer)
    .addScaledVector(baseAxes.up, adjustment.y / normalizer)
    .addScaledVector(baseAxes.normal, adjustment.z / normalizer)

  return {
    center,
    ...axes,
    width: zone.scale[0] * adjustment.width / normalizer,
    height: zone.scale[1] * adjustment.height / normalizer,
    depth: zone.scale[2] * 2.1 / normalizer,
  }
}

export function createPrintSurfaceFrame(
  zone: SurfaceFrame,
  settings: PrintSettings,
  normalizer: number,
  aspect: number,
  texture?: THREE.Texture,
): PrintSurfaceFrame {
  const angle = THREE.MathUtils.degToRad(settings.rotation)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const right = zone.right.clone().multiplyScalar(cos).addScaledVector(zone.up, sin).normalize()
  const up = zone.up.clone().multiplyScalar(cos).addScaledVector(zone.right, -sin).normalize()
  const width = Math.min(zone.width, zone.height * Math.max(aspect, 0.1)) * settings.scale
  return {
    zone,
    center: zone.center.clone()
      .addScaledVector(zone.right, settings.x / normalizer)
      .addScaledVector(zone.up, settings.y / normalizer),
    right,
    up,
    normal: zone.normal.clone(),
    width,
    height: width / Math.max(aspect, 0.1),
    depth: zone.depth * 1.14,
    texture,
  }
}

/** Limits in the persisted print coordinate system, derived from both rectangles. */
export function getPrintMovementLimits(zone: SurfaceFrame, print: SurfaceFrame, rotationDegrees: number, normalizer: number) {
  const angle = THREE.MathUtils.degToRad(rotationDegrees)
  const cos = Math.abs(Math.cos(angle))
  const sin = Math.abs(Math.sin(angle))
  const extentX = (print.width * cos + print.height * sin) * 0.5
  const extentY = (print.width * sin + print.height * cos) * 0.5
  return {
    x: Math.max(0, (zone.width * 0.5 - extentX) * normalizer),
    y: Math.max(0, (zone.height * 0.5 - extentY) * normalizer),
  }
}

export function frameQuaternion(frame: SurfaceFrame) {
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(frame.right, frame.up, frame.normal))
}

export function createZoneUvSurfaceFrame(
  config: GarmentModelConfig,
  placement: PrintPlacement,
  adjustment: PrintZoneAdjustment,
  normalizer: number,
): UvSurfaceFrame | null {
  const uv = config.printZones[placement].uv
  if (!uv) return null
  const right = new THREE.Vector2(...uv.right).normalize()
  const up = new THREE.Vector2(...uv.up).normalize()
  const physicalSize = printZoneBaseSizesCm[placement]
  const frame: UvSurfaceFrame = {
    center: new THREE.Vector2(...uv.center)
      .addScaledVector(right, adjustment.x / normalizer / uv.metersPerUv)
      .addScaledVector(up, adjustment.y / normalizer / uv.metersPerUv),
    right,
    up,
    width: physicalSize.width / 100 / uv.metersPerUv * adjustment.width,
    height: physicalSize.height / 100 / uv.metersPerUv * adjustment.height,
    islandMin: new THREE.Vector2(...uv.islandMin),
    islandMax: new THREE.Vector2(...uv.islandMax),
    metersPerUv: uv.metersPerUv,
  }
  clampUvCenterToIsland(frame.center, frame)
  return frame
}

export function createPrintUvSurfaceFrame(zone: UvSurfaceFrame, settings: PrintSettings, normalizer: number, aspect: number): PrintUvSurfaceFrame {
  const angle = THREE.MathUtils.degToRad(settings.rotation)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const right = zone.right.clone().multiplyScalar(cos).addScaledVector(zone.up, sin).normalize()
  const up = zone.up.clone().multiplyScalar(cos).addScaledVector(zone.right, -sin).normalize()
  const width = Math.min(zone.width, zone.height * Math.max(aspect, 0.1)) * settings.scale
  return {
    ...zone,
    zone,
    center: zone.center.clone()
      .addScaledVector(zone.right, settings.x / normalizer / zone.metersPerUv)
      .addScaledVector(zone.up, settings.y / normalizer / zone.metersPerUv),
    right,
    up,
    width,
    height: width / Math.max(aspect, 0.1),
  }
}

export function uvPointToFrame(point: THREE.Vector2, frame: UvSurfaceFrame) {
  const delta = point.clone().sub(frame.center)
  return new THREE.Vector2(delta.dot(frame.right), delta.dot(frame.up))
}

export function isUvPointInside(point: THREE.Vector2, frame: UvSurfaceFrame, padding = 0) {
  const local = uvPointToFrame(point, frame)
  return Math.abs(local.x) <= frame.width * 0.5 + padding && Math.abs(local.y) <= frame.height * 0.5 + padding
}

export function isUvPointInIsland(point: THREE.Vector2, frame: UvSurfaceFrame) {
  return point.x >= frame.islandMin.x && point.x <= frame.islandMax.x && point.y >= frame.islandMin.y && point.y <= frame.islandMax.y
}

export function clampUvCenterToIsland(center: THREE.Vector2, frame: UvSurfaceFrame, width = frame.width, height = frame.height) {
  const extentX = (Math.abs(frame.right.x) * width + Math.abs(frame.up.x) * height) * 0.5
  const extentY = (Math.abs(frame.right.y) * width + Math.abs(frame.up.y) * height) * 0.5
  center.x = THREE.MathUtils.clamp(center.x, frame.islandMin.x + extentX, frame.islandMax.x - extentX)
  center.y = THREE.MathUtils.clamp(center.y, frame.islandMin.y + extentY, frame.islandMax.y - extentY)
  return center
}

export function getUvPrintMovementLimits(zone: UvSurfaceFrame, print: UvSurfaceFrame, rotationDegrees: number, normalizer: number) {
  const angle = THREE.MathUtils.degToRad(rotationDegrees)
  const cos = Math.abs(Math.cos(angle))
  const sin = Math.abs(Math.sin(angle))
  const extentX = (print.width * cos + print.height * sin) * 0.5
  const extentY = (print.width * sin + print.height * cos) * 0.5
  return {
    x: Math.max(0, (zone.width * 0.5 - extentX) * zone.metersPerUv * normalizer),
    y: Math.max(0, (zone.height * 0.5 - extentY) * zone.metersPerUv * normalizer),
  }
}
