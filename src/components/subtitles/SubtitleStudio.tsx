import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronsDown,
  ChevronsUp,
  Copy,
  Download,
  FileVideo2,
  Languages,
  LoaderCircle,
  Mic2,
  Palette,
  Play,
  RefreshCw,
  Sparkles,
  SquareTerminal,
  Upload,
  WandSparkles,
} from 'lucide-react'
import {
  clearAiLogs,
  createSubtitleJob,
  generatePresentationScript,
  generatePresentationVoice,
  getAiLogs,
  getPresentationVoices,
  getSubtitleJob,
} from './api'
import { exportSubtitledVideoLocally } from './localExporter'
import type {
  AiLogEvent,
  GeminiVoice,
  NarrationBlock,
  NarrationClip,
  NarrationMode,
  NarrationTake,
  PresentationForm,
  PresentationScript,
  SubtitleCaption,
  SubtitleJob,
  SubtitleLocalExportState,
  SubtitlePresetId,
  SubtitleSavedSession,
  SubtitleWord,
  VideoAudioMode,
  VoiceStyleId,
} from './types'
import { getSubtitlePreset, subtitlePresets } from './presets'
import {
  clearGeneratedPresentationAudio,
  clearNarrationClips,
  clearNarrationTake,
  clearSubtitleSession,
  clearSubtitleVideo,
  loadGeneratedPresentationAudio,
  loadNarrationClips,
  loadNarrationTake,
  loadSubtitleSession,
  loadSubtitleVideo,
  saveNarrationTake,
  saveSubtitleSession,
  saveSubtitleVideo,
} from './storage'
import { captionAt, clipSeconds, composeNarration, createNarrationBlocks, decodeNarrationClip, groupWords, moveNarrationWords, narrationConflicts, narrationScript, narrationTakeWav, placeNarration, splitNarration, splitNarrationTake } from './narration'
import { NarrationTimeline } from './NarrationTimeline'
import { GeminiKeySettings } from './GeminiKeySettings'
import { notify, useTaskNotice } from '../ui/notifications'
import { requestConfirmation } from '../ui/confirmation'
import './subtitleStudio.css'
import { AppLauncher } from '../navigation/AppLauncher'

const statusLabel: Record<SubtitleJob['status'], string> = {
  queued: 'En cola',
  transcribing: 'Transcribiendo',
  ready: 'Listo',
  error: 'Error',
}

type MobilePanel = 'main' | 'video' | 'voice' | 'style' | 'text' | 'transcript' | 'logs'
type PrimaryMode = 'script' | 'voice' | 'sync' | 'generate' | 'export'
type SubtitleColorTarget = 'base' | 'active' | 'outline' | 'effect'

const defaultPresentationForm = (): PresentationForm => ({
  presentationType: 'influencer',
  product: '',
  highlights: '',
  audience: '',
  cta: '',
  language: 'es-LATAM',
})

const emptyExportState = (): SubtitleLocalExportState => ({
  status: 'idle',
  progress: 0,
  message: '',
  fileName: null,
  error: null,
  elapsedSeconds: 0,
})


const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const hexToHsv = (hex: string) => {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  let h = 0

  if (delta) {
    if (max === r) h = 60 * (((g - b) / delta) % 6)
    else if (max === g) h = 60 * ((b - r) / delta + 2)
    else h = 60 * ((r - g) / delta + 4)
  }
  if (h < 0) h += 360

  return {
    h,
    s: max === 0 ? 0 : delta / max,
    v: max,
  }
}

