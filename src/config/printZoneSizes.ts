import type { PrintPlacement } from '../types/studio'

export const printZoneBaseSizesCm: Record<PrintPlacement, { width: number; height: number }> = {
  frontCenter: { width: 35, height: 40 },
  frontChest: { width: 12, height: 12 },
  backCenter: { width: 40, height: 53 },
  leftSleeve: { width: 12, height: 12 },
  rightSleeve: { width: 12, height: 12 },
}

export const printSizePresetsCm = [
  { label: '12 × 12', width: 12, height: 12 },
  { label: '35 × 40', width: 35, height: 40 },
  { label: '40 × 53', width: 40, height: 53 },
]
