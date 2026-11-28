export type SubtitleWord = {
  id: number
  text: string
  start: number
  end: number
  speaker?: string | null
  blockId?: string
}

export type SubtitleCaption = {
  id: number
  start: number
  end: number
  wordIds: number[]
}

export type SubtitleJobStatus = 'queued' | 'transcribing' | 'ready' | 'error'

export type SubtitleJob = {
  id: string
  status: SubtitleJobStatus
  progress: number
  message: string
  fileName: string
  language: string | null
  duration: number | null
  width: number | null
  height: number | null
  fps: number | null
  words: SubtitleWord[]
  captions: SubtitleCaption[]
  error: string | null
}

export type SubtitlePresetId =
  | 'viral'
  | 'clean'
  | 'punch'
  | 'neon'
  | 'karaoke'
  | 'cinema'
  | 'bubble'
  | 'focus'

export type SubtitleExportOptions = {
  preset: SubtitlePresetId
  baseColor: string
  activeColor: string
  outlineColor: string
  effectColor: string
  fontScale: number
  verticalPosition: number
  maxWords: number
  uppercase: boolean
  wordOverrides: Record<number, string>
}

export type SubtitleLocalExportStatus = 'idle' | 'checking' | 'exporting' | 'ready' | 'error'

export type SubtitleLocalExportState = {
  status: SubtitleLocalExportStatus
  progress: number
  message: string
  fileName: string | null
  error: string | null
  elapsedSeconds: number
}

export type VideoAudioMode = 'with_voice' | 'without_voice'

export type PresentationType =
  | 'influencer'
  | 'product'
  | 'direct'
  | 'lifestyle'
  | 'premium'
  | 'storytelling'
  | 'collection'

export type VoiceStyleId =
  | 'influencer'
  | 'reels'
  | 'friendly'
  | 'premium'
  | 'casual'
  | 'commercial'

export type GeminiVoiceGender = 'female' | 'male' | 'neutral' | string

export type GeminiVoice = {
  id: string
  displayName: string
  gender: GeminiVoiceGender
  languageCode: string | null
  accent: string | null
  pitch: string | null
  persona: string | null
  description: string | null
  type: string
}

export type GeminiVoiceCatalog = {
  voices: GeminiVoice[]
  cached: boolean
}

export type PresentationForm = {
  presentationType: PresentationType
  product: string
  highlights: string
  audience: string
  cta: string
  language: string
  collectionItems?: string
}

export type PresentationSegment = {
  start: number
  end: number
  purpose: string
  label?: string | null
  visibleText?: string | null
  text: string
}

export type PresentationScript = {
  title: string
  detectedProduct: string
  summary: string
  script: string
  estimatedSeconds: number
  visualNotes: string[]
  segments: PresentationSegment[]
}

export type NarrationMode = 'voice' | 'voice_and_subtitles'

export type NarrationBlock = {
  id: string
  text: string
  label: string
  visibleText?: string
  start: number
  sceneStart: number | null
  sceneEnd: number | null
  anchored: boolean
}

export type NarrationClip = { pcm: Blob; signature: string }
export type NarrationTake = NarrationClip & { id: string }

export type PresentationScriptJob = {
  id: string
  status: 'preparing' | 'analyzing' | 'writing' | 'ready' | 'error' | 'cancelled'
  message: string
  result: PresentationScript | null
  error: string | null
}

export type AiLogEvent = {
  time: string
  operation: string
  level: 'info' | 'success' | 'warning' | 'error'
  message: string
  model: string | null
  attempt: number | null
  durationMs: number | null
  error: string | null
}

export type AiLogResponse = {
  sessionId: string
  items: AiLogEvent[]
  count: number
}

export type SubtitleSavedSession = {
  version: 7
  language: string
  job: SubtitleJob | null
  wordOverrides: Record<number, string>
  preset: SubtitlePresetId
  baseColor: string
  activeColor: string
  outlineColor: string
  effectColor: string
  fontScale: number
  verticalPosition: number
  maxWords: number
  uppercase: boolean
  fileName: string | null
  presentationForm: PresentationForm
  presentationScript: PresentationScript | null
  presentationDraft: string
  generatedScriptSignature: string
  voice: string
  voiceStyle: VoiceStyleId
  generatedVoiceReady: boolean
  generatedVoiceSignature: string
  videoMode: VideoAudioMode | null
  originalAudioVolume?: number
  narrationMode?: NarrationMode
  narrationBlocks?: NarrationBlock[]
  narrationTranscriptSignature?: string
}
