import { artworkOutline, bound, placementQuad, type Placement, type Point } from './mockupEngine'

/** Saved photo-space references. One supplies a uniform scale; neither deforms artwork. */
export type CalibrationAxis = 'horizontal' | 'vertical'
export type CalibrationLine = { from: Point; to: Point; cm: number }
export type PhotoCalibration = { horizontal?: CalibrationLine; vertical?: CalibrationLine; scaleAxis?: CalibrationAxis }
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
  if ((source.scaleAxis === 'horizontal' || source.scaleAxis === 'vertical') && result[source.scaleAxis]) result.scaleAxis = source.scaleAxis
  return result
}

export function calibrationScaleAxis(calibration: PhotoCalibration): CalibrationAxis | null {
  if (calibration.scaleAxis && calibration[calibration.scaleAxis]) return calibration.scaleAxis
  return calibration.vertical ? 'vertical' : calibration.horizontal ? 'horizontal' : null
}

/** A comparison can never silently become the scale, including on old one-reference products. */
export function withCalibrationReference(calibration: PhotoCalibration, axis: CalibrationAxis, line: CalibrationLine, primary: boolean): PhotoCalibration {
  return { ...calibration, [axis]: line, scaleAxis: primary ? axis : calibrationScaleAxis(calibration) ?? axis }
}

/** Read another marked garment segment using the existing uniform scale. */
export function referenceLengthCm(photo: PhotoSize, calibration: PhotoCalibration, axis: CalibrationAxis, segment: Pick<CalibrationLine, 'from' | 'to'>): number | null {
  const scale = photoPixelsPerCm(photo, calibration)
  if (!scale) return null
  return axis === 'horizontal'
    ? Math.abs(segment.to.x - segment.from.x) * photo.width / scale.x
    : Math.abs(segment.to.y - segment.from.y) * photo.height / scale.y
}

/** Separate estimates are for comparison only, never for nonuniform artwork scaling. */
export function photoReferenceScales(photo: PhotoSize, calibration: PhotoCalibration): { horizontal: number | null; vertical: number | null } {
  const horizontal = calibration.horizontal, vertical = calibration.vertical
  return {
    horizontal: horizontal ? Math.abs(horizontal.to.x - horizontal.from.x) * photo.width / horizontal.cm : null,
    vertical: vertical ? Math.abs(vertical.to.y - vertical.from.y) * photo.height / vertical.cm : null,
  }
}

/** One reference, one pixels/cm scale for rulers, print dimensions, zones and margins. */
export function photoPixelsPerCm(photo: PhotoSize, calibration: PhotoCalibration): { x: number; y: number } | null {
  const axis = calibrationScaleAxis(calibration)
  if (!axis || photo.width <= 0 || photo.height <= 0) return null
  const scale = photoReferenceScales(photo, calibration)[axis]
  if (scale === null || !Number.isFinite(scale) || scale <= 0) return null
  return { x: scale, y: scale }
}

/** Fit without changing the source aspect, regardless of photo calibration. */
export function fitPrintToZone(photo: PhotoSize, art: PhotoSize, zone: { placement: Placement; aspect: number }): Placement {
  const availableH = zone.placement.width * photo.width / zone.aspect
  const width = Math.min(zone.placement.width, availableH * art.width / art.height / photo.width)
  return { ...zone.placement, width: Math.max(.025, width), corners: zone.placement.corners.map(p => ({ ...p })) as Placement['corners'] }
}

/** Flat artwork dimensions before rotation, explicit corner warp or sleeve curvature. */
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
