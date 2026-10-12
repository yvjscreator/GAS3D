import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { Download, Eye, ImagePlus, RotateCcw, Shirt, Upload, X } from 'lucide-react'
import {
  imagePresets,
  removeBlackInk,
  type BlackInkSettings,
  type ImagePreset,
  type ImagePreviewMode,
} from './imageProcessor'
import './imagesStudio.css'

const MAX_IMAGE_PIXELS = 30_000_000
const MAX_IMAGE_BYTES = 60 * 1024 * 1024
const PREVIEW_MAX_EDGE = 1300
const numberFormatter = new Intl.NumberFormat('es')

const controls: Array<{
  key: keyof BlackInkSettings
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

const downloadName = (fileName: string) => {
  const stem = fileName.replace(/\.[^.]+$/, '') || 'art'
  return stem + '-black-tee-ready.png'
}

export function ImagesStudio() {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const bitmapRef = useRef<ImageBitmap | null>(null)
  const uploadIdRef = useRef(0)

  const [file, setFile] = useState<File | null>(null)
  const [sourcePreview, setSourcePreview] = useState<ImageData | null>(null)
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null)
  const [preset, setPreset] = useState<ImagePreset | null>('balanced')
  const [settings, setSettings] = useState<BlackInkSettings>({ ...imagePresets.balanced.settings })
  const [previewMode, setPreviewMode] = useState<ImagePreviewMode>('black')
  const [showOriginal, setShowOriginal] = useState(false)
  const [removedPercent, setRemovedPercent] = useState(0)
  const [busy, setBusy] = useState<'loading' | 'exporting' | null>(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    return () => {
      uploadIdRef.current++
      bitmapRef.current?.close()
      bitmapRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!sourcePreview) return

    // Work on a downscaled copy when editing. Export always processes original pixels.
    const frame = requestAnimationFrame(() => {
      const result = removeBlackInk(sourcePreview, settings)
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
  }, [sourcePreview, settings, showOriginal, previewMode])

  const loadImage = async (incoming: File) => {
    const id = ++uploadIdRef.current
    setError(null)
    setDragging(false)

    if (!/^image\/(png|jpeg|webp)$/.test(incoming.type)) {
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
      if (bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) {
        bitmap.close()
        throw new Error('Imagen demasiado grande para procesarla con seguridad en este navegador (máximo 30 megapíxeles).')
      }
      if (!bitmap.width || !bitmap.height) {
        bitmap.close()
        throw new Error('No se pudo determinar la resolución de la imagen.')
      }

      const ratio = Math.min(1, PREVIEW_MAX_EDGE / Math.max(bitmap.width, bitmap.height))
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

  const changeSetting = (key: keyof BlackInkSettings, value: number) => {
    setPreset(null)
    setSettings((current) => ({ ...current, [key]: value }))
  }

  const applyPreset = (next: ImagePreset) => {
    setPreset(next)
    setSettings({ ...imagePresets[next].settings })
  }

  const reset = () => {
    applyPreset('balanced')
    setShowOriginal(false)
    setPreviewMode('black')
    setError(null)
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
        const result = removeBlackInk(original, settings)
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
      anchor.download = downloadName(currentFile.name)
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
    <main className="images-studio" onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false)
    }} onDrop={dropFile}>
      <input ref={inputRef} className="images-file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseFile} aria-label="Cargar una imagen" />
      <div className="images-heading">
        <div>
          <span className="images-eyebrow">GAS3D / Preparación de estampados</span>
          <h1>Images <span>Studio</span></h1>
          <p>Quita negro y sombras para que la tela negra sustituya la tinta.</p>
        </div>
        <button className="images-export" onClick={() => void exportPng()} disabled={!file || busy !== null}>
          <Download size={18} />
          <span>{busy === 'exporting' ? 'Procesando ' + progress + '%' : 'Exportar PNG'}</span>
        </button>
      </div>

      {error && <div className="images-error" role="alert">{error}<button aria-label="Cerrar error" onClick={() => setError(null)}><X size={15} /></button></div>}

      <div className="images-layout">
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
                ['shirt', 'Remera'],
              ] as const).map(([mode, label]) => <button
                key={mode}
                className={previewMode === mode ? 'active' : ''}
                onClick={() => setPreviewMode(mode)}
                aria-pressed={previewMode === mode}
              >{label}</button>)}
            </div>
          </div>

          <div className={'images-preview images-preview-' + previewMode + (dragging ? ' dragging' : '')}>
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

        <aside className="images-controls" aria-label="Ajustes de transparencia">
          <div className="images-section-title">
            <div><span>01 / PROCESAMIENTO</span><h2>Eliminar negros</h2></div>
            <button className="images-reset" onClick={reset} title="Restablecer ajustes"><RotateCcw size={15} /> Reiniciar</button>
          </div>
          <p className="images-controls-intro">El negro desaparece en toda la imagen, también dentro del dibujo. No modifica ni reconstruye la composición.</p>

          <div className="images-preset-picker" aria-label="Presets de procesamiento">
            {(Object.keys(imagePresets) as ImagePreset[]).map((id) => <button
              key={id}
              className={preset === id ? 'active' : ''}
              aria-pressed={preset === id}
              onClick={() => applyPreset(id)}
              title={imagePresets[id].description}
            >
              {imagePresets[id].name}
            </button>)}
          </div>

          <div className="images-slider-list">
            {controls.map((control) => <label key={control.key} className="images-slider">
              <span className="images-slider-heading"><strong>{control.title}</strong><output>{settings[control.key]}{control.key === 'detailProtection' ? '%' : ''}</output></span>
              <input
                type="range"
                min={control.min}
                max={control.max}
                step={control.step}
                value={settings[control.key]}
                onChange={(event) => changeSetting(control.key, Number(event.target.value))}
              />
              <span className="images-slider-description">{control.hint}</span>
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
            <p><strong>Preparado para tela negra.</strong> La vista sobre negro simula cómo se integran las transparencias. Verifica el PNG sobre una cuadrícula antes de enviar al taller: el resultado físico también depende de la tinta blanca y del RIP de impresión.</p>
          </div>
        </aside>
      </div>
    </main>
  )
}
