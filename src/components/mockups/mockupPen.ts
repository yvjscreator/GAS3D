import type { Point } from './mockupEngine'

/** A zone draft must never replace the garment's saved clipping silhouette. */
export function penFabricOutline(saved: Point[], draft: Point[], target: 'fabric' | 'zone', editing: boolean): Point[] {
  return editing && target === 'fabric' ? draft : saved
}
