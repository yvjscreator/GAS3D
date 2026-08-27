export interface GridCell { x: number; y: number; width: number; height: number }

export function getGridLayout(count: number): GridCell[] {
  if (count <= 1) return [{ x: 0, y: 0, width: 1, height: 1 }]
  if (count === 2) return [{ x: 0, y: 0, width: .5, height: 1 }, { x: .5, y: 0, width: .5, height: 1 }]
  if (count === 3) return [
    { x: .25, y: .5, width: .5, height: .5 },
    { x: 0, y: 0, width: .5, height: .5 },
    { x: .5, y: 0, width: .5, height: .5 },
  ]
  return [
    { x: 0, y: .5, width: .5, height: .5 }, { x: .5, y: .5, width: .5, height: .5 },
    { x: 0, y: 0, width: .5, height: .5 }, { x: .5, y: 0, width: .5, height: .5 },
  ]
}
