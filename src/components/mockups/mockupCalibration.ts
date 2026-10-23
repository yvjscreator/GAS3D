import { artworkOutline, bound, placementQuad, type Placement, type Point } from './mockupEngine'

/** Two independently measured photo-space axes. Coordinates are fractions of the photo. */
export type CalibrationAxis = 'horizontal' | 'vertical'
export type CalibrationLine = { from: Point; to: Point; cm: number }
export type PhotoCalibration = { horizontal?: CalibrationLine; vertical?: CalibrationLine }
export type PhotoSize = { width: number; height: number }
export type CalibrationDraft = { axis: CalibrationAxis; first: Point | null; second?: Point }

/** Apply an edited length or a completed new segment; incomplete marking never falls back to old points. */
export function calibrationLineToSave(saved: CalibrationLine | undefined, draft: CalibrationDraft | null, axis: CalibrationAxis, value: string): CalibrationLine | null {
  const cm = Number(value)
  const marking = draft?.axis === axis ? draft : null
  const from = marking ? marking.first : saved?.from
  const to = marking ? marking.second : saved?.to
  if (!validLength(cm) || !validPoint(from) || !validPoint(to)) return null
  if (Math.abs(axis === 'horizontal' ? to.x - from.x : to.y - from.y) < .005) return null
  return { from: { ...from }, to: { ...to }, cm }
}

/** Readable source-pixel or cm ticks, following the photo origin and zoom. */
export function rulerTicks(length:number,origin:number,pixelsPerUnit:number){
  const raw=65/pixelsPerUnit,power=10**Math.floor(Math.log10(raw))
  const step=([1,2,5,10].find(n=>n*power>=raw)??10)*power
  const first=Math.ceil(-origin/pixelsPerUnit/step)*step
  const ticks:{position:number;value:number}[]=[]
  for(let value=first;origin+value*pixelsPerUnit<length;value+=step){
    ticks.push({position:origin+value*pixelsPerUnit,value:Math.abs(value)<step/100?0:Number(value.toPrecision(8))})
    if(ticks.length>200)break
  }
  return ticks
}

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
  if ((!horizontal && !vertical) || photo.width <= 0 || photo.height <= 0) return null
  // A single known length estimates a uniform photo scale. A second axis can refine it.
  const horizontalScale = horizontal ? Math.abs(horizontal.to.x - horizontal.from.x) * photo.width / horizontal.cm : null
  const verticalScale = vertical ? Math.abs(vertical.to.y - vertical.from.y) * photo.height / vertical.cm : null
  const x = horizontalScale ?? verticalScale!
  const y = verticalScale ?? horizontalScale!
  if (!Number.isFinite(x) || !Number.isFinite(y) || x <= 0 || y <= 0) return null
  return { x, y }
}

/** Project a proportional flat print into the independently calibrated photo axes.
 * Product zones are already photo-space geometry and must not use this projection.
 */
export function projectPrintPlacement(photo: PhotoSize, placement: Placement, calibration: PhotoCalibration): Placement {
  const scale = photoPixelsPerCm(photo, calibration)
  return { ...placement, projectionY: scale ? scale.y / scale.x : 1 }
}

/** Fit the physical print's projected rectangle inside a product zone. */
export function fitPrintToZone(photo: PhotoSize, art: PhotoSize, zone: { placement: Placement; aspect: number }, calibration: PhotoCalibration): Placement {
  const projected = projectPrintPlacement(photo, zone.placement, calibration)
  const availableH = zone.placement.width * photo.width / zone.aspect
  const width = Math.min(zone.placement.width, availableH * art.width / art.height / (projected.projectionY ?? 1) / photo.width)
  return { ...projected, width: Math.max(.025, width), corners: zone.placement.corners.map(p => ({ ...p })) as Placement['corners'] }
}

/** Flat artwork dimensions, before photo projection, rotation, corner warp or sleeve curvature.
 * Independent photo axes change its projection, never its physical aspect ratio.
 */
export function printDimensionsCm(
  photo: PhotoSize, art: PhotoSize, placement: Placement, calibration: PhotoCalibration,
): { width: number; height: number } | null {
  const scale = photoPixelsPerCm(photo, calibration)
  if (!scale || art.width <= 0 || art.height <= 0) return null
  const width = placement.width * photo.width / scale.x
  return { width, height: width * art.height / art.width }
}

/** Numeric resizing keeps any previously explicit corner warp proportional. */
export function resizePrintPreservingWarp(placement: Placement, width: number): Placement {
  const ratio = width / placement.width
  return {
    ...placement,
    width,
    corners: placement.corners.map(p => ({ x: p.x * ratio, y: p.y * ratio })) as Placement['corners'],
  }
}

export function placementWidthForCm(
  photo: PhotoSize, art: PhotoSize, calibration: PhotoCalibration,
  axis: CalibrationAxis, centimeters: number,
): number | null {
  const scale = photoPixelsPerCm(photo, calibration)
  if (!scale || !validLength(centimeters) || art.width <= 0 || art.height <= 0) return null
  const pixelsWide = axis === 'horizontal'
    ? centimeters * scale.x
    : centimeters * scale.x * art.width / art.height
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
  return artworkOutline(photo, art, print).every(point => insideConvexQuad(point, boundary))
}
