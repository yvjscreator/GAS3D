import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { Download, Eye, ImagePlus, Maximize2, Minimize2, PanelRightClose, PanelRightOpen, RotateCcw, Shirt, Upload, X } from 'lucide-react'
import {
  imagePresets,
  removeFabricInk,
  type InkRemovalMode,
  type InkRemovalSettings,
  type ImagePreset,
  type ImagePreviewMode,
} from './imageProcessor'
import './imagesStudio.css'

const MAX_IMAGE_PIXELS = 30_000_000
const MAX_IMAGE_BYTES = 60 * 1024 * 1024
const PREVIEW_MAX_EDGE = 1300
const ZEN_KEY = 'gas3d.images.zen.v1'
const CONTROLS_KEY = 'gas3d.images.zen.controls.v1'
const INK_MODE_KEY = 'gas3d.images.ink-mode.v1'

const initialInkMode = (): InkRemovalMode => {
  try {
    return window.localStorage.getItem(INK_MODE_KEY) === 'white' ? 'white' : 'black'
  } catch {
    return 'black'
  }
}

const readPreference = (key: string, defaultValue: boolean) => {
  try {
    const value = window.localStorage.getItem(key)
    return value === null ? defaultValue : value === 'true'
  } catch {
    return defaultValue
  }
}
const numberFormatter = new Intl.NumberFormat('es')

const controls: Array<{
  key: keyof InkRemovalSettings
  title: string
  hint: string
  min: number
  max: number
  step: number
}> = [
  { key: 'blackThreshold', title: 'Eliminar negro', hint: 'Umbral del negro puro y casi negro.', min: 0, max: 90, step: 1 },
  { key: 'shadowThreshold', title: 'Eliminar sombras', hint: 'Extiende la transparencia a tonos oscuros.', min: 0, max: 210, step: 1 },
  { key: 'detailProtection', title: 'Preservar detalle', hint: 'Protege luces, contornos y trazos visibles.', min: 0, max: 100, step: 1 },
  { key: 'softness', title: 'Suavizar bordes', hint: 'Transición suave entre negro y transparencia.', min: 0, max: 50, step: 1 },
  { key: 'noiseCleanup', title: 'Limpiar ruido', hint: 'Retira pequeños puntos aislados de poca intensidad.', min: 0, max: 3, step: 1 },
]

const downloadName = (fileName: string, mode: InkRemovalMode) => {
  const stem = fileName.replace(/\.[^.]+$/, '') || 'art'
  return stem + (mode === 'black' ? '-black-tee-ready.png' : '-white-tee-ready.png')
}

