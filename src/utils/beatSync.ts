import type { BeatSyncSettings, BeatSyncStyle } from '../types/studio'

export const DEFAULT_BPM = 120
export const BEATS_PER_BAR = 4

export const defaultBeatSyncSettings = (): BeatSyncSettings => ({
  enabled: false,
  source: 'music',
  style: 'dynamic',
  barsPerChange: 1,
  stagger: true,
  sensitivity: 55,
  bpm: DEFAULT_BPM,
  offset: 0,
  beats: [],
  confidence: 0,
  analyzedAssetName: null,
})

export const hasBeatMap = (settings: BeatSyncSettings) => settings.enabled && Number.isFinite(settings.bpm) && settings.bpm >= 40

export function beatDuration(settings: BeatSyncSettings) {
  return 60 / Math.max(40, settings.bpm || DEFAULT_BPM)
}

export function cueDuration(settings: BeatSyncSettings) {
  return beatDuration(settings) * BEATS_PER_BAR * settings.barsPerChange
}

export function beatSequenceDuration(cueCount: number, settings: BeatSyncSettings, fallback: number) {
  if (!hasBeatMap(settings)) return fallback
  return Math.max(1, settings.offset + Math.max(1, cueCount) * cueDuration(settings))
}

export function rhythmicProgress(progress: number, style: BeatSyncStyle) {
  const value = Math.max(0, Math.min(1, progress))
  if (style === 'elegant') return value * value * value * (value * (value * 6 - 15) + 10)
  if (style === 'impact') {
    if (value < .18) return .72 * Math.pow(value / .18, 2.4)
    return .72 + .28 * (1 - Math.pow(1 - (value - .18) / .82, 3))
  }
  return value * value * (3 - 2 * value)
}

export function cueFrame(seconds: number, cueCount: number, settings: BeatSyncSettings, fallbackDuration: number) {
  if (!hasBeatMap(settings)) {
    const segment = Math.max(.1, fallbackDuration / Math.max(1, cueCount))
    const index = Math.min(cueCount - 1, Math.floor(Math.max(0, seconds) / segment))
    return { index, local: Math.max(0, Math.min(1, (seconds - index * segment) / segment)), duration: fallbackDuration }
  }
  const length = cueDuration(settings)
  const shifted = Math.max(0, seconds - settings.offset)
  const index = Math.min(cueCount - 1, Math.floor(shifted / length))
  const local = seconds < settings.offset ? 0 : Math.max(0, Math.min(1, (shifted - index * length) / length))
  return { index, local, duration: beatSequenceDuration(cueCount, settings, fallbackDuration) }
}

export function beatTimes(settings: BeatSyncSettings, duration: number) {
  if (!hasBeatMap(settings)) return []
  const period = beatDuration(settings)
  const times: number[] = []
  for (let value = Math.max(0, settings.offset); value <= duration + .001; value += period) times.push(Number(value.toFixed(4)))
  return times
}

export type BeatAnalysisResult = Pick<BeatSyncSettings, 'bpm' | 'offset' | 'beats' | 'confidence'>

type BeatAnalysisProgress = (progress: number) => void

