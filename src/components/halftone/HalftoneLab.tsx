import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, ImagePlus, RotateCcw, Upload } from 'lucide-react'
import './halftone-lab.css'

type HalftoneMode = 'alpha' | 'luminance'
type PreviewBackground = 'checker' | 'black' | 'white'
type DotShape = 'circle' | 'square'
type InkMode = 'source' | 'white' | 'black'

type Settings = {
  mode: HalftoneMode
  cellSize: number
  dotScale: number
  angle: number
  contrast: number
  invert: boolean
  alphaCutoff: number
  shape: DotShape
  ink: InkMode
}

const DEFAULT_SETTINGS: Settings = {
  mode: 'alpha',
  cellSize: 12,
  dotScale: 1,
  angle: 45,
  contrast: 0,
  invert: false,
  alphaCutoff: 2,
  shape: 'circle',
  ink: 'source',
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

function contrastValue(value: number, contrast: number) {
  const factor = Math.pow(2, contrast / 50)
  return clamp01(0.5 + (value - 0.5) * factor)
}

function renderHalftone(
  target: HTMLCanvasElement,
  image: HTMLImageElement,
  settings: Settings,
  width: number,
  height: number,
  sourceScale: number,
) {
  const ctx = target.getContext('2d', { alpha: true })
  if (!ctx || width < 1 || height < 1) return

  target.width = width
  target.height = height
  ctx.clearRect(0, 0, width, height)

  const source = document.createElement('canvas')
  source.width = width
  source.height = height
  const sourceCtx = source.getContext('2d', { willReadFrequently: true })
  if (!sourceCtx) return

  sourceCtx.clearRect(0, 0, width, height)
  sourceCtx.drawImage(image, 0, 0, width, height)
  const pixels = sourceCtx.getImageData(0, 0, width, height).data

  const cell = Math.max(2, settings.cellSize * sourceScale)
  const maxRadius = (cell * 0.5) * settings.dotScale
  const radians = (settings.angle * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const cx = width / 2
  const cy = height / 2
  const diagonal = Math.hypot(width, height) + cell * 4
  const alphaCutoff = settings.alphaCutoff / 100

  ctx.save()

  for (let gy = -diagonal / 2; gy <= diagonal / 2; gy += cell) {
    for (let gx = -diagonal / 2; gx <= diagonal / 2; gx += cell) {
      const x = cx + gx * cos - gy * sin
      const y = cy + gx * sin + gy * cos
      const sx = Math.round(x)
      const sy = Math.round(y)

      if (sx < 0 || sx >= width || sy < 0 || sy >= height) continue

      const index = (sy * width + sx) * 4
      const r = pixels[index]
      const g = pixels[index + 1]
      const b = pixels[index + 2]
      const alpha = pixels[index + 3] / 255
      if (alpha <= alphaCutoff) continue

      let tone: number
      if (settings.mode === 'alpha') {
        tone = (alpha - alphaCutoff) / Math.max(0.0001, 1 - alphaCutoff)
        if (settings.invert) tone = 1 - tone
      } else {
        const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
        tone = settings.invert ? luminance : 1 - luminance
        tone *= alpha
      }

      tone = contrastValue(clamp01(tone), settings.contrast)
      if (tone <= 0.002) continue

      // Radius grows by sqrt(tone), so dot AREA tracks tonal density more naturally.
      const radius = maxRadius * Math.sqrt(tone)
      if (radius < 0.2) continue

      if (settings.ink === 'source') {
        ctx.fillStyle = `rgb(${r} ${g} ${b})`
      } else {
        ctx.fillStyle = settings.ink === 'white' ? '#ffffff' : '#000000'
      }

      if (settings.shape === 'square') {
        const side = radius * 2
        ctx.fillRect(x - radius, y - radius, side, side)
      } else {
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  ctx.restore()
}

function RangeControl({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange: (value: number) => void
}) {
  return (
    <label className="hl-control">
      <span className="hl-control__header">
        <span>{label}</span>
        <strong>{value}{suffix}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

export function HalftoneLab() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [previewBackground, setPreviewBackground] = useState<PreviewBackground>('checker')
  const [fileName, setFileName] = useState('')
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null)
  const [imageVersion, setImageVersion] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')

  const updateSetting = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }))
  }, [])

  const loadFile = useCallback((file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Ese archivo no parece ser una imagen válida.')
      return
    }

    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      imageRef.current = image
      setFileName(file.name)
      setDimensions({ width: image.naturalWidth, height: image.naturalHeight })
      setImageVersion((value) => value + 1)
      setError('')
      URL.revokeObjectURL(objectUrl)
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      setError('No se pudo abrir la imagen.')
    }
    image.src = objectUrl
  }, [])

  const previewSize = useMemo(() => {
    if (!dimensions) return null
    const maxWidth = 1100
    const maxHeight = 760
    const scale = Math.min(1, maxWidth / dimensions.width, maxHeight / dimensions.height)
    return {
      width: Math.max(1, Math.round(dimensions.width * scale)),
      height: Math.max(1, Math.round(dimensions.height * scale)),
      scale,
    }
  }, [dimensions])

  useEffect(() => {
    const canvas = previewCanvasRef.current
    const image = imageRef.current
    if (!canvas || !image || !previewSize) return

    const frame = requestAnimationFrame(() => {
      renderHalftone(
        canvas,
        image,
        settings,
        previewSize.width,
        previewSize.height,
        previewSize.scale,
      )
    })

    return () => cancelAnimationFrame(frame)
  }, [settings, previewSize, imageVersion])

  const exportPng = useCallback(() => {
    const image = imageRef.current
    if (!image || !dimensions || exporting) return

    setExporting(true)
    setError('')

    window.setTimeout(() => {
      try {
        const canvas = document.createElement('canvas')
        renderHalftone(canvas, image, settings, dimensions.width, dimensions.height, 1)
        canvas.toBlob((blob) => {
          if (!blob) {
            setError('El navegador no pudo crear el PNG.')
            setExporting(false)
            return
          }

          const url = URL.createObjectURL(blob)
          const anchor = document.createElement('a')
          const stem = fileName.replace(/\.[^.]+$/, '') || 'design'
          anchor.href = url
          anchor.download = `${stem}-halftone.png`
          document.body.appendChild(anchor)
          anchor.click()
          anchor.remove()
          URL.revokeObjectURL(url)
          setExporting(false)
        }, 'image/png')
      } catch (caught) {
        console.error(caught)
        setError('La exportación falló. Prueba con una imagen más pequeña o un tamaño de punto mayor.')
        setExporting(false)
      }
    }, 20)
  }, [dimensions, exporting, fileName, settings])

  const resetSettings = () => setSettings(DEFAULT_SETTINGS)

  return (
    <main className="halftone-lab">
      <header className="hl-topbar">
        <div>
          <span className="hl-eyebrow">GAS3D · PRINT TOOLS</span>
          <h1>Halftone Lab</h1>
          <p>Convierte PNG transparentes en semitono directamente en tu navegador.</p>
        </div>
        <a className="hl-back" href="/">Volver a GAS3D</a>
      </header>

      <section className="hl-layout">
        <aside className="hl-panel hl-controls-panel">
          <div className="hl-panel__title">
            <div>
              <span className="hl-kicker">01</span>
              <h2>Imagen</h2>
            </div>
          </div>

          <button className="hl-upload" type="button" onClick={() => fileInputRef.current?.click()}>
            <Upload size={18} />
            {fileName ? 'Cambiar imagen' : 'Cargar PNG / JPG'}
          </button>
          <input
            ref={fileInputRef}
            className="hl-hidden-input"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => loadFile(event.target.files?.[0])}
          />

          {dimensions && (
            <div className="hl-file-meta">
              <span title={fileName}>{fileName}</span>
              <strong>{dimensions.width} × {dimensions.height}px</strong>
            </div>
          )}

          <div className="hl-divider" />

          <div className="hl-panel__title">
            <div>
              <span className="hl-kicker">02</span>
              <h2>Semitono</h2>
            </div>
            <button className="hl-icon-button" type="button" onClick={resetSettings} title="Restablecer controles">
              <RotateCcw size={16} />
            </button>
          </div>

          <label className="hl-field">
            <span>Fuente del semitono</span>
            <select value={settings.mode} onChange={(event) => updateSetting('mode', event.target.value as HalftoneMode)}>
              <option value="alpha">Transparencia / Alpha</option>
              <option value="luminance">Luminosidad / Sombras</option>
            </select>
          </label>

          <div className="hl-two-columns">
            <label className="hl-field">
              <span>Forma</span>
              <select value={settings.shape} onChange={(event) => updateSetting('shape', event.target.value as DotShape)}>
                <option value="circle">Círculo</option>
                <option value="square">Cuadrado</option>
              </select>
            </label>
            <label className="hl-field">
              <span>Tinta</span>
              <select value={settings.ink} onChange={(event) => updateSetting('ink', event.target.value as InkMode)}>
                <option value="source">Color original</option>
                <option value="white">Blanco</option>
                <option value="black">Negro</option>
              </select>
            </label>
          </div>

          <RangeControl label="Celda / separación" value={settings.cellSize} min={4} max={48} suffix=" px" onChange={(value) => updateSetting('cellSize', value)} />
          <RangeControl label="Escala del punto" value={settings.dotScale} min={0.25} max={1.4} step={0.05} suffix="×" onChange={(value) => updateSetting('dotScale', value)} />
          <RangeControl label="Ángulo de trama" value={settings.angle} min={0} max={90} suffix="°" onChange={(value) => updateSetting('angle', value)} />
          <RangeControl label="Contraste" value={settings.contrast} min={-100} max={100} onChange={(value) => updateSetting('contrast', value)} />
          <RangeControl label="Corte de alpha" value={settings.alphaCutoff} min={0} max={30} suffix="%" onChange={(value) => updateSetting('alphaCutoff', value)} />

          <label className="hl-switch-row">
            <span>
              <strong>Invertir trama</strong>
              <small>Cambia qué tonos generan los puntos grandes.</small>
            </span>
            <input type="checkbox" checked={settings.invert} onChange={(event) => updateSetting('invert', event.target.checked)} />
          </label>

          <div className="hl-note">
            <strong>Consejo para tus PNG:</strong> usa <em>Alpha</em> para transformar transparencias y degradados; usa <em>Luminosidad</em> cuando quieras convertir sombras internas en semitono.
          </div>
        </aside>

        <section className="hl-panel hl-preview-panel">
          <div className="hl-preview-toolbar">
            <div>
              <span className="hl-kicker">03</span>
              <h2>Previsualización</h2>
            </div>
            <div className="hl-bg-switcher" aria-label="Fondo de previsualización">
              <button type="button" className={previewBackground === 'checker' ? 'is-active' : ''} onClick={() => setPreviewBackground('checker')}>Transp.</button>
              <button type="button" className={previewBackground === 'black' ? 'is-active' : ''} onClick={() => setPreviewBackground('black')}>Negro</button>
              <button type="button" className={previewBackground === 'white' ? 'is-active' : ''} onClick={() => setPreviewBackground('white')}>Blanco</button>
            </div>
          </div>

          <div
            className={`hl-canvas-stage hl-canvas-stage--${previewBackground} ${dragging ? 'is-dragging' : ''}`}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              loadFile(event.dataTransfer.files?.[0])
            }}
          >
            {dimensions ? (
              <canvas ref={previewCanvasRef} className="hl-preview-canvas" />
            ) : (
              <button className="hl-empty-state" type="button" onClick={() => fileInputRef.current?.click()}>
                <ImagePlus size={38} />
                <strong>Arrastra un PNG aquí</strong>
                <span>o haz clic para seleccionar una imagen</span>
              </button>
            )}
          </div>

          {error && <div className="hl-error">{error}</div>}

          <footer className="hl-export-bar">
            <div>
              <strong>PNG transparente</strong>
              <span>La vista negra/blanca es sólo una previsualización; no se exporta el fondo.</span>
            </div>
            <button className="hl-export-button" type="button" disabled={!dimensions || exporting} onClick={exportPng}>
              <Download size={18} />
              {exporting ? 'Procesando…' : 'Exportar PNG'}
            </button>
          </footer>
        </section>
      </section>
    </main>
  )
}
