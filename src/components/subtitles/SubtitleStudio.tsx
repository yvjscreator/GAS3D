import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Download, FileVideo2, LoaderCircle, Sparkles, Upload, WandSparkles } from 'lucide-react'
import { createSubtitleJob, exportSubtitleVideo, getSubtitleJob } from './api'
import type { SubtitleCaption, SubtitleExportOptions, SubtitleJob, SubtitleWord } from './types'
import './subtitleStudio.css'

const statusLabel: Record<SubtitleJob['status'], string> = {
  queued: 'En cola',
  transcribing: 'Transcribiendo',
  ready: 'Listo',
  error: 'Error',
}

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
  const minutes = Math.floor(seconds / 60)
  const rest = Math.max(0, seconds - minutes * 60)
  return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`
}

export function SubtitleStudio() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [language, setLanguage] = useState('auto')
  const [job, setJob] = useState<SubtitleJob | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wordOverrides, setWordOverrides] = useState<Record<number, string>>({})
  const [baseColor, setBaseColor] = useState('#FFFFFF')
  const [activeColor, setActiveColor] = useState('#FFE347')
  const [outlineColor, setOutlineColor] = useState('#000000')
  const [fontScale, setFontScale] = useState(6)
  const [position, setPosition] = useState<SubtitleExportOptions['position']>('bottom')
  const [maxWords, setMaxWords] = useState(5)
  const [uppercase, setUppercase] = useState(false)

  useEffect(() => () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl)
  }, [videoUrl])

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
    if (!playing) return
    let frame = 0
    const tick = () => {
      if (videoRef.current) setCurrentTime(videoRef.current.currentTime)
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

  const chooseFile = async (nextFile: File | null) => {
    if (!nextFile) return
    setError(null)
    setJob(null)
    setWordOverrides({})
    setCurrentTime(0)
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    setFile(nextFile)
    setVideoUrl(URL.createObjectURL(nextFile))
    setUploading(true)
    try {
      const nextJob = await createSubtitleJob(nextFile, language)
      setJob(nextJob)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo iniciar la transcripción.')
    } finally {
      setUploading(false)
    }
  }

  const exportVideo = async () => {
    if (!job || job.status !== 'ready') return
    setExporting(true)
    setError(null)
    try {
      const blob = await exportSubtitleVideo(job.id, {
        baseColor,
        activeColor,
        outlineColor,
        fontScale,
        position,
        maxWords,
        uppercase,
        wordOverrides,
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      const original = file?.name.replace(/\.[^.]+$/, '') || 'video'
      anchor.href = url
      anchor.download = `${original}-subtitulado.mp4`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo exportar el video.')
    } finally {
      setExporting(false)
    }
  }

  const seekToCaption = (caption: SubtitleCaption) => {
    if (!videoRef.current) return
    videoRef.current.currentTime = caption.start
    setCurrentTime(caption.start)
  }

  const resolvedWord = (word: SubtitleWord) => {
    const text = wordOverrides[word.id] ?? word.text
    return uppercase ? text.toUpperCase() : text
  }

  return <main className="subtitle-studio">
    <header className="subtitle-header">
      <div>
        <span className="subtitle-kicker">GAS3D · herramienta aislada</span>
        <h1>Subtitle Studio</h1>
        <p>Subtítulos sincronizados palabra a palabra, listos para redes sociales.</p>
      </div>
      <div className="subtitle-engine-badge"><Sparkles size={15} /><span>Whisper large-v3</span><b>alta precisión</b></div>
    </header>

    <section className="subtitle-layout">
      <aside className="subtitle-sidebar">
        <div className="subtitle-card">
          <h2>1. Video</h2>
          <label className="subtitle-upload">
            <Upload size={20} />
            <span>{file ? file.name : 'Seleccionar video'}</span>
            <small>Se conserva la resolución y el FPS originales.</small>
            <input type="file" accept="video/*" onChange={(event) => void chooseFile(event.target.files?.[0] ?? null)} />
          </label>
          <label className="subtitle-field">
            <span>Idioma</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value)} disabled={uploading || Boolean(job)}>
              <option value="auto">Detectar automáticamente</option>
              <option value="es">Español</option>
              <option value="en">Inglés</option>
              <option value="de">Alemán</option>
              <option value="fr">Francés</option>
              <option value="it">Italiano</option>
              <option value="pt">Portugués</option>
            </select>
          </label>
          {job && <div className={`subtitle-job-status ${job.status}`}>
            {job.status === 'ready' ? <CheckCircle2 size={16} /> : <LoaderCircle size={16} className={job.status !== 'error' ? 'spin' : ''} />}
            <span><strong>{statusLabel[job.status]}</strong><small>{job.message}</small></span>
            <b>{Math.round(job.progress * 100)}%</b>
          </div>}
          {job?.width && job.height && <p className="subtitle-meta">{job.width}×{job.height}{job.fps ? ` · ${job.fps.toFixed(2)} FPS` : ''}{job.duration ? ` · ${formatTime(job.duration)}` : ''}</p>}
        </div>

        <div className="subtitle-card">
          <h2>2. Estilo</h2>
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
        </div>

        <button className="subtitle-export" disabled={!job || job.status !== 'ready' || exporting} onClick={() => void exportVideo()}>
          {exporting ? <LoaderCircle size={18} className="spin" /> : <Download size={18} />}
          {exporting ? 'Exportando…' : 'Exportar MP4 sin marca de agua'}
        </button>
        {error && <div className="subtitle-error">{error}</div>}
      </aside>

      <section className="subtitle-preview-column">
        <div className="subtitle-preview-shell">
          {videoUrl ? <div className="subtitle-video-frame">
            <video ref={videoRef} src={videoUrl} controls playsInline onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onSeeked={(event) => setCurrentTime(event.currentTarget.currentTime)} />
            {activeCaption && <div className={`subtitle-overlay ${position}`} style={{ '--subtitle-size': `${Math.max(20, fontScale * 6)}px`, '--subtitle-outline': outlineColor } as React.CSSProperties}>
              <div>{activeCaption.wordIds.map((id) => {
                const word = wordsById.get(id)
                if (!word) return null
                return <span key={id} className={id === activeWordId ? 'active' : ''} style={{ color: id === activeWordId ? activeColor : baseColor }}>{resolvedWord(word)}</span>
              })}</div>
            </div>}
          </div> : <div className="subtitle-empty-preview"><FileVideo2 size={42} /><strong>Cargá un video para comenzar</strong><span>La previsualización mostrará el resaltado palabra por palabra.</span></div>}
        </div>
      </section>

      <aside className="subtitle-transcript">
        <div className="subtitle-transcript-head">
          <span><WandSparkles size={15} /> Transcripción</span>
          <small>{job?.words.length ?? 0} palabras</small>
        </div>
        {!job || job.status !== 'ready' ? <div className="subtitle-transcript-empty">Cuando termine Whisper, vas a poder revisar y corregir cada palabra antes de exportar.</div> :
          <div className="subtitle-caption-list">
            {captions.map((caption) => <article key={caption.id} onClick={() => seekToCaption(caption)}>
              <time>{formatTime(caption.start)}</time>
              <div>{caption.wordIds.map((id) => {
                const word = wordsById.get(id)
                if (!word) return null
                return <input key={id} value={wordOverrides[id] ?? word.text} onClick={(event) => event.stopPropagation()} onChange={(event) => setWordOverrides((current) => ({ ...current, [id]: event.target.value }))} aria-label={`Corregir palabra ${word.text}`} />
              })}</div>
            </article>)}
          </div>}
      </aside>
    </section>
  </main>
}