function analyzeEnergy(energy: Float32Array, framesPerSecond: number, duration: number, sensitivity: number): BeatAnalysisResult {
  if (duration < 2 || energy.length < 2) throw new Error('El audio es demasiado corto para detectar el ritmo.')
  const frameCount = energy.length
  const onset = new Float32Array(frameCount)
  const history = Math.max(4, Math.round(framesPerSecond * .16))
  const threshold = 1.08 + (100 - sensitivity) * .0045
  for (let frame = history; frame < frameCount; frame += 1) {
    let mean = 0
    for (let index = frame - history; index < frame; index += 1) mean += energy[index]
    mean /= history
    onset[frame] = Math.max(0, energy[frame] - mean * threshold)
  }
  let bestBpm = DEFAULT_BPM
  let bestScore = -Infinity
  const scores: number[] = []
  for (let bpm = 70; bpm <= 180; bpm += .5) {
    const lag = Math.round(framesPerSecond * 60 / bpm)
    let score = 0
    for (let index = lag; index < frameCount; index += 1) score += onset[index] * onset[index - lag]
    const prior = 1 - Math.min(.18, Math.abs(bpm - 118) / 500)
    score *= prior
    scores.push(score)
    if (score > bestScore) { bestScore = score; bestBpm = bpm }
  }
  const periodFrames = framesPerSecond * 60 / bestBpm
  let bestPhase = 0
  let bestPhaseScore = -Infinity
  const phaseSteps = Math.max(1, Math.round(periodFrames))
  for (let phase = 0; phase < phaseSteps; phase += 1) {
    let score = 0
    for (let frame = phase; frame < frameCount; frame += periodFrames) {
      const center = Math.round(frame)
      score += (onset[center] ?? 0) + .55 * (onset[center - 1] ?? 0) + .55 * (onset[center + 1] ?? 0)
    }
    if (score > bestPhaseScore) { bestPhaseScore = score; bestPhase = phase }
  }
  const offset = bestPhase / framesPerSecond
  const period = 60 / bestBpm
  const beats: number[] = []
  for (let time = offset; time <= duration; time += period) beats.push(Number(time.toFixed(4)))
  const averageScore = scores.reduce((sum, score) => sum + score, 0) / Math.max(1, scores.length)
  const confidence = bestScore > 0 ? Math.max(0, Math.min(1, (bestScore - averageScore) / bestScore)) : 0
  return { bpm: Number(bestBpm.toFixed(1)), offset: Number(offset.toFixed(3)), beats, confidence: Number(confidence.toFixed(2)) }
}

function decodedAudioEnergy(audio: AudioBuffer) {
  if (!audio.length || audio.duration < 2) throw new Error('El audio es demasiado corto para detectar el ritmo.')
  const channelCount = Math.min(2, audio.numberOfChannels)
  const frameSize = 1024
  const hop = 512
  const frameCount = Math.max(1, Math.floor((audio.length - frameSize) / hop))
  const energy = new Float32Array(frameCount)
  const channels = Array.from({ length: channelCount }, (_, index) => audio.getChannelData(index))
  for (let frame = 0; frame < frameCount; frame += 1) {
    const start = frame * hop
    let sum = 0
    for (let sample = 0; sample < frameSize; sample += 4) {
      let value = 0
      for (const channel of channels) value += channel[start + sample] ?? 0
      value /= channelCount
      sum += value * value
    }
    energy[frame] = Math.sqrt(sum / (frameSize / 4))
  }
  return { energy, framesPerSecond: audio.sampleRate / hop, duration: audio.duration }
}

async function waitForMetadata(media: HTMLMediaElement) {
  if (media.readyState >= HTMLMediaElement.HAVE_METADATA) return
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('El video tardó demasiado en preparar su pista de audio.')), 15000)
    const cleanup = () => {
      window.clearTimeout(timeout)
      media.removeEventListener('loadedmetadata', handleLoaded)
      media.removeEventListener('error', handleError)
    }
    const handleLoaded = () => { cleanup(); resolve() }
    const handleError = () => { cleanup(); reject(new Error('El navegador no pudo abrir la pista de audio del video.')) }
    media.addEventListener('loadedmetadata', handleLoaded)
    media.addEventListener('error', handleError)
  })
}