export function ImagesStudio() {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const bitmapRef = useRef<ImageBitmap | null>(null)
  const uploadIdRef = useRef(0)

  const [file, setFile] = useState<File | null>(null)
  const [sourcePreview, setSourcePreview] = useState<ImageData | null>(null)
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null)
  const [inkMode, setInkMode] = useState<InkRemovalMode>(initialInkMode)
  const [preset, setPreset] = useState<ImagePreset | null>('balanced')
  const [settings, setSettings] = useState<InkRemovalSettings>(() => ({ ...imagePresets[initialInkMode()].balanced.settings }))
  const [previewMode, setPreviewMode] = useState<ImagePreviewMode>(initialInkMode)
  const [showOriginal, setShowOriginal] = useState(false)
  const [removedPercent, setRemovedPercent] = useState(0)
  const [busy, setBusy] = useState<'loading' | 'exporting' | null>(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [zenMode, setZenMode] = useState(() => readPreference(ZEN_KEY, false))
  const [controlsVisible, setControlsVisible] = useState(() => readPreference(CONTROLS_KEY, true))

  useEffect(() => {
    return () => {
      uploadIdRef.current++
      bitmapRef.current?.close()
      bitmapRef.current = null
    }
  }, [])

  useEffect(() => {
    document.body.classList.toggle('images-zen-screen', zenMode)
    try {
      window.localStorage.setItem(ZEN_KEY, String(zenMode))
    } catch {
      // Private mode may disable storage; the editor still works.
    }
    return () => document.body.classList.remove('images-zen-screen')
  }, [zenMode])

  useEffect(() => {
    try {
      window.localStorage.setItem(CONTROLS_KEY, String(controlsVisible))
    } catch {
      // No storage permission is required for editing.
    }
  }, [controlsVisible])

  useEffect(() => {
    try {
      window.localStorage.setItem(INK_MODE_KEY, inkMode)
    } catch {
      // The processor works without persistence.
    }
  }, [inkMode])

  useEffect(() => {
    if (!zenMode) return
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return
      setZenMode(false)
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [zenMode])

  useEffect(() => {
    if (!sourcePreview) return

    // Work on a downscaled copy when editing. Export always processes original pixels.
    const frame = requestAnimationFrame(() => {
      const result = removeFabricInk(sourcePreview, settings, inkMode)
      const canvas = canvasRef.current
      if (!canvas) return
      if (canvas.width !== sourcePreview.width) canvas.width = sourcePreview.width
      if (canvas.height !== sourcePreview.height) canvas.height = sourcePreview.height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      ctx.putImageData(showOriginal ? sourcePreview : result.image, 0, 0)
      setRemovedPercent(Math.round(result.removedPixels / (sourcePreview.width * sourcePreview.height) * 100))
    })

    return () => cancelAnimationFrame(frame)
  }, [sourcePreview, settings, showOriginal, previewMode, inkMode])

  const loadImage = async (incoming: File) => {
    const id = ++uploadIdRef.current
    setError(null)
    setDragging(false)

    const acceptedType = /^image\/(png|jpeg|webp)$/.test(incoming.type)
      || (!incoming.type && /\.(png|jpe?g|webp)$/i.test(incoming.name))
    if (!acceptedType) {
      setError('Utiliza una imagen PNG, JPG o WebP.')
      return
    }
    if (incoming.size > MAX_IMAGE_BYTES) {
      setError('La imagen supera los 60 MB. Reduce el peso antes de subirla.')
      return
    }

    setBusy('loading')
    try {
      const bitmap = await createImageBitmap(incoming)
      if (id !== uploadIdRef.current) {
        bitmap.close()
        return
      }
      const deviceLimit = window.matchMedia('(max-width: 720px)').matches ? 18_000_000 : MAX_IMAGE_PIXELS
      if (bitmap.width * bitmap.height > deviceLimit) {
        bitmap.close()
        throw new Error('La imagen supera el límite de resolución seguro para este dispositivo (' + Math.round(deviceLimit / 1_000_000) + ' megapíxeles).')
      }
      if (!bitmap.width || !bitmap.height) {
        bitmap.close()
        throw new Error('No se pudo determinar la resolución de la imagen.')
      }

      const previewEdge = window.matchMedia('(max-width: 720px)').matches ? 850 : PREVIEW_MAX_EDGE
      const ratio = Math.min(1, previewEdge / Math.max(bitmap.width, bitmap.height))
      const width = Math.max(1, Math.round(bitmap.width * ratio))
      const height = Math.max(1, Math.round(bitmap.height * ratio))
      const previewCanvas = document.createElement('canvas')
      previewCanvas.width = width
      previewCanvas.height = height
      const ctx = previewCanvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) {
        bitmap.close()
        throw new Error('No se pudo inicializar el lienzo de imágenes.')
      }
      ctx.drawImage(bitmap, 0, 0, width, height)
      const previewPixels = ctx.getImageData(0, 0, width, height)
      bitmapRef.current?.close()
      bitmapRef.current = bitmap
      setSourcePreview(previewPixels)
      setDimensions({ width: bitmap.width, height: bitmap.height })
      setShowOriginal(false)
      setFile(incoming)
    } catch (cause) {
      if (id === uploadIdRef.current) {
        setError(cause instanceof Error ? cause.message : 'No se pudo abrir la imagen.')
      }
    } finally {
      if (id === uploadIdRef.current) setBusy(null)
    }
  }

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.currentTarget.files?.[0]
    if (selected) void loadImage(selected)
    event.currentTarget.value = ''
  }

  const dropFile = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    setDragging(false)
    const selected = event.dataTransfer.files[0]
    if (selected) void loadImage(selected)
  }

  const changeSetting = (key: keyof InkRemovalSettings, value: number) => {
    setPreset(null)
    setSettings((current) => ({ ...current, [key]: value }))
  }

  const applyPreset = (next: ImagePreset) => {
    setPreset(next)
    setSettings({ ...imagePresets[inkMode][next].settings })
  }

  const changeInkMode = (next: InkRemovalMode) => {
    if (next === inkMode) return
    setInkMode(next)
    setPreset('balanced')
    setSettings({ ...imagePresets[next].balanced.settings })
    setPreviewMode(next)
    setShowOriginal(false)
    setError(null)
  }

  const reset = () => {
    applyPreset('balanced')
    setShowOriginal(false)
    setPreviewMode(inkMode)
    setError(null)
  }

  const toggleZen = () => {
    if (!zenMode && previewMode === 'shirt') setPreviewMode(inkMode)
    setZenMode((value) => !value)
  }

  const clear = () => {
    uploadIdRef.current++
    bitmapRef.current?.close()
    bitmapRef.current = null
    setSourcePreview(null)
    setDimensions(null)
    setFile(null)
    setRemovedPercent(0)
    setError(null)
    setBusy(null)
  }

  const exportPng = async () => {
    const bitmap = bitmapRef.current
    const currentFile = file
    if (!bitmap || !currentFile || busy) return
    setError(null)
    setBusy('exporting')
    setProgress(0)

    try {
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) throw new Error('El dispositivo no permite exportar esta resolución.')
      ctx.drawImage(bitmap, 0, 0)

      // Process at the original resolution in strips to avoid giant ImageData
      // allocations and give the browser a chance to repaint progress.
      const rows = Math.max(1, Math.floor(1_500_000 / bitmap.width))
      for (let y = 0; y < bitmap.height; y += rows) {
        const h = Math.min(rows, bitmap.height - y)
        const original = ctx.getImageData(0, y, bitmap.width, h)
        const result = removeFabricInk(original, settings, inkMode)
        ctx.putImageData(result.image, 0, y)
        setProgress(Math.round(((y + h) / bitmap.height) * 95))
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
      }

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) resolve(result)
          else reject(new Error('No se pudo generar el PNG transparente.'))
        }, 'image/png')
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = downloadName(currentFile.name, inkMode)
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
      setProgress(100)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falló la exportación PNG.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className={zenMode ? 'images-studio is-zen' : 'images-studio'} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false)
    }} onDrop={dropFile}>
      <input ref={inputRef} className="images-file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseFile} aria-label="Cargar una imagen" />
      <div className="images-heading">
        <div>
          <span className="images-eyebrow">GAS3D / Preparación de estampados</span>
          <h1>Images <span>Studio</span></h1>
          <p>{inkMode === 'black' ? 'Quita negros y sombras para estampados sobre negro.' : 'Quita blancos e iluminaciones para estampados sobre blanco.'}</p>
        </div>
        <div className="images-heading-actions">
          {zenMode && <button
            type="button"
            className="images-zen-panel-button"
            onClick={() => setControlsVisible((value) => !value)}
            aria-expanded={controlsVisible}
            aria-controls="images-adjustments"
            title={controlsVisible ? 'Ocultar controles y ampliar lienzo' : 'Mostrar controles de edición'}
          >
            {controlsVisible ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
            <span>{controlsVisible ? 'Ocultar ajustes' : 'Mostrar ajustes'}</span>
          </button>}
          <button
            type="button"
            className={zenMode ? 'images-zen-button active' : 'images-zen-button'}
            onClick={toggleZen}
            aria-pressed={zenMode}
            title={zenMode ? 'Salir del modo Zen (Esc)' : 'Modo Zen: edición a pantalla completa'}
          >
            {zenMode ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            <span>{zenMode ? 'Salir de Zen' : 'Modo Zen'}</span>
          </button>
          <button className="images-export" onClick={() => void exportPng()} disabled={!file || busy !== null}>
            <Download size={18} />
            <span>{busy === 'exporting' ? 'Procesando ' + progress + '%' : 'Exportar PNG'}</span>
          </button>
        </div>
      </div>

      {error && <div className="images-error" role="alert">{error}<button aria-label="Cerrar error" onClick={() => setError(null)}><X size={15} /></button></div>}

      <div className={'images-layout' + (zenMode && !controlsVisible ? ' controls-hidden' : '')}>
        <section className="images-view-column" aria-label="Vista previa del arte">
          <div className="images-preview-header">
            <div className="images-preview-title">
              <span>VISTA PREVIA</span>
              {dimensions && <small>{numberFormatter.format(dimensions.width)} × {numberFormatter.format(dimensions.height)} px</small>}
            </div>
            <div className="images-preview-modes" role="group" aria-label="Fondo de vista previa">
              {([
                ['transparent', 'Alfa'],
                ['black', 'Negro'],
                ['white', 'Blanco'],
                ['shirt', 'Remera'],
              ] as const).map(([mode, label]) => <button
                key={mode}
                className={previewMode === mode ? 'active' : ''}
                onClick={() => setPreviewMode(mode)}
                aria-pressed={previewMode === mode}
              >{label}</button>)}
            </div>
          </div>

          <div className={'images-preview images-preview-' + previewMode + ' ink-' + inkMode + (dragging ? ' dragging' : '')}>
            {sourcePreview ? <>
              {previewMode === 'shirt' ? <div className="images-shirt-preview">
                <div className="images-shirt-neck" />
                <div className="images-shirt-print">
                  <canvas ref={canvasRef} aria-label="Arte procesado sobre tela negra" />
                </div>
              </div> : <div className="images-art">
                <canvas ref={canvasRef} aria-label="Vista previa del arte procesado" />
              </div>}
            </> : <button className="images-empty" onClick={() => inputRef.current?.click()} disabled={busy === 'loading'}>
              <span className="images-upload-icon"><ImagePlus size={30} strokeWidth={1.5} /></span>
              <strong>{busy === 'loading' ? 'Abriendo imagen…' : 'Sube tu diseño'}</strong>
              <small>PNG · JPG · WebP · arrastra o toca para elegir</small>
              <span className="images-upload-cta"><Upload size={14} /> Elegir imagen</span>
            </button>}
            {dragging && <div className="images-drop-overlay">Suelta aquí la imagen</div>}
          </div>

          {file && <div className="images-preview-footer">
            <div className="images-file-info">
              <strong title={file.name}>{file.name}</strong>
              <small>{(file.size / (1024 * 1024)).toFixed(1)} MB · {removedPercent}% de píxeles totalmente transparentes en preview</small>
            </div>
            <button className={showOriginal ? 'images-before active' : 'images-before'} onClick={() => setShowOriginal((value) => !value)} aria-pressed={showOriginal}>
              <Eye size={16} /> {showOriginal ? 'Ver resultado' : 'Ver original'}
            </button>
          </div>}
        </section>

        <aside id="images-adjustments" className="images-controls" aria-label="Ajustes de transparencia" aria-hidden={zenMode && !controlsVisible}>
          <div className="images-ink-mode" role="group" aria-label="Color de la prenda para retirar fondo">
            <button type="button" className={inkMode === 'black' ? 'active' : ''} aria-pressed={inkMode === 'black'} onClick={() => changeInkMode('black')}>
              <i className="images-ink-dot black" aria-hidden="true" />
              Prenda negra
            </button>
            <button type="button" className={inkMode === 'white' ? 'active' : ''} aria-pressed={inkMode === 'white'} onClick={() => changeInkMode('white')}>
              <i className="images-ink-dot white" aria-hidden="true" />
              Prenda blanca
            </button>
          </div>
          <div className="images-section-title">
            <div><span>01 / PROCESAMIENTO</span><h2>{inkMode === 'black' ? 'Eliminar negros' : 'Eliminar blancos'}</h2></div>
            <button className="images-reset" onClick={reset} title="Restablecer ajustes"><RotateCcw size={15} /> Reiniciar</button>
          </div>
          <p className="images-controls-intro">
            {inkMode === 'black'
              ? 'El negro desaparece en toda la imagen, también dentro del dibujo.'
              : 'El blanco desaparece en toda la imagen, también en luces y detalles interiores.'}
            {' '}No altera la composición.
          </p>

          <div className="images-preset-picker" aria-label="Presets de procesamiento">
            {(Object.keys(imagePresets) as ImagePreset[]).map((id) => <button
              key={id}
              className={preset === id ? 'active' : ''}
              aria-pressed={preset === id}
              onClick={() => applyPreset(id)}
              title={imagePresets[inkMode][id].description}
            >
              {imagePresets[inkMode][id].name}
            </button>)}
          </div>

          <div className="images-slider-list">
            {controls.map((control) => <label key={control.key} className="images-slider">
              <span className="images-slider-heading">
                <strong>{inkMode === 'white' && control.key === 'blackThreshold' ? 'Eliminar blanco' : inkMode === 'white' && control.key === 'shadowThreshold' ? 'Eliminar iluminaciones' : control.title}</strong>
                <output>{settings[control.key]}{control.key === 'detailProtection' ? '%' : ''}</output>
              </span>
              <input
                type="range"
                min={control.min}
                max={control.max}
                step={control.step}
                value={settings[control.key]}
                onChange={(event) => changeSetting(control.key, Number(event.target.value))}
              />
              <span className="images-slider-description">{inkMode === 'white' && control.key === 'blackThreshold'
                ? 'Umbral de blanco puro y casi blanco.'
                : inkMode === 'white' && control.key === 'shadowThreshold'
                  ? 'Extiende la transparencia a reflejos y luces claras.'
                  : inkMode === 'white' && control.key === 'detailProtection'
                    ? 'Protege los colores, sombras y trazos oscuros.'
                    : control.hint}</span>
            </label>)}
          </div>

          <div className="images-bottom-actions">
            <button onClick={() => inputRef.current?.click()} className="images-replace">
              <Upload size={16} /> {file ? 'Cambiar imagen' : 'Subir imagen'}
            </button>
            {file && <button className="images-clear" onClick={clear} title="Cerrar imagen"><X size={16} /></button>}
          </div>
          <div className="images-print-note">
            <Shirt size={17} />
            <p>
              <strong>Preparado para tela {inkMode === 'black' ? 'negra' : 'blanca'}.</strong>
              {' '}La vista sobre {inkMode === 'black' ? 'negro' : 'blanco'} simula cómo se integran las transparencias.
              Verifica el PNG sobre una cuadrícula antes de enviarlo al taller; el resultado físico depende del proceso de impresión.
            </p>
          </div>
        </aside>
      </div>
    </main>
  )
}
