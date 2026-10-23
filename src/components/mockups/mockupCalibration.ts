import { bound, placementQuad, type Placement, type Point } from './mockupEngine'

/** Two independently measured photo-space axes. Coordinates are fractions of the photo. */
export type CalibrationAxis = 'horizontal' | 'vertical'
export type CalibrationLine = { from: Point; to: Point; cm: number }
export type PhotoCalibration = { horizontal?: CalibrationLine; vertical?: CalibrationLine }
export type PhotoSize = { width: number; height: number }

const validPoint = (p: unknown): p is Point => {
  if (!p || typeof p !== 'object') return false
  const value = p as Partial<Point>
  return typeof value.x === 'number' && Number.isFinite(value.x) && value.x >= 0 && value.x <= 1
    && typeof value.y === 'number' && Number.isFinite(value.y) && value.y >= 0 && value.y <= 1
}
const validLength = (cm: unknown): cm is number =>
  typeof cm === 'number' && Number.isFinite(cm) && cm >= .1 && cm <= 500

/** Legacy saved products have no calibration: their old placements remain untouched. */
export function restoreCalibration(raw: unknown): PhotoCalibration {
  if (!raw || typeof raw !== 'object') return {}
  const source = raw as Partial<PhotoCalibration>
  const result: PhotoCalibration = {}
  for (const axis of ['horizontal', 'vertical'] as const) {
    const line = source[axis]
    if (!line || !validPoint(line.from) || !validPoint(line.to) || !validLength(line.cm)) continue
    if (Math.abs(axis === 'horizontal' ? line.to.x - line.from.x : line.to.y - line.from.y) < .005) continue
    result[axis] = { from: { ...line.from }, to: { ...line.to }, cm: line.cm }
  }
  return result
}

/** Approximate photo pixels per physical centimeter at the marked references. */
export function photoPixelsPerCm(photo: PhotoSize, calibration: PhotoCalibration): { x: number; y: number } | null {
  const horizontal = calibration.horizontal, vertical = calibration.vertical
  if (!horizontal || !vertical || photo.width <= 0 || photo.height <= 0) return null
  const x = Math.abs(horizontal.to.x - horizontal.from.x) * photo.width / horizontal.cm
  const y = Math.abs(vertical.to.y - vertical.from.y) * photo.height / vertical.cm
  if (!Number.isFinite(x) || !Number.isFinite(y) || x <= 0 || y <= 0) return null
  return { x, y }
}

/** The print bitmap is NEVER stretched: width controls preserve its original pixel aspect ratio. */
export function printDimensionsCm(
  photo: PhotoSize, art: PhotoSize, placement: Placement, calibration: PhotoCalibration,
): { width: number; height: number } | null {
  const scale = photoPixelsPerCm(photo, calibration)
  if (!scale || art.width <= 0 || art.height <= 0) return null
  const pixelsWide = placement.width * photo.width
  return { width: pixelsWide / scale.x, height: pixelsWide * art.height / art.width / scale.y }
}

export function placementWidthForCm(
  photo: PhotoSize, art: PhotoSize, calibration: PhotoCalibration,
  axis: CalibrationAxis, centimeters: number,
): number | null {
  const scale = photoPixelsPerCm(photo, calibration)
  if (!scale || !validLength(centimeters) || art.width <= 0 || art.height <= 0) return null
  const pixelsWide = axis === 'horizontal'
    ? centimeters * scale.x
    : centimeters * scale.y * art.width / art.height
  return bound(pixelsWide / photo.width, .025, 1.5)
}

export function zoneDimensionsCm(
  photo: PhotoSize, placement: Placement, aspect: number, calibration: PhotoCalibration,
): { width: number; height: number } | null {
  const scale = photoPixelsPerCm(photo, calibration)
  if (!scale || aspect <= 0) return null
  const width = placement.width * photo.width
  return { width: width / scale.x, height: width / aspect / scale.y }
}

/** Convex polygon test includes boundary points, unlike the hit-testing helper. */
function insideConvexQuad(point: Point, quad: Point[]): boolean {
  let positive = false, negative = false
  for (let i = 0; i < 4; i++) {
    const a = quad[i], b = quad[(i + 1) % 4]
    const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x)
    if (cross > .00001) positive = true
    if (cross < -.00001) negative = true
    if (positive && negative) return false
  }
  return true
}

/** A visual warning only: placements are not clipped or destructively changed. */
export function artworkFitsZone(
  photo: PhotoSize, art: PhotoSize, print: Placement, zone: Placement, zoneAspect: number,
): boolean {
  if (!Number.isFinite(zoneAspect) || zoneAspect <= 0) return false
  const boundary = placementQuad(photo, { width: 1000, height: 1000 / zoneAspect }, zone)
  return placementQuad(photo, art, print).every(point => insideConvexQuad(point, boundary))
}