async function mediaElementEnergy(blob: Blob, context: AudioContext, onProgress?: BeatAnalysisProgress) {
  // An audio element can read the audio track inside MP4/WebM without asking the
  // GPU to decode and render the video frames as well.
  const media = document.createElement('audio')
  const url = URL.createObjectURL(blob)
  media.src = url
  media.preload = 'auto'
  media.volume = 1
  media.playbackRate = 2
  media.preservesPitch = false
  let animationFrame = 0
  let timeout = 0
  let source: MediaElementAudioSourceNode | null = null
  let analyser: AnalyserNode | null = null
  let silentGain: GainNode | null = null
  try {
    await waitForMetadata(media)
    const duration = media.duration
    if (!Number.isFinite(duration) || duration < 2) throw new Error('El audio es demasiado corto para detectar el ritmo.')
    source = context.createMediaElementSource(media)
    analyser = context.createAnalyser()
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0
    silentGain = context.createGain()
    silentGain.gain.value = 0
    source.connect(analyser)
    analyser.connect(silentGain)
    silentGain.connect(context.destination)
    const samples: Array<{ time: number; energy: number }> = []
    const waveform = new Float32Array(analyser.fftSize)
    await context.resume()
    await media.play()
    onProgress?.(0)
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        window.clearTimeout(timeout)
        if (error) reject(error)
        else resolve()
      }
      const sample = () => {
        if (settled) return
        analyser?.getFloatTimeDomainData(waveform)
        let sum = 0
        for (let index = 0; index < waveform.length; index += 4) sum += waveform[index] * waveform[index]
        samples.push({ time: media.currentTime, energy: Math.sqrt(sum / (waveform.length / 4)) })
        onProgress?.(Math.min(.99, media.currentTime / duration))
        if (media.ended || media.currentTime >= duration - .02) finish()
        else animationFrame = window.requestAnimationFrame(sample)
      }
      media.addEventListener('ended', () => finish(), { once: true })
      media.addEventListener('error', () => finish(new Error('La reproducción del audio se interrumpió durante el análisis.')), { once: true })
      timeout = window.setTimeout(() => finish(new Error('El análisis de la pista de audio tardó demasiado.')), Math.max(20000, duration * 650 + 15000))
      animationFrame = window.requestAnimationFrame(sample)
    })
    if (samples.length < 8 || Math.max(...samples.map((sample) => sample.energy)) < .0001) {
      throw new Error('El video no contiene una pista de audio utilizable.')
    }
    const framesPerSecond = 30
    const energy = new Float32Array(Math.max(2, Math.ceil(duration * framesPerSecond)))
    let cursor = 0
    for (let frame = 0; frame < energy.length; frame += 1) {
      const time = frame / framesPerSecond
      while (cursor + 1 < samples.length && samples[cursor + 1].time < time) cursor += 1
      const current = samples[cursor]
      const next = samples[Math.min(cursor + 1, samples.length - 1)]
      const span = Math.max(.0001, next.time - current.time)
      const mix = Math.max(0, Math.min(1, (time - current.time) / span))
      energy[frame] = current.energy + (next.energy - current.energy) * mix
    }
    onProgress?.(1)
    return { energy, framesPerSecond, duration }
  } finally {
    window.cancelAnimationFrame(animationFrame)
    window.clearTimeout(timeout)
    media.pause()
    source?.disconnect()
    analyser?.disconnect()
    silentGain?.disconnect()
    media.removeAttribute('src')
    media.load()
    URL.revokeObjectURL(url)
  }
}

export async function analyzeBeatBlob(blob: Blob, sensitivity = 55, onProgress?: BeatAnalysisProgress): Promise<BeatAnalysisResult> {
  const AudioContextClass = window.AudioContext
  if (!AudioContextClass) throw new Error('Este navegador no permite analizar audio.')
  const context = new AudioContextClass()
  try {
    try {
      // decodeAudioData is reliable for standalone audio, but browsers are not
      // required to demux the audio track from a complete video container.
      if (blob.type.startsWith('video/') || blob.type.includes('webm')) {
        const streamed = await mediaElementEnergy(blob, context, onProgress)
        return analyzeEnergy(streamed.energy, streamed.framesPerSecond, streamed.duration, sensitivity)
      }
      const audio = await context.decodeAudioData(await blob.arrayBuffer())
      const decoded = decodedAudioEnergy(audio)
      onProgress?.(1)
      return analyzeEnergy(decoded.energy, decoded.framesPerSecond, decoded.duration, sensitivity)
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('El audio')) throw error
      if (!blob.type.startsWith('audio/')) throw error
      const streamed = await mediaElementEnergy(blob, context, onProgress)
      return analyzeEnergy(streamed.energy, streamed.framesPerSecond, streamed.duration, sensitivity)
    }
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith('El audio') || error.message.startsWith('El video') || error.message.startsWith('La reproducción') || error.message.startsWith('El análisis'))) throw error
    throw new Error('No se pudo decodificar el audio. Puedes indicar el BPM manualmente.')
  } finally {
    void context.close()
  }
}
