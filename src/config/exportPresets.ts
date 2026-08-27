import type { ExportQualityId, FormatId } from '../types/studio'

export const exportPresets: Record<FormatId, { label: string; ratio: number; width: number; height: number }> = {
  reel: { label: 'Reel / TikTok / Shorts', ratio: 9 / 16, width: 1080, height: 1920 },
  feed: { label: 'Instagram Feed', ratio: 4 / 5, width: 1080, height: 1350 },
  square: { label: 'Cuadrado', ratio: 1, width: 1080, height: 1080 },
}

export const exportQualities: Record<ExportQualityId, { label: string; scale: number; bitrate: number; detail: string }> = {
  high: { label: 'Alta', scale: 1, bitrate: 14_000_000, detail: 'Full HD' },
  ultra: { label: 'Ultra', scale: 2, bitrate: 34_000_000, detail: '4K vertical' },
}

export function getExportResolution(format: FormatId, quality: ExportQualityId) {
  const preset = exportPresets[format]
  const scale = exportQualities[quality].scale
  return { width: preset.width * scale, height: preset.height * scale }
}
