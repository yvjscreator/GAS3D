export type SubtitleWord = {
  id: number
  text: string
  start: number
  end: number
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

export type SubtitleExportOptions = {
  baseColor: string
  activeColor: string
  outlineColor: string
  fontScale: number
  position: 'top' | 'center' | 'bottom'
  maxWords: number
  uppercase: boolean
  wordOverrides: Record<number, string>
}
