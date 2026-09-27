import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Download,
  FileVideo2,
  Languages,
  LoaderCircle,
  Palette,
  Play,
  Sparkles,
  Type,
  Upload,
  WandSparkles,
  X,
} from 'lucide-react'
import {
  createSubtitleJob,
  downloadSubtitleExport,
  getSubtitleExport,
  getSubtitleJob,
  startSubtitleExport,
} from './api'
import type {
  SubtitleCaption,
  SubtitleExportJob,
  SubtitleExportOptions,
  SubtitleJob,
  SubtitlePresetId,
  SubtitleSavedSession,
  SubtitleWord,
} from './types'
import { getSubtitlePreset, subtitlePresets } from './presets'
import {
  clearSubtitleSession,
  clearSubtitleVideo,
  loadSubtitleSession,
  loadSubtitleVideo,
  saveSubtitleSession,
  saveSubtitleVideo,
} from './storage'
import './subtitleStudio.css'

const statusLabel: Record<SubtitleJob['status'], string> = {
  queued: 'En cola',
  transcribing: 'Transcribiendo',
  ready: 'Listo',
  error: 'Error',
}

type MobilePanel = 'main' | 'video' | 'style' | 'text' | 'transcript'

const groupWords = (words: SubtitleWord[], maxWords: number): SubtitleCaption[] => {
  const groups: SubtitleCaption[] = []
  let current: SubtitleWord[] = []
  const flush = () => {
    if (!current.length) return
    groups.push({
      id: groups.length,
      start: current[0].start,
      end: current[current.length - 1].end,
      wordIds: current.map((word) => word.id),
    })
    current = []
  }
  for (const word of words) {
    const previous = current[current.length - 1]
    if (previous && word.start - previous.end > 0.7) flush()
    current.push(word)
    if (current.length >= maxWords || /[.!?…]$/.test(word.text)) flush()
  }
  flush()
  return groups
}

