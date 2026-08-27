import type { AudioTrackSettings } from '../types/studio'

export function getMusicGain(music: AudioTrackSettings, seconds: number) {
  if (!music.url) return 0
  const local = seconds - music.start
  if (local < 0 || local > music.duration || local > music.sourceDuration) return 0
  const fadeIn = music.fadeIn > 0 ? Math.min(1, local / music.fadeIn) : 1
  const remaining = music.duration - local
  const fadeOut = music.fadeOut > 0 ? Math.min(1, remaining / music.fadeOut) : 1
  return music.volume / 100 * Math.max(0, Math.min(fadeIn, fadeOut))
}
