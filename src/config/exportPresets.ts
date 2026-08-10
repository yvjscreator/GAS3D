import type { FormatId } from '../types/studio'

export const exportPresets: Record<FormatId, { label: string; ratio: number; width: number; height: number }> = {
  reel: { label: 'Reel / TikTok / Shorts', ratio: 9 / 16, width: 1080, height: 1920 },
  feed: { label: 'Instagram Feed', ratio: 4 / 5, width: 1080, height: 1350 },
  square: { label: 'Cuadrado', ratio: 1, width: 1080, height: 1080 },
}
