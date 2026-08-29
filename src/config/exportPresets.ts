import type { ExportQualityId, FormatId } from '../types/studio'

export const exportPresets: Record<FormatId, { label: string; ratio: number; width: number; height: number }> = {
  reel: { label: 'Reel · 9:16', ratio: 9 / 16, width: 1080, height: 1920 },
  feed: { label: 'Feed · 4:5', ratio: 4 / 5, width: 1080, height: 1350 },
  square: { label: 'Cuadrado · 1:1', ratio: 1, width: 1080, height: 1080 },
}

export const exportQualities: Record<ExportQualityId, { label: string; scale: number; bitrate: number; detail: string }> = {
  hd: { label: 'HD', scale: 1, bitrate: 14_000_000, detail: '1080 × 1920 en 9:16' },
  '2k': { label: '2K', scale: 4 / 3, bitrate: 24_000_000, detail: '1440 × 2560 en 9:16' },
  '4k': { label: '4K', scale: 2, bitrate: 45_000_000, detail: '2160 × 3840 en 9:16' },
}

export function getExportResolution(format: FormatId, quality: ExportQualityId) {
  const preset = exportPresets[format]
  const scale = exportQualities[quality].scale
  return { width: Math.round(preset.width * scale), height: Math.round(preset.height * scale) }
}
