export type SubtitleWord = {
  id: number
  text: string
  start: number
  end: number
  speaker?: string | null
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
  fontScale: number
  position: 'top' | 'center' | 'bottom'
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

export type PresentationType =
  | 'influencer'
  | 'product'
  | 'direct'
  | 'lifestyle'
  | 'premium'
  | 'storytelling'

export type VoiceStyleId =
  | 'influencer'
  | 'reels'
  | 'friendly'
  | 'premium'
  | 'casual'
  | 'commercial'

export type PresentationForm = {
  presentationType: PresentationType
  product: string
  highlights: string
  audience: string
  cta: string
  language: string
}

export type PresentationSegment = {
  start: number
  end: number
  purpose: string
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

export type SubtitleSavedSession = {
  version: 4
  language: string
  job: SubtitleJob | null
  wordOverrides: Record<number, string>
  preset: SubtitlePresetId
  baseColor: string
  activeColor: string
  outlineColor: string
  fontScale: number
  position: SubtitleExportOptions['position']
  maxWords: number
  uppercase: boolean
  fileName: string | null
  presentationForm: PresentationForm
  presentationScript: PresentationScript | null
  presentationDraft: string
  voice: string
  voiceStyle: VoiceStyleId
  generatedVoiceReady: boolean
}