const hsvToHex = (h: number, s: number, v: number) => {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0
  let g = 0
  let b = 0

  if (h < 60) [r, g] = [c, x]
  else if (h < 120) [r, g] = [x, c]
  else if (h < 180) [g, b] = [c, x]
  else if (h < 240) [g, b] = [x, c]
  else if (h < 300) [r, b] = [x, c]
  else [r, b] = [c, x]

  const toHex = (value: number) => Math.round((value + m) * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase()
}

const quickColors = [
  '#FFFFFF', '#000000', '#FFE347', '#FF7A45',
  '#FF58D6', '#8B35FF', '#6EFFA8', '#32D7FF',
  '#1D7CFF', '#FF3344', '#FF8C00', '#9AA4B2',
]

const formatTime = (seconds: number) => {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  const minutes = Math.floor(safe / 60)
  const rest = safe - minutes * 60
  return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`
}

const transcriptionLanguage = (locale: string) => {
  if (locale.startsWith('es')) return 'es'
  if (locale.startsWith('en')) return 'en'
  if (locale.startsWith('pt')) return 'pt'
  return 'auto'
}

const presentationSignature = (form: PresentationForm) => JSON.stringify([
  form.presentationType,
  form.product.trim(),
  form.highlights.trim(),
  form.audience.trim(),
  form.cta.trim(),
  form.language,
  ...(form.collectionItems?.trim() ? [form.collectionItems.trim()] : []),
])

const voiceSignature = (script: string, voice: string, style: VoiceStyleId, language: string) =>
  [script.trim(), voice, style, language].join('|')

const presentationTypes = [
  ['influencer', 'Influencer / UGC'],
  ['product', 'Presentación de producto'],
  ['collection', 'Presentador de colección'],
  ['direct', 'Venta directa'],
  ['lifestyle', 'Lifestyle'],
  ['premium', 'Premium'],
  ['storytelling', 'Storytelling'],
] as const

const voiceStyles: Array<[VoiceStyleId, string]> = [
  ['influencer', 'Influencer natural'],
  ['reels', 'Energético para Reels'],
  ['friendly', 'Vendedor amigable'],
  ['premium', 'Premium / elegante'],
  ['casual', 'Casual'],
  ['commercial', 'Locutor comercial'],
]

export function SubtitleStudio() {
  const mobileVideoRef = useRef<HTMLVideoElement | null>(null)
  const desktopVideoRef = useRef<HTMLVideoElement | null>(null)
  const generatedAudioRef = useRef<HTMLAudioElement | null>(null)
  const restoredRef = useRef(false)
  const aiRequestRef = useRef<AbortController | null>(null)
  const blockTextRef = useRef<HTMLTextAreaElement>(null)
  const exportStartedAtRef = useRef<number | null>(null)
  const subtitlePointersRef = useRef(new Map<number, { x: number; y: number }>())
  const subtitleGestureRef = useRef<{
    mode: 'drag' | 'pinch'
    startY: number
    startPosition: number
    startDistance: number
    startScale: number
  } | null>(null)

  const [file, setFile] = useState<File | null>(null)
  const [savedFileName, setSavedFileName] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [generatedAudio, setGeneratedAudio] = useState<Blob | null>(null)
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null)
  const [mediaDuration, setMediaDuration] = useState(0)
  const [videoAspectRatio, setVideoAspectRatio] = useState<number | null>(null)
  const [previewVideoHeight, setPreviewVideoHeight] = useState(0)
  const [language, setLanguage] = useState('auto')
  const [videoMode, setVideoMode] = useState<VideoAudioMode | null>(null)
  const [job, setJob] = useState<SubtitleJob | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [aiBusy, setAiBusy] = useState<'script' | 'voice' | null>(null)
  const [aiStage, setAiStage] = useState('')
  const [restoring, setRestoring] = useState(true)
  const [hydrated, setHydrated] = useState(false)
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('main')
  const [mobilePanelCollapsed, setMobilePanelCollapsed] = useState(false)
  const [colorEditorTarget, setColorEditorTarget] = useState<SubtitleColorTarget | null>(null)
  const [colorHue, setColorHue] = useState(280)
  const [colorSaturation, setColorSaturation] = useState(0.8)
  const [colorValue, setColorValue] = useState(0.9)
  const [voiceRenderLimit, setVoiceRenderLimit] = useState(20)
  const [error, setError] = useState<string | null>(null)
  const [storageNotice, setStorageNotice] = useState<string | null>(null)
  const [wordOverrides, setWordOverrides] = useState<Record<number, string>>({})
  const [editingWordId, setEditingWordId] = useState<number | null>(null)
  const [localExport, setLocalExport] = useState<SubtitleLocalExportState>(emptyExportState)
  const [preset, setPreset] = useState<SubtitlePresetId>('viral')
  const [baseColor, setBaseColor] = useState('#FFFFFF')
  const [activeColor, setActiveColor] = useState('#FFE347')
  const [outlineColor, setOutlineColor] = useState('#000000')
  const [effectColor, setEffectColor] = useState('#FFE347')
  const [fontScale, setFontScale] = useState(6)
  const [verticalPosition, setVerticalPosition] = useState(0.82)
  const [maxWords, setMaxWords] = useState(5)
  const [uppercase, setUppercase] = useState(false)

  const [presentationForm, setPresentationForm] = useState<PresentationForm>(defaultPresentationForm)
  const [presentationScript, setPresentationScript] = useState<PresentationScript | null>(null)
  const [presentationDraft, setPresentationDraft] = useState('')
  const [generatedScriptSignature, setGeneratedScriptSignature] = useState('')
  const [voice, setVoice] = useState('Sulafat')
  const [voiceCatalog, setVoiceCatalog] = useState<GeminiVoice[]>([])
  const [voiceCatalogLoading, setVoiceCatalogLoading] = useState(false)
  const [voiceCatalogError, setVoiceCatalogError] = useState<string | null>(null)
  const [voiceCatalogRequest, setVoiceCatalogRequest] = useState(0)
  const [voiceGenderFilter, setVoiceGenderFilter] = useState<'all' | 'female' | 'male' | 'neutral'>('all')
  const [voiceStyle, setVoiceStyle] = useState<VoiceStyleId>('influencer')
  const [generatedVoiceSignature, setGeneratedVoiceSignature] = useState('')
  const [narrationMode, setNarrationMode] = useState<NarrationMode>('voice_and_subtitles')
  const [blocks, setBlocks] = useState<NarrationBlock[]>([])
  const [legacyClips, setLegacyClips] = useState<Record<string, NarrationClip>>({})
  const [take, setTake] = useState<NarrationTake | null>(null)
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [focusPhrase, setFocusPhrase] = useState(false)
  const [transcriptSignature, setTranscriptSignature] = useState('')
  const [narrationUrl, setNarrationUrl] = useState<string | null>(null)
  useTaskNotice(aiBusy !== null, aiStage || (aiBusy === 'script' ? 'Preparando guion…' : 'Preparando voz…'))
  useEffect(() => () => aiRequestRef.current?.abort(), [])
  useEffect(() => {
    if (!focusPhrase || mobilePanel !== 'voice' || mobilePanelCollapsed) return
    const frame = requestAnimationFrame(() => {
      const editor = blockTextRef.current
      editor?.scrollIntoView({ block: 'center', behavior: 'instant' })
      editor?.focus({ preventScroll: true })
      setFocusPhrase(false)
    })
    return () => cancelAnimationFrame(frame)
  }, [focusPhrase, mobilePanel, mobilePanelCollapsed])

  const [aiLogs, setAiLogs] = useState<AiLogEvent[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsCopied, setLogsCopied] = useState(false)
  const [clientAiLogs, setClientAiLogs] = useState<string[]>([])

  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 720px)').matches)

  const openMobilePanel = (panel: Exclude<MobilePanel, 'main'>) => {
    setMobilePanelCollapsed(false)
    if (panel !== 'text') setColorEditorTarget(null)
    if (panel === 'voice') {
      setVoiceRenderLimit(8)
      requestAnimationFrame(() => {
        window.setTimeout(() => setVoiceRenderLimit(20), 220)
      })
    }
    setMobilePanel(panel)
  }

  const closeMobilePanel = () => {
    setMobilePanelCollapsed(false)
    setColorEditorTarget(null)
    setMobilePanel('main')
  }

  useEffect(() => {
    const media = window.matchMedia('(max-width: 720px)')
    const sync = () => setIsMobile(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  const appendClientLog = useCallback((message: string) => {
    const line = `[${new Date().toISOString()}] ${message}`
    setClientAiLogs((current) => [...current.slice(-79), line])
  }, [])

  const refreshLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      const response = await getAiLogs()
      setAiLogs(response.items)
    } catch (cause) {
      appendClientLog(`No se pudieron recuperar logs del servidor: ${cause instanceof Error ? cause.message : String(cause)}`)
    } finally {
      setLogsLoading(false)
    }
  }, [appendClientLog])

  useEffect(() => {
    if (videoMode !== 'without_voice' || voiceCatalog.length) return

    let current = true
    setVoiceCatalogLoading(true)
    setVoiceCatalogError(null)

    void getPresentationVoices()
      .then((response) => {
        if (!current) return
        setVoiceCatalog(response.voices)
        appendClientLog(`Catálogo de voces cargado · ${response.voices.length} voces.`)
      })
      .catch((cause) => {
        if (!current) return
        const message = cause instanceof Error ? cause.message : 'No se pudo cargar el catálogo de voces.'
        setVoiceCatalogError(message)
        appendClientLog(`Error cargando voces: ${message}`)
      })
      .finally(() => {
        if (current) setVoiceCatalogLoading(false)
      })
    return () => { current = false }
  }, [videoMode, voiceCatalog.length, voiceCatalogRequest, appendClientLog])

  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true

    const restore = async () => {
      const saved = loadSubtitleSession()
      if (saved) {
        setSavedFileName(saved.fileName)
        setLanguage(saved.language)
        setVideoMode(saved.videoMode)
        setJob(saved.job)
        setWordOverrides(saved.wordOverrides ?? {})
        setPreset(saved.preset)
        setBaseColor(saved.baseColor)
        setActiveColor(saved.activeColor)
        setOutlineColor(saved.outlineColor)
        setEffectColor(saved.effectColor)
        setFontScale(saved.fontScale)
        setVerticalPosition(saved.verticalPosition)
        setMaxWords(saved.maxWords)
        setUppercase(saved.uppercase)
        setPresentationForm(saved.presentationForm ?? defaultPresentationForm())
        setPresentationScript(saved.presentationScript)
        setPresentationDraft(saved.presentationDraft ?? '')
        setGeneratedScriptSignature(saved.generatedScriptSignature ?? '')
        setVoice(saved.voice || 'Sulafat')
        setVoiceStyle(saved.voiceStyle || 'influencer')
        setGeneratedVoiceSignature(saved.generatedVoiceSignature ?? '')
        setNarrationMode(saved.narrationMode ?? 'voice_and_subtitles')
        setBlocks(saved.narrationBlocks ?? [])
        setTranscriptSignature(saved.narrationTranscriptSignature ?? '')
      }

      try {
        const [restoredVideo, restoredAudio, restoredClips, restoredTake] = await Promise.all([
          loadSubtitleVideo(),
          loadGeneratedPresentationAudio(),
          loadNarrationClips().catch(() => ({})),
          loadNarrationTake().catch(() => null),
        ])

        if (restoredVideo) {
          setFile(restoredVideo)
          setVideoUrl(URL.createObjectURL(restoredVideo))
          setStorageNotice('Proyecto restaurado automáticamente.')
        } else if (saved?.fileName) {
          setStorageNotice('Se restauró el proyecto. Vuelve a seleccionar el mismo video para previsualizar o exportar.')
        }

        setLegacyClips(restoredClips)
        setTake(restoredTake)
        if (restoredAudio) {
          setGeneratedAudio(restoredAudio)
          setGeneratedAudioUrl(URL.createObjectURL(restoredAudio))
        }
      } catch {
        if (saved?.fileName) setStorageNotice('Se restauró el proyecto, pero el navegador no conservó todos los archivos locales.')
      } finally {
        setRestoring(false)
        setHydrated(true)
      }
    }

    void restore()
  }, [])

  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl) }, [videoUrl])
  useEffect(() => () => { if (generatedAudioUrl) URL.revokeObjectURL(generatedAudioUrl) }, [generatedAudioUrl])

  useEffect(() => {
    if (!hydrated) return
    const session: SubtitleSavedSession = {
      version: 7,
      language,
      job,
      wordOverrides,
      preset,
      baseColor,
      activeColor,
      outlineColor,
      effectColor,
      fontScale,
      verticalPosition,
      maxWords,
      uppercase,
      fileName: file?.name ?? savedFileName,
      presentationForm,
      presentationScript,
      presentationDraft,
      generatedScriptSignature,
      voice,
      voiceStyle,
      generatedVoiceReady: Boolean(generatedAudio),
      generatedVoiceSignature,
      videoMode,
      narrationMode,
      narrationBlocks: blocks,
      narrationTranscriptSignature: transcriptSignature,
    }
    saveSubtitleSession(session)
  }, [
    hydrated,
    language,
    job,
    wordOverrides,
    preset,
    baseColor,
    activeColor,
    outlineColor,
    effectColor,
    fontScale,
    verticalPosition,
    maxWords,
    uppercase,
    file?.name,
    savedFileName,
    presentationForm,
    presentationScript,
    presentationDraft,
    generatedScriptSignature,
    voice,
    voiceStyle,
    generatedAudio,
    generatedVoiceSignature,
    videoMode,
    narrationMode,
    blocks,
    transcriptSignature,
  ])

  const pendingTranscriptId = job && ['queued', 'transcribing'].includes(job.status) ? job.id : null
  useEffect(() => {
    if (!pendingTranscriptId) return
    let disposed = false
    let timer: number | undefined
    const deadline = performance.now() + 240_000
    const poll = async () => {
      try {
        if (performance.now() >= deadline) throw new Error('La transcripción tardó demasiado. Puedes reintentar los subtítulos.')
        const next = await getSubtitleJob(pendingTranscriptId)
        if (disposed) return
        setJob(next)
        if (next.status === 'error') setError(next.error ?? next.message)
        if (next.status === 'ready' || next.status === 'error') void refreshLogs()
        else timer = window.setTimeout(() => void poll(), 1200)
      } catch (cause) {
        if (disposed) return
        const message = cause instanceof Error ? cause.message : 'No se pudo consultar la transcripción.'
        setJob((current) => current?.id === pendingTranscriptId ? { ...current, status: 'error', error: message } : current)
        setError(message)
      }
    }
    timer = window.setTimeout(() => void poll(), 1200)
    return () => { disposed = true; window.clearTimeout(timer) }
  }, [pendingTranscriptId, refreshLogs])

  useEffect(() => {
    if (!playing) return
    let frame = 0
    const tick = () => {
      const video = isMobile ? mobileVideoRef.current : desktopVideoRef.current
      if (video) setCurrentTime(video.currentTime)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, isMobile])

  useEffect(() => {
    const video = isMobile ? mobileVideoRef.current : desktopVideoRef.current
    if (!video) return

    const sync = () => setPreviewVideoHeight(video.getBoundingClientRect().height)
    sync()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', sync)
      return () => window.removeEventListener('resize', sync)
    }

    const observer = new ResizeObserver(sync)
    observer.observe(video)
    return () => observer.disconnect()
  }, [videoUrl, isMobile, mobilePanel])

  const isNarrating = videoMode === 'without_voice'
  const showSubtitles = !isNarrating || narrationMode === 'voice_and_subtitles'
  const currentVoiceSignature = voiceSignature(presentationDraft, voice, voiceStyle, presentationForm.language)
  const fullScript = narrationScript(blocks.length ? blocks : [{ text: presentationDraft }])
  const takeSignature = voiceSignature(fullScript, voice, voiceStyle, presentationForm.language)
  const currentTake = take?.signature === takeSignature ? take : null
  const takeWords = currentTake && transcriptSignature === currentTake.id && job?.status === 'ready' ? job.words : null
  const takeAlignment = useMemo(() => currentTake && takeWords ? splitNarrationTake(currentTake, blocks, takeWords) : null, [blocks, currentTake, takeWords])
  const usableClips = useMemo(() => {
    if (take) return Object.fromEntries((takeAlignment?.source ?? []).map(({ block, clip }) => [block.id, clip]))
    return Object.fromEntries(blocks.flatMap((block) => {
      const clip = legacyClips[block.id]
      return clip?.signature === voiceSignature(block.text, voice, voiceStyle, presentationForm.language) ? [[block.id, clip]] : []
    }))
  }, [blocks, legacyClips, presentationForm.language, take, takeAlignment, voice, voiceStyle])
  const timelineBlocks = useMemo(() => takeAlignment ? blocks.map((block, index) => {
    const start = takeAlignment.source[index]?.start
    return block.anchored || start === undefined ? block : { ...block, start }
  }) : blocks, [blocks, takeAlignment])
  const placed = useMemo(() => placeNarration(timelineBlocks, usableClips), [timelineBlocks, usableClips])
  const packed = useMemo(() => take ? [] : placeNarration(blocks, usableClips, true), [blocks, take, usableClips])
  const sourcePlacements = takeAlignment?.source ?? packed
  const packedSignature = JSON.stringify(packed.map(({ block, clip }) => [block.id, clip.signature, clip.pcm.size]))
  const narrationReady = Boolean(blocks.length && placed.length === blocks.length && blocks.every((block) => block.text.trim()))
  const conflicts = useMemo(() => narrationConflicts(placed, mediaDuration), [placed, mediaDuration])
  const blockingTiming = Boolean(conflicts.overlaps.size || conflicts.outside.size)
  const timedNarration = useMemo(() => narrationReady && !blockingTiming ? composeNarration(placed) : null, [narrationReady, blockingTiming, placed])
  const activeAudio = blocks.length ? timedNarration : generatedAudio
  const activeAudioUrl = blocks.length ? narrationUrl : generatedAudioUrl
  useEffect(() => {
    if (!timedNarration) { setNarrationUrl(null); return }
    const url = URL.createObjectURL(timedNarration)
    setNarrationUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [timedNarration])
  const subtitlesCurrent = isNarrating
    ? job?.status === 'ready' && (blocks.length ? narrationReady && transcriptSignature === (currentTake?.id ?? packedSignature) : Boolean(activeAudio && generatedVoiceSignature === currentVoiceSignature))
    : job?.status === 'ready' && (job.language ?? 'auto') === language
  const readyWords = useMemo(() => {
    if (!showSubtitles || !subtitlesCurrent || !job) return []
    return isNarrating && blocks.length ? moveNarrationWords(job.words, sourcePlacements, placed) : job.words
  }, [showSubtitles, subtitlesCurrent, job, isNarrating, blocks.length, sourcePlacements, placed])
  const captions = useMemo(() => groupWords(readyWords, maxWords), [readyWords, maxWords])
  const wordsById = useMemo(() => new Map(readyWords.map((word) => [word.id, word])), [readyWords])

  const orderedVoices = useMemo(() => {
    const locale = presentationForm.language.toLowerCase()
    const language = locale.split('-')[0]

    return [...voiceCatalog].sort((left, right) => {
      if (left.id === voice && right.id !== voice) return -1
      if (right.id === voice && left.id !== voice) return 1

      const leftLanguage = (left.languageCode ?? '').toLowerCase()
      const rightLanguage = (right.languageCode ?? '').toLowerCase()
      const leftMatches = leftLanguage === locale || leftLanguage.startsWith(`${language}-`)
      const rightMatches = rightLanguage === locale || rightLanguage.startsWith(`${language}-`)
      if (leftMatches !== rightMatches) return leftMatches ? -1 : 1

      return left.displayName.localeCompare(right.displayName)
    })
  }, [voiceCatalog, presentationForm.language, voice])

  const visibleVoices = useMemo(
    () => voiceGenderFilter === 'all'
      ? orderedVoices
      : orderedVoices.filter((item) => item.gender === voiceGenderFilter),
    [orderedVoices, voiceGenderFilter],
  )

  useEffect(() => {
    setVoiceRenderLimit(20)
  }, [voiceGenderFilter, presentationForm.language])

  const renderedVoices = visibleVoices.slice(0, voiceRenderLimit)

  const voiceGenderIcon = (gender: string) => gender === 'female' ? '♀' : gender === 'male' ? '♂' : '◉'
  const voiceGenderLabel = (gender: string) => gender === 'female' ? 'Femenina' : gender === 'male' ? 'Masculina' : 'Neutra'

  const activeCaption = captionAt(captions, currentTime)

  const activeWordId = activeCaption?.wordIds.find((id, index, ids) => {
    const word = wordsById.get(id)
    const next = wordsById.get(ids[index + 1])
    if (!word) return false
    const boundary = next?.start ?? activeCaption.end + 0.25
    return currentTime >= word.start - 0.03 && currentTime < boundary
  }) ?? activeCaption?.wordIds.at(-1) ?? null

  const duration = isNarrating ? (mediaDuration || (!blocks.length ? job?.duration ?? 0 : 0)) : Math.max(job?.duration ?? 0, mediaDuration)
  const transcribing = Boolean(pendingTranscriptId)
  const separatingTake = Boolean(currentTake && transcriptSignature === currentTake.id && transcribing)
  useTaskNotice(separatingTake, 'Identificando los cortes en la toma completa…')
  const exporting = localExport.status === 'checking' || localExport.status === 'exporting'
  const generatedLanguage = job?.language ?? 'auto'
  const voiceIsFresh = blocks.length ? narrationReady : Boolean(generatedAudio && generatedVoiceSignature === currentVoiceSignature)
  const primaryMode: PrimaryMode = isNarrating
    ? !presentationDraft.trim() && blocks.length === 0 ? 'script'
      : currentTake && !narrationReady ? 'sync'
        : !voiceIsFresh ? 'voice'
          : showSubtitles && !subtitlesCurrent ? 'sync' : 'export'
    : subtitlesCurrent ? 'export' : 'generate'
  const selectedBlock = blocks.find((block) => block.id === selectedBlockId) ?? blocks[0]

  const resetGeneratedVoice = async () => {
    setBlocks([])
    setLegacyClips({})
    setTake(null)
    setSelectedBlockId(null)
    setTranscriptSignature('')
    setGeneratedAudio(null)
    setGeneratedVoiceSignature('')
    if (generatedAudioUrl) URL.revokeObjectURL(generatedAudioUrl)
    setGeneratedAudioUrl(null)
    setJob(null)
    setWordOverrides({})
    try {
      await Promise.all([clearGeneratedPresentationAudio(), clearNarrationClips(), clearNarrationTake()])
    } catch {
      // Best effort.
    }
  }

  const chooseFile = async (nextFile: File | null, mode: VideoAudioMode) => {
    if (!nextFile || aiRequestRef.current || aiBusy || exporting) return

    const reattachingRestoredVideo = !file && mode === videoMode && nextFile.name === savedFileName

    setError(null)
    setStorageNotice(null)
    setLocalExport(emptyExportState())
    setEditingWordId(null)
    setCurrentTime(0)
    setMediaDuration(0)
    setVideoAspectRatio(null)
    setVideoMode(mode)

    if (!reattachingRestoredVideo) {
      setJob(null)
      setWordOverrides({})
      setPresentationScript(null)
      setPresentationDraft('')
      setGeneratedScriptSignature('')
      await resetGeneratedVoice()
    }

    if (videoUrl) URL.revokeObjectURL(videoUrl)
    setFile(nextFile)
    setSavedFileName(nextFile.name)
    setVideoUrl(URL.createObjectURL(nextFile))

    try {
      await saveSubtitleVideo(nextFile)
      setStorageNotice('Video guardado en este dispositivo para recuperar el proyecto.')
    } catch {
      setStorageNotice('El navegador no pudo guardar una copia local del video. El resto del proyecto sí se conservará.')
    }

    openMobilePanel(mode === 'without_voice' ? 'voice' : 'video')
  }

  const startTranscription = async (sourceFile = file, selectedLanguage = language) => {
    if (!sourceFile) {
      setError('Selecciona un video antes de generar los subtítulos.')
      openMobilePanel('video')
      return
    }

    setError(null)
    setUploading(true)
    setLocalExport(emptyExportState())
    setEditingWordId(null)
    appendClientLog(`Iniciando transcripción · idioma ${selectedLanguage}`)

    try {
      const nextJob = await createSubtitleJob(sourceFile, selectedLanguage)
      setJob(nextJob)
      setWordOverrides({})
      closeMobilePanel()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'No se pudo iniciar la transcripción.'
      setError(message)
      appendClientLog(`Error iniciando transcripción: ${message}`)
      void refreshLogs()
    } finally {
      setUploading(false)
    }
  }

  const createAiScript = async (alignDraft = false) => {
    if (!file || aiRequestRef.current) return
    if (!alignDraft && (blocks.length || presentationDraft.trim()) && !await requestConfirmation({
      title: 'Generar otro guion', description: 'El nuevo guion reemplazará las frases y los tiempos del borrador cuando esté listo.', accept: 'Generar guion',
    })) return
    const phrases = alignDraft ? (blocks.length ? blocks.map((block) => block.text.trim()) : splitNarration(presentationDraft, presentationForm.language)) : []
    if (alignDraft && (!phrases.length || phrases.some((phrase) => !phrase))) {
      setError('Escribe el guion o completa el texto de todas las frases.')
      return
    }
    const request = new AbortController()
    aiRequestRef.current = request
    setError(null)
    setAiStage('Subiendo video…')
    setAiBusy('script')
    appendClientLog('Iniciando análisis visual y generación de guion.')

    try {
      const result = await generatePresentationScript(file, presentationForm, { phrases, signal: request.signal, onStage: setAiStage })
      request.signal.throwIfAborted()
      const timed = createNarrationBlocks(result.segments.map((item) => item.text), result.segments)
      if (alignDraft && blocks.length) timed.forEach((block, index) => Object.assign(block, {
        id: blocks[index].id, text: blocks[index].text, label: blocks[index].label || block.label,
        visibleText: block.visibleText || blocks[index].visibleText,
      }))
      else await resetGeneratedVoice()
      request.signal.throwIfAborted()
      setPresentationScript(result)
      setPresentationDraft(alignDraft ? phrases.join('\n') : result.script)
      setGeneratedScriptSignature(presentationSignature(presentationForm))
      setBlocks(timed)
      setSelectedBlockId(timed[0]?.id ?? null)
      openMobilePanel('voice')
      notify('success', alignDraft ? 'Frases ubicadas en el video.' : 'Guion listo para revisar.')
      appendClientLog('Guion generado correctamente.')
    } catch (cause) {
      if (!request.signal.aborted) {
        const message = cause instanceof Error ? cause.message : 'No se pudo generar el guion.'
        setError(message)
        appendClientLog(`Error generando guion: ${message}`)
      }
    } finally {
      aiRequestRef.current = null
      setAiBusy(null)
      void refreshLogs()
    }
  }

  const syncNarration = async (audio: Blob, signature: string, signal?: AbortSignal) => {
    const audioFile = new File([audio], 'presentacion-gemini.wav', { type: 'audio/wav' })
    const nextJob = await createSubtitleJob(audioFile, transcriptionLanguage(presentationForm.language), signal)
    signal?.throwIfAborted()
    setJob(nextJob)
    setTranscriptSignature(signature)
    setWordOverrides({})
  }

  const syncExistingVoice = async () => {
    const audio = currentTake ? narrationTakeWav(currentTake) : blocks.length ? composeNarration(packed) : generatedAudio
    if (!audio || (!currentTake && !voiceIsFresh) || aiRequestRef.current) return
    const request = new AbortController()
    aiRequestRef.current = request
    setError(null)
    setAiStage(currentTake ? 'Transcribiendo la toma para ubicar las frases…' : 'Sincronizando subtítulos…')
    setAiBusy('voice')
    try {
      await syncNarration(audio, currentTake?.id ?? (blocks.length ? packedSignature : ''), request.signal)
    } catch (cause) {
      if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : 'No se pudo sincronizar la voz.')
    } finally {
      aiRequestRef.current = null
      setAiBusy(null)
    }
  }

  const createAiVoice = async () => {
    if (aiRequestRef.current) return
    const nextBlocks = blocks.length ? blocks : createNarrationBlocks(splitNarration(presentationDraft, presentationForm.language))
    const script = narrationScript(nextBlocks)
    if (!nextBlocks.length || nextBlocks.length > 60 || nextBlocks.some((block) => !block.text.trim()) || Array.from(script).length > 12_000) {
      setError('Completa las frases. Una toma admite hasta 60 bloques y 12.000 caracteres.')
      openMobilePanel('voice')
      return
    }

    const request = new AbortController()
    aiRequestRef.current = request
    setError(null)
    setAiStage('Generando la narración completa…')
    setAiBusy('voice')
    setBlocks(nextBlocks)
    setSelectedBlockId((current) => current ?? nextBlocks[0].id)
    try {
      const signature = voiceSignature(script, voice, voiceStyle, presentationForm.language)
      const result = await generatePresentationVoice(script, voice, voiceStyle, presentationForm.language, request.signal)
      const recording = { ...await decodeNarrationClip(result.blob, signature), id: crypto.randomUUID() }
      request.signal.throwIfAborted()
      try {
        await saveNarrationTake(recording)
      } catch {
        setStorageNotice('La toma funciona en esta sesión, pero el navegador no pudo guardarla.')
      }
      request.signal.throwIfAborted()
      setTake(recording)
      setJob(null)
      setTranscriptSignature('')
      setAiStage('Transcribiendo la toma para ubicar las frases…')
      await syncNarration(narrationTakeWav(recording), recording.id, request.signal)
      if (isMobile) closeMobilePanel()
    } catch (cause) {
      if (!request.signal.aborted) {
        const message = cause instanceof Error ? cause.message : 'No se pudo preparar la toma.'
        setError(message)
        appendClientLog(`Error preparando la toma: ${message}`)
      }
    } finally {
      aiRequestRef.current = null
      setAiBusy(null)
      void refreshLogs()
    }
  }

  const changeBlocks = (next: NarrationBlock[]) => {
    setBlocks(next)
    setPresentationDraft(next.map((block) => block.text).join('\n'))
  }

  const updateBlock = (id: string, patch: Partial<NarrationBlock>) => {
    const next = blocks.map((block) => block.id === id ? { ...block, ...patch } : block)
    if ('text' in patch) changeBlocks(next)
    else setBlocks(next)
  }

  const prepareManualBlocks = () => {
    const phrases = splitNarration(presentationDraft, presentationForm.language)
    if (!phrases.length || phrases.length > 60) { setError('Escribe entre 1 y 60 frases para crear los bloques.'); return }
    setError(null)
    const next = createNarrationBlocks(phrases)
    changeBlocks(next)
    setSelectedBlockId(next[0].id)
  }

  const splitSelected = () => {
    if (!selectedBlock || blocks.length >= 60) return
    const index = blocks.indexOf(selectedBlock)
    const cursor = blockTextRef.current?.selectionStart ?? 0
    const left = selectedBlock.text.slice(0, cursor).trim()
    const right = selectedBlock.text.slice(cursor).trim()
    if (!left || !right) { notify('info', 'Coloca el cursor donde quieres dividir la frase.'); return }
    const next = { ...selectedBlock, id: crypto.randomUUID(), text: right, start: selectedBlock.start + left.split(/\s+/).length / 2.35 }
    const updated = [...blocks.slice(0, index), { ...selectedBlock, text: left }, next, ...blocks.slice(index + 1)]
    if (selectedBlock.anchored && currentTake && takeWords) {
      const separated = splitNarrationTake(currentTake, updated, takeWords).source
      if (separated[index + 1]) next.start = selectedBlock.start + separated[index + 1].start - separated[index].start
    }
    changeBlocks(updated)
    setSelectedBlockId(next.id)
  }

  const joinSelected = () => {
    if (!selectedBlock) return
    const index = blocks.indexOf(selectedBlock)
    const next = blocks[index + 1]
    if (!next) return
    changeBlocks([...blocks.slice(0, index), { ...selectedBlock, text: `${selectedBlock.text.trim()} ${next.text.trim()}`, sceneEnd: next.sceneEnd ?? selectedBlock.sceneEnd }, ...blocks.slice(index + 2)])
  }

  const resetProject = async () => {
    if (!await requestConfirmation({ title: 'Nuevo proyecto', description: 'Se quitarán el video, el guion y la voz de este proyecto en el navegador.', accept: 'Nuevo proyecto', destructive: true })) return
    setError(null)
    setStorageNotice(null)
    setJob(null)
    setWordOverrides({})
    setEditingWordId(null)
    setLocalExport(emptyExportState())
    setFile(null)
    setSavedFileName(null)
    setVideoMode(null)
    setCurrentTime(0)
    setMediaDuration(0)
    setVideoAspectRatio(null)
    setPresentationForm(defaultPresentationForm())
    setPresentationScript(null)
    setPresentationDraft('')
    setGeneratedScriptSignature('')
    setVoice('Sulafat')
    setVoiceStyle('influencer')
    setGeneratedAudio(null)
    setGeneratedVoiceSignature('')
    setNarrationMode('voice_and_subtitles')
    setBlocks([])
    setLegacyClips({})
    setTake(null)
    setSelectedBlockId(null)
    setTranscriptSignature('')

    if (videoUrl) URL.revokeObjectURL(videoUrl)
    if (generatedAudioUrl) URL.revokeObjectURL(generatedAudioUrl)
    setVideoUrl(null)
    setGeneratedAudioUrl(null)
    clearSubtitleSession()

    try {
      await Promise.all([clearSubtitleVideo(), clearGeneratedPresentationAudio(), clearNarrationClips(), clearNarrationTake()])
    } catch {
      // Best effort.
    }
  }

  const applyPreset = (id: SubtitlePresetId) => {
    const selected = getSubtitlePreset(id)
    setPreset(id)
    setBaseColor(selected.options.baseColor)
    setActiveColor(selected.options.activeColor)
    setOutlineColor(selected.options.outlineColor)
    setEffectColor(selected.options.effectColor)
    setFontScale(selected.options.fontScale)
    setVerticalPosition(selected.options.verticalPosition)
    setMaxWords(selected.options.maxWords)
    setUppercase(selected.options.uppercase)
  }

  const exportVideo = async () => {
    if (showSubtitles && !subtitlesCurrent) return
    if (!file) {
      setError('Necesito el video original en este dispositivo para exportar.')
      setMobilePanel('video')
      return
    }

    if (isNarrating && (!voiceIsFresh || !activeAudio || blockingTiming)) {
      setError('La voz cambió o todavía no está lista. Genérala antes de exportar.')
      setMobilePanel('voice')
      return
    }

    setError(null)
    exportStartedAtRef.current = performance.now()
    setLocalExport({
      status: 'checking',
      progress: 0.01,
      message: 'Preparando exportación local…',
      fileName: null,
      error: null,
      elapsedSeconds: 0,
    })

    try {
      const blob = await exportSubtitledVideoLocally({
        file,
        words: readyWords,
        showSubtitles,
        generatedAudio: isNarrating ? activeAudio : null,
        options: {
          preset,
          baseColor,
          activeColor,
          outlineColor,
          effectColor,
          fontScale,
          verticalPosition,
          maxWords,
          uppercase,
          wordOverrides,
        },
        onProgress: ({ progress, message }) => {
          const elapsedSeconds = exportStartedAtRef.current
            ? (performance.now() - exportStartedAtRef.current) / 1000
            : 0
          setLocalExport({
            status: progress >= 1 ? 'ready' : 'exporting',
            progress,
            message,
            fileName: null,
            error: null,
            elapsedSeconds,
          })
        },
      })

      const original = file.name.replace(/\.[^.]+$/, '') || 'video'
      const fileName = `${original}-subtitulado.mp4`
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = fileName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)

      const elapsedSeconds = exportStartedAtRef.current
        ? (performance.now() - exportStartedAtRef.current) / 1000
        : 0

      setLocalExport({
        status: 'ready',
        progress: 1,
        message: 'MP4 exportado en este dispositivo.',
        fileName,
        error: null,
        elapsedSeconds,
      })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'No se pudo exportar el video.'
      setLocalExport({
        status: 'error',
        progress: 0,
        message: 'La exportación local falló.',
        fileName: null,
        error: message,
        elapsedSeconds: exportStartedAtRef.current ? (performance.now() - exportStartedAtRef.current) / 1000 : 0,
      })
      setError(message)
    }
  }

  const runPrimaryAction = async () => {
    if (primaryMode === 'script') await createAiScript()
    else if (primaryMode === 'voice') await createAiVoice()
    else if (primaryMode === 'sync') await syncExistingVoice()
    else if (primaryMode === 'generate') await startTranscription()
    else await exportVideo()
  }

  const seekTo = (time: number) => {
    const safe = Math.min(Math.max(time, 0), duration || 0)
    const video = isMobile ? mobileVideoRef.current : desktopVideoRef.current
    if (video) video.currentTime = safe
    if (generatedAudioRef.current && videoMode === 'without_voice') {
      generatedAudioRef.current.currentTime = safe
    }
    setCurrentTime(safe)
  }

  const seekToCaption = (caption: SubtitleCaption) => seekTo(caption.start)

  const togglePlayback = () => {
    const video = isMobile ? mobileVideoRef.current : desktopVideoRef.current
    if (!video) return
    if (video.paused) void video.play()
    else video.pause()
  }

  const onVideoPlay = async (video: HTMLVideoElement) => {
    setPlaying(true)
    if (videoMode === 'without_voice' && generatedAudioRef.current && activeAudioUrl) {
      generatedAudioRef.current.currentTime = video.currentTime
      try {
        await generatedAudioRef.current.play()
      } catch {
        // Mobile browser may require a second explicit gesture for the audio element.
      }
    }
  }

  const onVideoPause = () => {
    setPlaying(false)
    generatedAudioRef.current?.pause()
  }

  const resolvedWord = (word: SubtitleWord) => {
    const text = wordOverrides[word.id] ?? word.text
    return uppercase ? text.toUpperCase() : text
  }

  const closeWordEditor = (id: number) => {
    const value = wordOverrides[id]
    if (value !== undefined && !value.trim()) {
      setWordOverrides((current) => {
        const next = { ...current }
        delete next[id]
        return next
      })
    }
    setEditingWordId(null)
  }

  const handleWordEditorKey = (event: KeyboardEvent<HTMLInputElement>, id: number) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      event.currentTarget.blur()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setWordOverrides((current) => {
        const next = { ...current }
        delete next[id]
        return next
      })
      setEditingWordId(null)
    }
  }

  const clampSubtitlePosition = (value: number) => Math.min(0.92, Math.max(0.08, value))
  const clampSubtitleScale = (value: number) => Math.min(10, Math.max(3.5, value))

  const pointerDistance = (points: Array<{ x: number; y: number }>) => {
    if (points.length < 2) return 0
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
  }

  const handleSubtitlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)

    const pointers = subtitlePointersRef.current
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const points = [...pointers.values()]

    if (points.length === 1) {
      subtitleGestureRef.current = {
        mode: 'drag',
        startY: event.clientY,
        startPosition: verticalPosition,
        startDistance: 0,
        startScale: fontScale,
      }
      return
    }

    if (points.length >= 2) {
      subtitleGestureRef.current = {
        mode: 'pinch',
        startY: (points[0].y + points[1].y) / 2,
        startPosition: verticalPosition,
        startDistance: pointerDistance(points),
        startScale: fontScale,
      }
    }
  }

  const handleSubtitlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointers = subtitlePointersRef.current
    if (!pointers.has(event.pointerId)) return

    event.preventDefault()
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const gesture = subtitleGestureRef.current
    if (!gesture) return

    const frame = event.currentTarget.closest('.subtitle-video-frame') as HTMLElement | null
    const frameHeight = frame?.getBoundingClientRect().height || 1
    const points = [...pointers.values()]

    if (points.length >= 2) {
      if (gesture.mode !== 'pinch') {
        subtitleGestureRef.current = {
          mode: 'pinch',
          startY: (points[0].y + points[1].y) / 2,
          startPosition: verticalPosition,
          startDistance: pointerDistance(points),
          startScale: fontScale,
        }
        return
      }

      const distance = pointerDistance(points)
      const ratio = gesture.startDistance > 0 ? distance / gesture.startDistance : 1
      const midpointY = (points[0].y + points[1].y) / 2
      setFontScale(clampSubtitleScale(gesture.startScale * ratio))
      setVerticalPosition(clampSubtitlePosition(
        gesture.startPosition + (midpointY - gesture.startY) / frameHeight,
      ))
      return
    }

    if (points.length === 1) {
      if (gesture.mode !== 'drag') {
        subtitleGestureRef.current = {
          mode: 'drag',
          startY: points[0].y,
          startPosition: verticalPosition,
          startDistance: 0,
          startScale: fontScale,
        }
        return
      }

      setVerticalPosition(clampSubtitlePosition(
        gesture.startPosition + (points[0].y - gesture.startY) / frameHeight,
      ))
    }
  }

  const handleSubtitlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointers = subtitlePointersRef.current
    pointers.delete(event.pointerId)

    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // Pointer capture may already be released by the browser.
    }

    const points = [...pointers.values()]
    if (!points.length) {
      subtitleGestureRef.current = null
      return
    }

    subtitleGestureRef.current = {
      mode: 'drag',
      startY: points[0].y,
      startPosition: verticalPosition,
      startDistance: 0,
      startScale: fontScale,
    }
  }

  const renderPreview = (mobile = false) => videoUrl ? (
    <div
      className={mobile ? 'subtitle-video-frame mobile' : 'subtitle-video-frame'}
      style={mobile && videoAspectRatio ? { aspectRatio: String(videoAspectRatio) } : undefined}
    >
      <video
        ref={mobile ? mobileVideoRef : desktopVideoRef}
        src={videoUrl}
        controls={!mobile}
        playsInline
        onLoadedMetadata={(event) => {
          const video = event.currentTarget
          setMediaDuration(video.duration || 0)
          if (video.videoWidth > 0 && video.videoHeight > 0) {
            setVideoAspectRatio(video.videoWidth / video.videoHeight)
          }
        }}
        onPlay={(event) => void onVideoPlay(event.currentTarget)}
        onPause={onVideoPause}
        onSeeked={(event) => {
          const time = event.currentTarget.currentTime
          setCurrentTime(time)
          if (generatedAudioRef.current && videoMode === 'without_voice') {
            generatedAudioRef.current.currentTime = time
          }
        }}
      />

      {activeCaption && <div
        className={`subtitle-overlay editable preset-${preset}`}
        style={{
          '--subtitle-size': `${Math.max(1, (previewVideoHeight || 500) * fontScale / 100)}px`,
          '--subtitle-outline': outlineColor,
          '--subtitle-active': activeColor,
          '--subtitle-effect': effectColor,
          top: `${verticalPosition * 100}%`,
        } as CSSProperties}
        onPointerDown={handleSubtitlePointerDown}
        onPointerMove={handleSubtitlePointerMove}
        onPointerUp={handleSubtitlePointerEnd}
        onPointerCancel={handleSubtitlePointerEnd}
        aria-label="Subtítulos: arrastra verticalmente o pellizca para cambiar tamaño"
      >
        <div>{activeCaption.wordIds.map((id) => {
          const word = wordsById.get(id)
          if (!word) return null
          return <span
            key={id}
            className={id === activeWordId ? 'active' : ''}
            style={{ color: id === activeWordId ? activeColor : baseColor }}
          >
            {resolvedWord(word)}
          </span>
        })}</div>
      </div>}

      {activeAudioUrl && <audio ref={generatedAudioRef} src={activeAudioUrl} preload="auto" />}
    </div>
  ) : (
    <div className="subtitle-empty-preview">
      <FileVideo2 size={42} />
      <strong>{restoring ? 'Restaurando proyecto…' : 'Elige cómo viene tu video'}</strong>
      <span>Con voz: transcribimos. Sin voz: Gemini crea guion, voz y subtítulos.</span>
    </div>
  )

  const renderStatus = () => job ? <div className={`subtitle-job-status ${job.status}`}>
    {job.status === 'ready'
      ? <CheckCircle2 size={16} />
      : <LoaderCircle size={16} className={job.status !== 'error' ? 'spin' : ''} />}
    <span>
      <strong>{statusLabel[job.status]}</strong>
      <small>{job.message}</small>
    </span>
    <b>{Math.round(job.progress * 100)}%</b>
  </div> : null

  const renderUploadChoice = () => <div className="subtitle-upload-choice">
    <label className={videoMode === 'with_voice' ? 'active' : ''}>
      <Mic2 size={20} />
      <strong>Subir video con voz</strong>
      <small>Gemini transcribe la voz existente.</small>
      <input type="file" accept="video/*" onChange={(event) => void chooseFile(event.target.files?.[0] ?? null, 'with_voice')} />
    </label>
    <label className={videoMode === 'without_voice' ? 'active' : ''}>
      <WandSparkles size={20} />
      <strong>Subir video sin voz</strong>
      <small>Gemini crea la presentación completa.</small>
      <input type="file" accept="video/*" onChange={(event) => void chooseFile(event.target.files?.[0] ?? null, 'without_voice')} />
    </label>
  </div>

  const renderGeminiSettings = () => <GeminiKeySettings onChange={() => {
    setVoiceCatalog([])
    setVoiceCatalogError(null)
    setVoiceCatalogRequest((value) => value + 1)
  }} />

  const renderVideoControls = () => <div className="subtitle-video-controls">
    {renderUploadChoice()}

    {file && <div className="subtitle-selected-file">
      <FileVideo2 size={16} />
      <span>{file.name}</span>
      <b>{videoMode === 'without_voice' ? 'SIN VOZ' : 'CON VOZ'}</b>
    </div>}

    {videoMode === 'with_voice' && <label className="subtitle-field">
      <span>Idioma del video</span>
      <select value={language} onChange={(event) => setLanguage(event.target.value)} disabled={transcribing}>
        <option value="auto">Detectar automáticamente</option>
        <option value="es">Español</option>
        <option value="en">Inglés</option>
        <option value="de">Alemán</option>
        <option value="fr">Francés</option>
        <option value="it">Italiano</option>
        <option value="pt">Portugués</option>
      </select>
    </label>}

    {videoMode === 'with_voice' && job?.status === 'ready' && generatedLanguage !== language && (
      <p className="subtitle-language-dirty">Cambiaste el idioma. El botón principal volverá a generar los subtítulos.</p>
    )}

    {renderStatus()}
    {storageNotice && <p className="subtitle-storage-note">{storageNotice}</p>}
    {(file || job) && <button className="subtitle-reset-project" disabled={Boolean(aiBusy || exporting)} onClick={() => void resetProject()}>Nuevo proyecto</button>}
  </div>

  const renderVoiceControls = () => {
    if (videoMode !== 'without_voice') {
      return <div className="subtitle-transcript-empty">Este panel se usa cuando subes un video sin voz.</div>
    }

    return <>
      <fieldset className="subtitle-ai-presenter" disabled={Boolean(aiBusy || exporting)}>
      <label className="subtitle-field subtitle-narration-mode">
        <span>Resultado</span>
        <select value={narrationMode} onChange={(event) => setNarrationMode(event.target.value as NarrationMode)}>
          <option value="voice">Solo voz</option>
          <option value="voice_and_subtitles">Voz + subtítulos</option>
        </select>
      </label>

      <label className="subtitle-field subtitle-presentation-type">
        <span>Tipo de presentación</span>
        <select
          value={presentationForm.presentationType}
          onChange={(event) => setPresentationForm((current) => ({
            ...current,
            presentationType: event.target.value as PresentationForm['presentationType'],
          }))}
        >
          {presentationTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>

      {selectedBlock && <div className="subtitle-narration-editor">
        <label className="subtitle-field"><span>Bloque</span><select value={selectedBlock.id} onChange={(event) => {
          const block = blocks.find((item) => item.id === event.target.value)
          if (block) { setSelectedBlockId(block.id); seekTo(timelineBlocks.find((item) => item.id === block.id)?.start ?? block.start) }
        }}>{blocks.map((block, index) => <option key={block.id} value={block.id}>{index + 1}. {block.label || block.text.slice(0, 55) || 'Frase'}</option>)}</select></label>
        <label className="subtitle-field"><span>Diseño / escena</span><input value={selectedBlock.label} maxLength={120} onChange={(event) => updateBlock(selectedBlock.id, { label: event.target.value })} /></label>
        {selectedBlock.visibleText && <small className="subtitle-visible-design-text">En pantalla: «{selectedBlock.visibleText}»</small>}
        <label className="subtitle-field subtitle-narration-phrase"><span>Frase</span><textarea ref={blockTextRef} aria-label="Frase" value={selectedBlock.text} maxLength={3000} onChange={(event) => updateBlock(selectedBlock.id, { text: event.target.value })} /></label>
        <div className="subtitle-narration-actions">
          <button type="button" disabled={blocks.length >= 60} onClick={splitSelected}>Dividir en el cursor</button>
          <button type="button" disabled={blocks.indexOf(selectedBlock) === blocks.length - 1} onClick={joinSelected}>Unir con la siguiente</button>
        </div>
        {selectedBlock.sceneEnd !== null && <small>Escena sugerida {formatTime(selectedBlock.sceneStart ?? 0)} – {formatTime(selectedBlock.sceneEnd)}{usableClips[selectedBlock.id] ? ` · Voz ${clipSeconds(usableClips[selectedBlock.id]).toFixed(2)} s` : ''}</small>}
      </div>}

      {presentationForm.presentationType === 'collection' && <label className="subtitle-field">
        <span>Nombres de los diseños (opcional)</span>
        <textarea maxLength={4000} value={presentationForm.collectionItems ?? ''} onChange={(event) => setPresentationForm((current) => ({ ...current, collectionItems: event.target.value }))} placeholder="Un nombre por línea. Ej. Snitch Dorada" />
      </label>}

      <label className="subtitle-field">
        <span>Producto</span>
        <input
          value={presentationForm.product}
          onChange={(event) => setPresentationForm((current) => ({ ...current, product: event.target.value }))}
          placeholder="Ej. polera personalizada de anime"
        />
      </label>

      <label className="subtitle-field">
        <span>Qué quieres destacar</span>
        <textarea
          value={presentationForm.highlights}
          onChange={(event) => setPresentationForm((current) => ({ ...current, highlights: event.target.value }))}
          placeholder="Ej. estampado grande, colores, personalización"
        />
      </label>

      <label className="subtitle-field">
        <span>Público</span>
        <input
          value={presentationForm.audience}
          onChange={(event) => setPresentationForm((current) => ({ ...current, audience: event.target.value }))}
          placeholder="Opcional"
        />
      </label>

      <label className="subtitle-field">
        <span>CTA</span>
        <input
          value={presentationForm.cta}
          onChange={(event) => setPresentationForm((current) => ({ ...current, cta: event.target.value }))}
          placeholder="Ej. Personaliza la tuya"
        />
      </label>

      <label className="subtitle-field">
        <span>Idioma / acento</span>
        <select
          value={presentationForm.language}
          onChange={(event) => setPresentationForm((current) => ({ ...current, language: event.target.value }))}
        >
          <option value="es-LATAM">Español latino neutro</option>
          <option value="es-CL">Español chileno</option>
          <option value="es-AR">Español argentino</option>
          <option value="es-VE">Español venezolano</option>
          <option value="en-US">Inglés estadounidense</option>
          <option value="pt-BR">Portugués brasileño</option>
        </select>
      </label>

      {presentationScript && <div className="subtitle-script-summary">
        <strong>{presentationScript.title}</strong>
        <span>{presentationScript.summary}</span>
        {presentationScript.visualNotes.length > 0 && <details><summary>Notas del video</summary><ul>{presentationScript.visualNotes.map((note, index) => <li key={index}>{note}</li>)}</ul></details>}
      </div>}

      {!blocks.length && <label className="subtitle-field">
        <span>Guion</span>
        <textarea className="subtitle-script-editor" value={presentationDraft} maxLength={12_000} onChange={(event) => {
          setPresentationDraft(event.target.value)
          setGeneratedVoiceSignature('')
        }} placeholder="Escribe tu guion o genéralo a partir del video." />
      </label>}
      <div className="subtitle-narration-actions">
        <button type="button" disabled={!file} onClick={() => void createAiScript()}>{presentationScript ? 'Regenerar guion' : 'Generar guion'}</button>
        <button type="button" disabled={!file || !presentationDraft.trim()} onClick={() => void createAiScript(true)}>Ubicar mi guion</button>
        {!blocks.length && <button type="button" disabled={!presentationDraft.trim()} onClick={prepareManualBlocks}>Separar frases</button>}
      </div>

        <div className="subtitle-voice-and-style">
          <div className="subtitle-field subtitle-voice-field">
            <span>Voz <b>{voiceCatalog.length ? `${voiceCatalog.length} disponibles` : ''}</b></span>

            <div className="subtitle-voice-gender-filters">
              {([
                ['all', 'Todas'],
                ['female', '♀ Femeninas'],
                ['male', '♂ Masculinas'],
                ['neutral', '◉ Neutras'],
              ] as const).map(([value, label]) => <button
                key={value}
                type="button"
                className={voiceGenderFilter === value ? 'active' : ''}
                onClick={() => setVoiceGenderFilter(value)}
              >
                {label}
              </button>)}
            </div>

            {voiceCatalogLoading && <div className="subtitle-voice-catalog-state">
              <LoaderCircle size={14} className="spin" /> Cargando voces de Gemini…
            </div>}

            {voiceCatalogError && <div className="subtitle-voice-catalog-state error">
              {voiceCatalogError}
              <button type="button" onClick={() => {
                setVoiceCatalogError(null)
                setVoiceCatalog([])
                setVoiceCatalogRequest((value) => value + 1)
              }}>Reintentar</button>
            </div>}

            {!voiceCatalogLoading && visibleVoices.length > 0 && <div className="subtitle-voice-carousel">
              {renderedVoices.map((item) => <button
                key={item.id}
                type="button"
                className={voice === item.id ? 'active' : ''}
                onClick={() => {
                  if (item.id !== voice) setGeneratedVoiceSignature('')
                  setVoice(item.id)
                }}
                title={item.description ?? item.persona ?? item.displayName}
              >
                <i className={`gender-${item.gender}`} aria-hidden="true">{voiceGenderIcon(item.gender)}</i>
                <strong>{item.displayName}</strong>
                <small>{voiceGenderLabel(item.gender)}</small>
                <span>{item.accent ?? item.persona ?? item.languageCode ?? item.type}</span>
              </button>)}
              {visibleVoices.length > voiceRenderLimit && <button
                type="button"
                className="subtitle-voice-more"
                onClick={() => setVoiceRenderLimit((value) => Math.min(visibleVoices.length, value + 20))}
              >
                <strong>+{Math.min(20, visibleVoices.length - voiceRenderLimit)}</strong>
                <small>Más voces</small>
                <span>{visibleVoices.length - voiceRenderLimit} restantes</span>
              </button>}
            </div>}

            {!voiceCatalogLoading && !voiceCatalogError && !visibleVoices.length && <div className="subtitle-voice-catalog-state">
              No hay voces para este filtro.
            </div>}
          </div>

          <label className="subtitle-field subtitle-voice-style-field">
            <span>Estilo</span>
            <select value={voiceStyle} onChange={(event) => {
              const next = event.target.value as VoiceStyleId
              if (next !== voiceStyle) setGeneratedVoiceSignature('')
              setVoiceStyle(next)
            }}>
              {voiceStyles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>

        {voiceIsFresh && (!take || narrationReady) && <div className="subtitle-narration-actions">
          <button type="button" disabled={transcribing} onClick={() => void createAiVoice()}>{take ? 'Generar otra toma completa' : 'Generar una toma completa'}</button>
        </div>}
        {activeAudioUrl && <div className="subtitle-voice-preview">
          <span><Mic2 size={15} /> Voz generada</span>
          <audio controls src={activeAudioUrl} />
          {!voiceIsFresh && <small>El guion o la voz cambió. Genera nuevamente antes de exportar.</small>}
        </div>}
      </fieldset>
      {aiBusy && <button className="subtitle-cancel-analysis" type="button" onClick={() => aiRequestRef.current?.abort()}>Cancelar {aiBusy === 'script' ? 'análisis' : 'voz'}</button>}
    </>
  }

  const renderPresetControls = () => <div className="subtitle-preset-grid">
    {subtitlePresets.map((item) => <button
      key={item.id}
      className={preset === item.id ? `active preset-${item.id}` : `preset-${item.id}`}
      onClick={() => applyPreset(item.id)}
      title={item.description}
    >
      <span>{item.name}</span>
      <strong>{item.sample}</strong>
      <small>{item.description}</small>
    </button>)}
  </div>

  const colorValueFor = (target: SubtitleColorTarget) => {
    if (target === 'base') return baseColor
    if (target === 'active') return activeColor
    if (target === 'outline') return outlineColor
    return effectColor
  }

  const setColorValueFor = (target: SubtitleColorTarget, value: string) => {
    if (target === 'base') setBaseColor(value)
    else if (target === 'active') setActiveColor(value)
    else if (target === 'outline') setOutlineColor(value)
    else setEffectColor(value)
  }

  const openColorEditor = (target: SubtitleColorTarget) => {
    const hsv = hexToHsv(colorValueFor(target))
    setColorHue(hsv.h)
    setColorSaturation(hsv.s)
    setColorValue(hsv.v)
    setColorEditorTarget(target)
  }

  const applyHsvColor = (h = colorHue, sat = colorSaturation, val = colorValue) => {
    if (!colorEditorTarget) return
    setColorValueFor(colorEditorTarget, hsvToHex(h, sat, val))
  }

  const handleColorPlane = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!colorEditorTarget) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const rect = event.currentTarget.getBoundingClientRect()
    const sat = clamp((event.clientX - rect.left) / rect.width, 0, 1)
    const val = clamp(1 - (event.clientY - rect.top) / rect.height, 0, 1)
    setColorSaturation(sat)
    setColorValue(val)
    setColorValueFor(colorEditorTarget, hsvToHex(colorHue, sat, val))
  }

  const renderMobileColorEditor = () => {
    if (!colorEditorTarget) return null

    const labels: Record<SubtitleColorTarget, string> = {
      base: 'Texto',
      active: 'Palabra activa',
      outline: 'Contorno',
      effect: 'Efecto',
    }
    const current = colorValueFor(colorEditorTarget)

    return <div className="subtitle-inline-color-editor">
      <div className="subtitle-color-editor-title">
        <button type="button" onClick={() => setColorEditorTarget(null)}>← Colores</button>
        <strong>{labels[colorEditorTarget]}</strong>
        <i style={{ backgroundColor: current }} />
      </div>

      <div
        className="subtitle-sv-plane"
        style={{ backgroundColor: `hsl(${colorHue}, 100%, 50%)` }}
        onPointerDown={handleColorPlane}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) handleColorPlane(event)
        }}
      >
        <i
          style={{
            left: `${colorSaturation * 100}%`,
            top: `${(1 - colorValue) * 100}%`,
            backgroundColor: current,
          }}
        />
      </div>

      <label className="subtitle-hue-control">
        <span>Tono</span>
        <input
          type="range"
          min="0"
          max="360"
          step="1"
          value={colorHue}
          onChange={(event) => {
            const next = Number(event.target.value)
            setColorHue(next)
            applyHsvColor(next, colorSaturation, colorValue)
          }}
        />
      </label>

      <div className="subtitle-quick-colors">
        {quickColors.map((color) => <button
          key={color}
          type="button"
          className={current.toUpperCase() === color ? 'active' : ''}
          style={{ backgroundColor: color }}
          aria-label={color}
          onClick={() => {
            const hsv = hexToHsv(color)
            setColorHue(hsv.h)
            setColorSaturation(hsv.s)
            setColorValue(hsv.v)
            setColorValueFor(colorEditorTarget, color)
          }}
        />)}
      </div>
    </div>
  }

  const renderTextControls = () => isMobile ? (
    <div className="subtitle-mobile-customize-strip">
      {([
        ['base', 'Texto', baseColor],
        ['active', 'Activa', activeColor],
        ['outline', 'Contorno', outlineColor],
        ['effect', 'Efecto', effectColor],
      ] as const).map(([target, label, color]) => <button
        key={target}
        type="button"
        className="subtitle-mobile-control-card color custom-color"
        onClick={() => openColorEditor(target)}
      >
        <span>{label}</span>
        <i className="subtitle-color-swatch" style={{ backgroundColor: color }} />
        <small>{color.toUpperCase()}</small>
      </button>)}

      <div className="subtitle-mobile-control-card words">
        <span>Palabras</span>
        <div>
          <button type="button" onClick={() => setMaxWords((value) => Math.max(2, value - 1))}>−</button>
          <strong>{maxWords}</strong>
          <button type="button" onClick={() => setMaxWords((value) => Math.min(8, value + 1))}>+</button>
        </div>
        <small>por bloque</small>
      </div>

      <button
        type="button"
        className={uppercase ? 'subtitle-mobile-control-card toggle active' : 'subtitle-mobile-control-card toggle'}
        onClick={() => setUppercase((value) => !value)}
      >
        <span>Mayúsculas</span>
        <strong>Aa</strong>
        <small>{uppercase ? 'Activado' : 'Desactivado'}</small>
      </button>
    </div>
  ) : <>
    <div className="subtitle-color-grid">
      <label><span>Texto</span><input type="color" value={baseColor} onChange={(event) => setBaseColor(event.target.value)} /></label>
      <label><span>Palabra activa</span><input type="color" value={activeColor} onChange={(event) => setActiveColor(event.target.value)} /></label>
      <label><span>Contorno</span><input type="color" value={outlineColor} onChange={(event) => setOutlineColor(event.target.value)} /></label>
      <label><span>Efecto</span><input type="color" value={effectColor} onChange={(event) => setEffectColor(event.target.value)} /></label>
    </div>

    <p className="subtitle-manipulation-hint">Sobre el video: arrastra el subtítulo para moverlo y pellizca con dos dedos para cambiar su tamaño.</p>

    <label className="subtitle-field">
      <span>Palabras por bloque <b>{maxWords}</b></span>
      <input type="range" min="2" max="8" step="1" value={maxWords} onChange={(event) => setMaxWords(Number(event.target.value))} />
    </label>

    <label className="subtitle-checkbox">
      <input type="checkbox" checked={uppercase} onChange={(event) => setUppercase(event.target.checked)} />
      <span>Todo en mayúsculas</span>
    </label>
  </>

  const renderTranscript = () => !showSubtitles ? <div className="subtitle-transcript-empty">Salida configurada en Solo voz.</div> : !subtitlesCurrent ? (
    <div className="subtitle-transcript-empty">
      {transcribing
        ? 'Gemini está sincronizando los timestamps palabra por palabra…'
        : videoMode === 'without_voice'
          ? 'Primero genera la presentación y la voz.'
          : 'Genera los subtítulos para poder revisar y corregir el texto.'}
    </div>
  ) : (
    <div className="subtitle-caption-list">
      {captions.map((caption) => <article key={caption.id} onClick={() => seekToCaption(caption)}>
        <time>{formatTime(caption.start)}</time>
        <p>
          {caption.wordIds.map((id) => {
            const word = wordsById.get(id)
            if (!word) return null
            const value = wordOverrides[id] ?? word.text

            return editingWordId === id ? (
              <input
                key={id}
                className="subtitle-inline-word-editor"
                autoFocus
                value={value}
                size={Math.max(2, value.length)}
                onClick={(event) => event.stopPropagation()}
                onFocus={(event) => event.currentTarget.select()}
                onBlur={() => closeWordEditor(id)}
                onChange={(event) => setWordOverrides((current) => ({ ...current, [id]: event.target.value }))}
                onKeyDown={(event) => handleWordEditorKey(event, id)}
              />
            ) : (
              <button
                key={id}
                type="button"
                className={wordOverrides[id] !== undefined ? 'subtitle-inline-word corrected' : 'subtitle-inline-word'}
                onClick={(event) => {
                  event.stopPropagation()
                  setEditingWordId(id)
                }}
              >
                {value}
              </button>
            )
          })}
        </p>
      </article>)}
    </div>
  )

  const copyLogs = async () => {
    const server = aiLogs.map((item) => JSON.stringify(item)).join('\n')
    const client = clientAiLogs.join('\n')
    const payload = [
      '=== GAS3D AI LOGS ===',
      `videoMode=${videoMode ?? 'none'}`,
      `jobStatus=${job?.status ?? 'none'}`,
      '',
      '--- SERVER ---',
      server || '(sin logs)',
      '',
      '--- CLIENT ---',
      client || '(sin logs)',
    ].join('\n')

    await navigator.clipboard.writeText(payload)
    setLogsCopied(true)
    window.setTimeout(() => setLogsCopied(false), 1800)
  }

  const renderLogs = () => <div className="subtitle-ai-logs">
    <div className="subtitle-ai-log-actions">
      <button onClick={() => void refreshLogs()} disabled={logsLoading}>
        <RefreshCw size={14} className={logsLoading ? 'spin' : ''} /> Actualizar
      </button>
      <button onClick={() => void copyLogs()}>
        <Copy size={14} /> {logsCopied ? 'Copiado' : 'Copiar todo'}
      </button>
      <button onClick={() => void clearAiLogs().then(() => setAiLogs([]))}>Limpiar</button>
    </div>

    <p>Incluye modelo, intento, degradación, tiempos y error completo. No incluye tu API key.</p>

    <div className="subtitle-ai-log-list">
      {[...aiLogs].reverse().map((item, index) => <article key={`${item.time}-${index}`} className={item.level}>
        <header>
          <time>{item.time.replace('T', ' ').replace('Z', '')}</time>
          <b>{item.operation}</b>
        </header>
        <div>
          {item.model && <span>{item.model}</span>}
          {item.attempt && <span>intento {item.attempt}</span>}
          {item.durationMs !== null && <span>{item.durationMs} ms</span>}
        </div>
        <strong>{item.message}</strong>
        {item.error && <pre>{item.error}</pre>}
      </article>)}

      {!aiLogs.length && <div className="subtitle-transcript-empty">Aún no hay eventos de IA registrados.</div>}
    </div>
  </div>

  useEffect(() => {
    if (mobilePanel === 'logs') void refreshLogs()
  }, [mobilePanel, refreshLogs])

  const primaryDisabled = !file || restoring || uploading || aiBusy !== null || exporting ||
    ((showSubtitles || separatingTake) && transcribing) || (primaryMode === 'export' && isNarrating && (blockingTiming || !activeAudio))

  const primaryLabel =
    aiBusy === 'script' ? 'Analizando…' :
    aiBusy === 'voice' ? 'Preparando voz…' :
    separatingTake ? 'Separando frases…' :
    showSubtitles && transcribing ? 'Generando subtítulos…' :
    primaryMode === 'script' ? 'Generar guion' :
    primaryMode === 'voice' ? 'Generar voz' :
    primaryMode === 'sync' ? (currentTake ? 'Separar frases' : 'Sincronizar subtítulos') :
    primaryMode === 'generate' ? 'Generar subtítulos' :
    exporting ? `Exportando ${Math.round(localExport.progress * 100)}%` : 'Exportar'

  const renderNarrationTimeline = () => isNarrating && blocks.length > 0 && <>
    <NarrationTimeline
      blocks={timelineBlocks} clips={usableClips} duration={duration} time={currentTime} selectedId={selectedBlock?.id ?? null}
      disabled={Boolean(aiBusy || exporting)} conflicts={new Set([...conflicts.overlaps, ...conflicts.outside, ...conflicts.scenes])}
      onSelect={setSelectedBlockId}
      onMove={(id, start) => {
        const video = isMobile ? mobileVideoRef.current : desktopVideoRef.current
        video?.pause()
        updateBlock(id, { start, anchored: true })
      }}
      onSeek={seekTo} onEdit={() => { setFocusPhrase(true); openMobilePanel('voice') }}
    />
    {takeAlignment?.error && <p className="subtitle-narration-warning" role="status">{takeAlignment.error} Puedes reintentar la separación de la misma toma.</p>}
    {(blockingTiming || conflicts.scenes.size > 0) && <p className="subtitle-narration-warning" role="status">
      {blockingTiming ? 'Hay frases superpuestas o fuera del video. Mueve o acorta los bloques marcados para exportar.' : 'Una o más frases se salen de su escena sugerida.'}
    </p>}
  </>

  const primaryIcon =
    aiBusy || uploading || separatingTake || (showSubtitles && transcribing) || exporting
      ? <LoaderCircle size={17} className="spin" />
      : primaryMode === 'export'
        ? <Download size={17} />
        : <Sparkles size={17} />

  const renderMobilePanel = () => {
    if (mobilePanel === 'main') {
      return <nav className="subtitle-mobile-tools five" aria-label="Herramientas">
        <button onClick={() => openMobilePanel('video')}><Upload size={22} /><span>Video</span></button>
        <button onClick={() => openMobilePanel('voice')} disabled={videoMode !== 'without_voice'}><Mic2 size={22} /><span>Voz IA</span></button>
        <button onClick={() => openMobilePanel('style')}><Palette size={22} /><span>Estilo</span></button>
        <button onClick={() => openMobilePanel('transcript')}><Languages size={22} /><span>Subtítulos</span></button>
        <button onClick={() => openMobilePanel('logs')}><SquareTerminal size={22} /><span>Logs IA</span></button>
      </nav>
    }

    const title = mobilePanel === 'video' ? 'Video'
      : mobilePanel === 'voice' ? 'Presentación IA'
      : mobilePanel === 'style' ? 'Estilo'
      : mobilePanel === 'text' ? 'Texto'
      : mobilePanel === 'transcript' ? 'Subtítulos'
      : 'Logs IA'

    return <div className={`subtitle-mobile-panel panel-${mobilePanel}`}>
      <header>
        <button onClick={closeMobilePanel} aria-label="Volver a herramientas"><ArrowLeft size={20} /></button>
        <strong>{title}</strong>
        <button
          className="subtitle-panel-collapse"
          onClick={() => setMobilePanelCollapsed((value) => !value)}
          aria-label={mobilePanelCollapsed ? 'Mostrar herramienta' : 'Ocultar herramienta'}
        >
          {mobilePanelCollapsed ? <ChevronsUp size={20} /> : <ChevronsDown size={20} />}
        </button>
        <button onClick={closeMobilePanel} aria-label="Guardar cambios"><Check size={22} /></button>
      </header>
      <div className="subtitle-mobile-panel-body">
        {mobilePanel === 'video' && renderVideoControls()}
        {mobilePanel === 'voice' && renderVoiceControls()}
        {mobilePanel === 'style' && <>
          {renderPresetControls()}
          <div className="subtitle-style-selection-bar">
            <span>
              <small>Seleccionado</small>
              <strong>{getSubtitlePreset(preset).name}</strong>
            </span>
            <button type="button" onClick={() => openMobilePanel('text')}>Personalizar</button>
          </div>
        </>}
        {mobilePanel === 'text' && (colorEditorTarget ? renderMobileColorEditor() : renderTextControls())}
        {mobilePanel === 'transcript' && renderTranscript()}
        {mobilePanel === 'logs' && <>{renderGeminiSettings()}{renderLogs()}</>}
      </div>
    </div>
  }

  return <main className="subtitle-studio">
    {isMobile ? <section className={(isNarrating && blocks.length > 0 && duration > 0 ? 'has-narration ' : '') + (
      mobilePanel === 'main'
        ? 'subtitle-mobile-editor'
        : mobilePanelCollapsed
          ? 'subtitle-mobile-editor tool-active tool-collapsed'
          : 'subtitle-mobile-editor tool-active'
    )}>
      <header className="subtitle-mobile-header">
        <AppLauncher active="subtitles" />
        <strong>Subtitle Studio</strong>
        <button
          className={primaryMode === 'export' ? 'subtitle-mobile-export' : 'subtitle-mobile-export generate'}
          disabled={primaryDisabled}
          onClick={() => void runPrimaryAction()}
        >
          {primaryIcon}
          <span>{primaryLabel}</span>
        </button>
      </header>

      <div className="subtitle-mobile-stage">{renderPreview(true)}</div>

      <div className="subtitle-mobile-transport">
        <button disabled={!videoUrl} onClick={togglePlayback}>
          {playing ? <span className="subtitle-pause-icon">Ⅱ</span> : <Play size={22} fill="currentColor" />}
        </button>
        <div className="subtitle-mobile-timeline">
          <div className="subtitle-mobile-track">
            {captions.map((caption) => duration > 0 ? <i
              key={caption.id}
              style={{
                left: `${Math.min(100, caption.start / duration * 100)}%`,
                width: `${Math.max(1, (caption.end - caption.start) / duration * 100)}%`,
              }}
            /> : null)}
          </div>
          <input
            type="range"
            min="0"
            max={duration || 1}
            step="0.05"
            value={Math.min(currentTime, duration || 1)}
            disabled={!videoUrl}
            onChange={(event) => seekTo(Number(event.target.value))}
          />
          <div><span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span></div>
        </div>
      </div>

      {isNarrating && blocks.length > 0 && duration > 0 && <div className="subtitle-narration-area">{renderNarrationTimeline()}</div>}
      {error && <div className="subtitle-mobile-error" role="status">{error}</div>}
      {exporting && <div className="subtitle-mobile-export-progress">
        <span>{localExport.message}</span>
        <div><i style={{ width: `${Math.round(localExport.progress * 100)}%` }} /></div>
      </div>}
      {localExport.status === 'ready' && <div className="subtitle-local-export-done">
        <CheckCircle2 size={16} />
        <span>Exportado localmente en {localExport.elapsedSeconds.toFixed(1)} s</span>
      </div>}

      <div className="subtitle-mobile-dock">{renderMobilePanel()}</div>
    </section> : <section className="subtitle-desktop-editor">
      <header className="subtitle-header">
        <AppLauncher active="subtitles" />
        <div>
          <span className="subtitle-kicker">GAS3D · creación asistida</span>
          <h1>Subtitle Studio</h1>
          <p>Transcripción, presentación IA, voz y exportación local rápida.</p>
        </div>
        <div className="subtitle-engine-badge">
          <Sparkles size={15} />
          <span>Gemini Creative Pipeline</span>
          <b>3.8 → fallback automático</b>
        </div>
      </header>

      <section className="subtitle-layout">
        <aside className="subtitle-sidebar">
          <div className="subtitle-card">
            <h2>1. Video</h2>
            {renderVideoControls()}
            {renderGeminiSettings()}
          </div>

          {videoMode === 'without_voice' && <div className="subtitle-card">
            <h2>2. Presentación IA</h2>
            {renderVoiceControls()}
          </div>}

          <div className="subtitle-card">
            <h2>{videoMode === 'without_voice' ? '3' : '2'}. Estilo</h2>
            {renderPresetControls()}
            {renderTextControls()}
          </div>

          <button
            className={primaryMode === 'export' ? 'subtitle-export' : 'subtitle-export generate'}
            disabled={primaryDisabled}
            onClick={() => void runPrimaryAction()}
          >
            {primaryIcon}
            {primaryLabel}
          </button>

          {exporting && <div className="subtitle-export-status">
            <span>{localExport.message}</span>
            <div><i style={{ width: `${Math.round(localExport.progress * 100)}%` }} /></div>
          </div>}
          {error && <div className="subtitle-error">{error}</div>}

          <details className="subtitle-desktop-logs" onToggle={(event) => {
            if ((event.currentTarget as HTMLDetailsElement).open) void refreshLogs()
          }}>
            <summary><SquareTerminal size={14} /> Logs IA</summary>
            {renderLogs()}
          </details>
        </aside>

        <section className="subtitle-preview-column">
          <div className="subtitle-preview-shell">{renderPreview(false)}</div>
          {renderNarrationTimeline()}
        </section>

        <aside className="subtitle-transcript">
          <div className="subtitle-transcript-head">
            <span><WandSparkles size={15} /> Transcripción</span>
            <small>{readyWords.length} palabras</small>
          </div>
          {renderTranscript()}
        </aside>
      </section>
    </section>}
  </main>
}