const formatTime = (seconds: number) => {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  const minutes = Math.floor(safe / 60)
  const rest = safe - minutes * 60
  return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`
}

export function SubtitleStudio() {
  const mobileVideoRef = useRef<HTMLVideoElement | null>(null)
  const desktopVideoRef = useRef<HTMLVideoElement | null>(null)
  const restoredRef = useRef(false)
  const [file, setFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [mediaDuration, setMediaDuration] = useState(0)
  const [language, setLanguage] = useState('auto')
  const [job, setJob] = useState<SubtitleJob | null>(null)
  const [exportJob, setExportJob] = useState<SubtitleExportJob | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [restoring, setRestoring] = useState(true)
  const [hydrated, setHydrated] = useState(false)
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('main')
  const [error, setError] = useState<string | null>(null)
  const [storageNotice, setStorageNotice] = useState<string | null>(null)
  const [wordOverrides, setWordOverrides] = useState<Record<number, string>>({})
  const [preset, setPreset] = useState<SubtitlePresetId>('viral')
  const [baseColor, setBaseColor] = useState('#FFFFFF')
  const [activeColor, setActiveColor] = useState('#FFE347')
  const [outlineColor, setOutlineColor] = useState('#000000')
  const [fontScale, setFontScale] = useState(6)
  const [position, setPosition] = useState<SubtitleExportOptions['position']>('bottom')
  const [maxWords, setMaxWords] = useState(5)
  const [uppercase, setUppercase] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 720px)').matches)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 720px)')
    const sync = () => setIsMobile(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true

    const restore = async () => {
      const saved = loadSubtitleSession()
      if (saved) {
        setLanguage(saved.language)
        setJob(saved.job)
        setExportJob(saved.exportJob)
        setWordOverrides(saved.wordOverrides ?? {})
        setPreset(saved.preset)
        setBaseColor(saved.baseColor)
        setActiveColor(saved.activeColor)
        setOutlineColor(saved.outlineColor)
        setFontScale(saved.fontScale)
        setPosition(saved.position)
        setMaxWords(saved.maxWords)
        setUppercase(saved.uppercase)
      }

      try {
        const restoredVideo = await loadSubtitleVideo()
        if (restoredVideo) {
          setFile(restoredVideo)
          setVideoUrl(URL.createObjectURL(restoredVideo))
          setStorageNotice('Proyecto restaurado automáticamente.')
        } else if (saved?.job) {
          setStorageNotice('Se restauró la transcripción. Para previsualizar el video tendrás que volver a seleccionarlo.')
        }
      } catch {
        if (saved?.job) setStorageNotice('Se restauró la transcripción, pero el navegador no conservó el archivo de video.')
      } finally {
        setRestoring(false)
        setHydrated(true)
      }
    }

    void restore()
  }, [])

  useEffect(() => () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl)
  }, [videoUrl])

  useEffect(() => {
    if (!hydrated) return
    const session: SubtitleSavedSession = {
      version: 2,
      language,
      job,
      exportJob,
      wordOverrides,
      preset,
      baseColor,
      activeColor,
      outlineColor,
      fontScale,
      position,
      maxWords,
      uppercase,
      fileName: file?.name ?? job?.fileName ?? null,
    }
    saveSubtitleSession(session)
  }, [
    hydrated,
    language,
    job,
    exportJob,
    wordOverrides,
    preset,
    baseColor,
    activeColor,
    outlineColor,
    fontScale,
    position,
    maxWords,
    uppercase,
    file?.name,
  ])

  useEffect(() => {
    if (!job || !['queued', 'transcribing'].includes(job.status)) return
    const timer = window.setInterval(async () => {
      try {
        const next = await getSubtitleJob(job.id)
        setJob(next)
        if (next.status === 'error') setError(next.error ?? next.message)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'No se pudo consultar la transcripción.')
      }
    }, 1200)
    return () => window.clearInterval(timer)
  }, [job?.id, job?.status])

  useEffect(() => {
    if (!exportJob || !['queued', 'exporting'].includes(exportJob.status)) return
    const timer = window.setInterval(async () => {
      try {
        const next = await getSubtitleExport(exportJob.id)
        setExportJob(next)
        if (next.status === 'error') setError(next.error ?? next.message)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'No se pudo consultar la exportación.')
      }
    }, 1200)
    return () => window.clearInterval(timer)
  }, [exportJob?.id, exportJob?.status])

  useEffect(() => {
    if (!playing) return
    let frame = 0
    const tick = () => {
      const video = window.matchMedia('(max-width: 720px)').matches ? mobileVideoRef.current : desktopVideoRef.current
      if (video) setCurrentTime(video.currentTime)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing])

  const captions = useMemo(() => groupWords(job?.words ?? [], maxWords), [job?.words, maxWords])
  const wordsById = useMemo(() => new Map((job?.words ?? []).map((word) => [word.id, word])), [job?.words])
  const activeCaption = captions.find((caption) => currentTime >= caption.start - 0.05 && currentTime <= caption.end + 0.35) ?? null
  const activeWordId = activeCaption?.wordIds.find((id, index, ids) => {
    const word = wordsById.get(id)
    const next = wordsById.get(ids[index + 1])
    if (!word) return false
    const boundary = next?.start ?? activeCaption.end + 0.25
    return currentTime >= word.start - 0.03 && currentTime < boundary
  }) ?? null

  const duration = Math.max(job?.duration ?? 0, mediaDuration)
  const transcribing = Boolean(job && ['queued', 'transcribing'].includes(job.status))
  const exporting = Boolean(exportJob && ['queued', 'exporting'].includes(exportJob.status))

  const chooseFile = async (nextFile: File | null) => {
    if (!nextFile) return
    setError(null)
    setStorageNotice(null)
    setJob(null)
    setExportJob(null)
    setWordOverrides({})
    setCurrentTime(0)
    setMediaDuration(0)
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    setFile(nextFile)
    setVideoUrl(URL.createObjectURL(nextFile))

    try {
      await saveSubtitleVideo(nextFile)
      setStorageNotice('Video guardado en este dispositivo para recuperar el proyecto.')
    } catch {
      setStorageNotice('El navegador no pudo guardar una copia local del video. El resto del proyecto sí se conservará.')
    }
  }

  const startTranscription = async () => {
    if (!file) {
      setError('Selecciona un video antes de iniciar la transcripción.')
      return
    }
    setError(null)
    setUploading(true)
    setExportJob(null)
    setWordOverrides({})
    try {
      const nextJob = await createSubtitleJob(file, language)
      setJob(nextJob)
      setMobilePanel('main')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo iniciar la transcripción.')
    } finally {
      setUploading(false)
    }
  }

  const resetProject = async () => {
    setError(null)
    setStorageNotice(null)
    setJob(null)
    setExportJob(null)
    setWordOverrides({})
    setFile(null)
    setCurrentTime(0)
    setMediaDuration(0)
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    setVideoUrl(null)
    clearSubtitleSession()
    try {
      await clearSubtitleVideo()
    } catch {
      // Nothing else to do.
    }
  }

  const applyPreset = (id: SubtitlePresetId) => {
    const selected = getSubtitlePreset(id)
    setPreset(id)
    setBaseColor(selected.options.baseColor)
    setActiveColor(selected.options.activeColor)
    setOutlineColor(selected.options.outlineColor)
    setFontScale(selected.options.fontScale)
    setPosition(selected.options.position)
    setMaxWords(selected.options.maxWords)
    setUppercase(selected.options.uppercase)
  }

  const downloadExport = async (currentExport: SubtitleExportJob) => {
    setError(null)
    try {
      const blob = await downloadSubtitleExport(currentExport.id)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      const original = file?.name.replace(/\.[^.]+$/, '') || job?.fileName.replace(/\.[^.]+$/, '') || 'video'
      anchor.href = url
      anchor.download = currentExport.fileName ?? `${original}-subtitulado.mp4`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo descargar el video.')
    }
  }

  const exportVideo = async () => {
    if (!job || job.status !== 'ready') return
    if (exportJob?.status === 'ready') {
      await downloadExport(exportJob)
      return
    }

    setError(null)
    try {
      const next = await startSubtitleExport(job.id, {
        preset,
        baseColor,
        activeColor,
        outlineColor,
        fontScale,
        position,
        maxWords,
        uppercase,
        wordOverrides,
      })
      setExportJob(next)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo iniciar la exportación.')
    }
  }

  const seekTo = (time: number) => {
    const safe = Math.min(Math.max(time, 0), duration || 0)
    const video = window.matchMedia('(max-width: 720px)').matches ? mobileVideoRef.current : desktopVideoRef.current
    if (video) video.currentTime = safe
    setCurrentTime(safe)
  }

  const seekToCaption = (caption: SubtitleCaption) => seekTo(caption.start)

  const togglePlayback = () => {
    const video = window.matchMedia('(max-width: 720px)').matches ? mobileVideoRef.current : desktopVideoRef.current
    if (!video) return
    if (video.paused) void video.play()
    else video.pause()
  }

  const resolvedWord = (word: SubtitleWord) => {
    const text = wordOverrides[word.id] ?? word.text
    return uppercase ? text.toUpperCase() : text
  }

  const renderPreview = (mobile = false) => videoUrl ? (
    <div className={mobile ? 'subtitle-video-frame mobile' : 'subtitle-video-frame'}>
      <video
        ref={mobile ? mobileVideoRef : desktopVideoRef}
        src={videoUrl}
        controls={!mobile}
        playsInline
        onLoadedMetadata={(event) => setMediaDuration(event.currentTarget.duration || 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onSeeked={(event) => setCurrentTime(event.currentTarget.currentTime)}
      />
      {activeCaption && <div
        className={`subtitle-overlay ${position} preset-${preset}`}
        style={{ '--subtitle-size': `${Math.max(20, fontScale * (mobile ? 5 : 6))}px`, '--subtitle-outline': outlineColor } as CSSProperties}
      >
        <div>{activeCaption.wordIds.map((id) => {
          const word = wordsById.get(id)
          if (!word) return null
          return <span key={id} className={id === activeWordId ? 'active' : ''} style={{ color: id === activeWordId ? activeColor : baseColor }}>{resolvedWord(word)}</span>
        })}</div>
      </div>}
    </div>
  ) : (
    <div className="subtitle-empty-preview">
      <FileVideo2 size={42} />
      <strong>{restoring ? 'Restaurando proyecto…' : 'Selecciona un video'}</strong>
      <span>Después podrás elegir el idioma y comenzar cuando quieras.</span>
    </div>
  )

  const renderStatus = () => job ? <div className={`subtitle-job-status ${job.status}`}>
    {job.status === 'ready' ? <CheckCircle2 size={16} /> : <LoaderCircle size={16} className={job.status !== 'error' ? 'spin' : ''} />}
    <span><strong>{statusLabel[job.status]}</strong><small>{job.message}</small></span>
    <b>{Math.round(job.progress * 100)}%</b>
  </div> : null

  const renderVideoControls = () => <div className="subtitle-video-controls">
    <label className="subtitle-upload">
      <Upload size={20} />
      <span>{file ? file.name : 'Seleccionar video'}</span>
      <small>Elegir el archivo no inicia la transcripción.</small>
      <input type="file" accept="video/*" onChange={(event) => void chooseFile(event.target.files?.[0] ?? null)} />
    </label>

    <label className="subtitle-field">
      <span>Idioma del video</span>
      <select value={language} onChange={(event) => setLanguage(event.target.value)}>
        <option value="auto">Detectar automáticamente</option>
        <option value="es">Español</option>
        <option value="en">Inglés</option>
        <option value="de">Alemán</option>
        <option value="fr">Francés</option>
        <option value="it">Italiano</option>
        <option value="pt">Portugués</option>
      </select>
    </label>

    <button className="subtitle-transcribe-button" disabled={!file || uploading || transcribing} onClick={() => void startTranscription()}>
      {uploading || transcribing ? <LoaderCircle size={17} className="spin" /> : <Sparkles size={17} />}
      {uploading ? 'Subiendo video…' : transcribing ? 'Transcribiendo…' : job?.status === 'ready' ? 'Volver a transcribir' : 'Generar subtítulos'}
    </button>

    {renderStatus()}
    {job?.width && job.height && <p className="subtitle-meta">{job.width}×{job.height}{job.fps ? ` · ${job.fps.toFixed(2)} FPS` : ''}{job.duration ? ` · ${formatTime(job.duration)}` : ''}</p>}
    {storageNotice && <p className="subtitle-storage-note">{storageNotice}</p>}
    {(file || job) && <button className="subtitle-reset-project" onClick={() => void resetProject()}>Nuevo proyecto</button>}
  </div>

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

  const renderTextControls = () => <>
    <div className="subtitle-color-grid">
      <label><span>Texto</span><input type="color" value={baseColor} onChange={(event) => setBaseColor(event.target.value)} /></label>
      <label><span>Palabra activa</span><input type="color" value={activeColor} onChange={(event) => setActiveColor(event.target.value)} /></label>
      <label><span>Contorno</span><input type="color" value={outlineColor} onChange={(event) => setOutlineColor(event.target.value)} /></label>
    </div>
    <label className="subtitle-field">
      <span>Tamaño <b>{fontScale}%</b></span>
      <input type="range" min="3.5" max="10" step="0.5" value={fontScale} onChange={(event) => setFontScale(Number(event.target.value))} />
    </label>
    <label className="subtitle-field">
      <span>Palabras por bloque <b>{maxWords}</b></span>
      <input type="range" min="2" max="8" step="1" value={maxWords} onChange={(event) => setMaxWords(Number(event.target.value))} />
    </label>
    <div className="subtitle-segmented">
      {(['top', 'center', 'bottom'] as const).map((value) => <button key={value} className={position === value ? 'active' : ''} onClick={() => setPosition(value)}>{value === 'top' ? 'Arriba' : value === 'center' ? 'Centro' : 'Abajo'}</button>)}
    </div>
    <label className="subtitle-checkbox"><input type="checkbox" checked={uppercase} onChange={(event) => setUppercase(event.target.checked)} /><span>Todo en mayúsculas</span></label>
  </>

  const renderTranscript = () => !job || job.status !== 'ready' ? (
    <div className="subtitle-transcript-empty">{transcribing ? 'Gemini está generando los timestamps palabra por palabra…' : 'Genera los subtítulos para poder revisar y corregir cada palabra.'}</div>
  ) : (
    <div className="subtitle-caption-list">
      {captions.map((caption) => <article key={caption.id} onClick={() => seekToCaption(caption)}>
        <time>{formatTime(caption.start)}</time>
        <div>{caption.wordIds.map((id) => {
          const word = wordsById.get(id)
          if (!word) return null
          return <input
            key={id}
            value={wordOverrides[id] ?? word.text}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => setWordOverrides((current) => ({ ...current, [id]: event.target.value }))}
            aria-label={`Corregir palabra ${word.text}`}
          />
        })}</div>
      </article>)}
    </div>
  )

  const exportLabel = exportJob?.status === 'ready'
    ? 'Descargar MP4'
    : exporting
      ? `Exportando ${Math.round((exportJob?.progress ?? 0) * 100)}%`
      : 'Exportar MP4'

  const renderMobilePanel = () => {
    if (mobilePanel === 'main') {
      return <nav className="subtitle-mobile-tools" aria-label="Herramientas de subtítulos">
        <button onClick={() => setMobilePanel('video')}><Upload size={24} /><span>Video</span></button>
        <button onClick={() => setMobilePanel('style')}><Palette size={24} /><span>Estilo</span></button>
        <button onClick={() => setMobilePanel('text')}><Type size={24} /><span>Texto</span></button>
        <button onClick={() => setMobilePanel('transcript')}><Languages size={24} /><span>Subtítulos</span></button>
      </nav>
    }

    const title = mobilePanel === 'video' ? 'Video e idioma' : mobilePanel === 'style' ? 'Estilo' : mobilePanel === 'text' ? 'Texto' : 'Transcripción'
    return <div className={`subtitle-mobile-panel panel-${mobilePanel}`}>
      <header>
        <button onClick={() => setMobilePanel('main')} aria-label="Cerrar opciones"><X size={22} /></button>
        <strong>{title}</strong>
        <button onClick={() => setMobilePanel('main')} aria-label="Aplicar"><Check size={23} /></button>
      </header>
      <div className="subtitle-mobile-panel-body">
        {mobilePanel === 'video' && renderVideoControls()}
        {mobilePanel === 'style' && <>
          <p className="subtitle-mobile-panel-note">Elige una base y luego personalízala en Texto.</p>
          {renderPresetControls()}
        </>}
        {mobilePanel === 'text' && renderTextControls()}
        {mobilePanel === 'transcript' && renderTranscript()}
      </div>
    </div>
  }

  return <main className="subtitle-studio">
    {isMobile ? <section className="subtitle-mobile-editor">
      <header className="subtitle-mobile-header">
        <button onClick={() => { window.location.hash = '' }} aria-label="Volver a 3D Studio"><ArrowLeft size={25} /></button>
        <strong>Subtitle Studio</strong>
        <button className="subtitle-mobile-export" disabled={!job || job.status !== 'ready' || exporting} onClick={() => void exportVideo()}>
          {exporting ? <LoaderCircle size={16} className="spin" /> : <Download size={17} />}
          <span>{exportJob?.status === 'ready' ? 'Descargar' : 'Exportar'}</span>
        </button>
      </header>

      <div className="subtitle-mobile-stage">
        {renderPreview(true)}
      </div>

      <div className="subtitle-mobile-transport">
        <button disabled={!videoUrl} onClick={togglePlayback} aria-label={playing ? 'Pausar' : 'Reproducir'}>
          {playing ? <span className="subtitle-pause-icon">Ⅱ</span> : <Play size={22} fill="currentColor" />}
        </button>
        <div className="subtitle-mobile-timeline">
          <div className="subtitle-mobile-track">
            {captions.map((caption) => duration > 0 ? <i
              key={caption.id}
              style={{ left: `${Math.min(100, caption.start / duration * 100)}%`, width: `${Math.max(1, (caption.end - caption.start) / duration * 100)}%` }}
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

      {error && <div className="subtitle-mobile-error">{error}</div>}
      {exportJob && exporting && <div className="subtitle-mobile-export-progress">
        <span>{exportJob.message}</span>
        <div><i style={{ width: `${Math.round(exportJob.progress * 100)}%` }} /></div>
      </div>}
      {exportJob?.status === 'ready' && <button className="subtitle-mobile-ready-download" onClick={() => void downloadExport(exportJob)}>
        <Download size={18} /> Video listo · descargar MP4
      </button>}

      <div className="subtitle-mobile-dock">
        {renderMobilePanel()}
      </div>
    </section> : <section className="subtitle-desktop-editor">
      <header className="subtitle-header">
        <div>
          <span className="subtitle-kicker">GAS3D · herramienta aislada</span>
          <h1>Subtitle Studio</h1>
          <p>Subtítulos sincronizados palabra a palabra, listos para redes sociales.</p>
        </div>
        <div className="subtitle-engine-badge"><Sparkles size={15} /><span>Gemini 3.5 Transcribe</span><b>timestamps por palabra</b></div>
      </header>

      <section className="subtitle-layout">
        <aside className="subtitle-sidebar">
          <div className="subtitle-card">
            <h2>1. Video e idioma</h2>
            {renderVideoControls()}
          </div>

          <div className="subtitle-card">
            <h2>2. Estilo</h2>
            {renderPresetControls()}
            <p className="subtitle-custom-hint">Usa un preset y después personaliza colores, tamaño y posición.</p>
            {renderTextControls()}
          </div>

          <button className="subtitle-export" disabled={!job || job.status !== 'ready' || exporting} onClick={() => void exportVideo()}>
            {exporting ? <LoaderCircle size={18} className="spin" /> : <Download size={18} />}
            {exportLabel}
          </button>
          {exportJob && exporting && <div className="subtitle-export-status">
            <span>{exportJob.message}</span>
            <div><i style={{ width: `${Math.round(exportJob.progress * 100)}%` }} /></div>
          </div>}
          {error && <div className="subtitle-error">{error}</div>}
        </aside>

        <section className="subtitle-preview-column">
          <div className="subtitle-preview-shell">
            {renderPreview(false)}
          </div>
        </section>

        <aside className="subtitle-transcript">
          <div className="subtitle-transcript-head">
            <span><WandSparkles size={15} /> Transcripción</span>
            <small>{job?.words.length ?? 0} palabras</small>
          </div>
          {renderTranscript()}
        </aside>
      </section>
    </section>}
  </main>
}
