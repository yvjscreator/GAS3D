import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { Download, Eye, ImagePlus, Maximize2, Minimize2, PanelRightClose, PanelRightOpen, RotateCcw, Shirt, Upload, X, List, Scan, Layers3 } from 'lucide-react'
import {
  imagePresets,
  removeFabricInk,
  type InkRemovalMode,
  type InkRemovalSettings,
  type ImagePreset,
  type ImagePreviewMode,
} from './imageProcessor'
import { assertImageDimensions, assertImageFile, downloadBlob, renderTransparentPng } from './imageExport'
import { createZipArchive } from './zipExport'
import { paintNativeDetail } from './detailPreview'
import { ImagesBatchSidebar } from './ImagesBatchSidebar'
import { EXPORT_PRESETS, getExportGeometry, resolveExportPreset, type ExportPreset } from './printExport'
import { analyzeAlpha, DEFAULT_ALPHA_SETTINGS, optimizeImageAlpha, shouldOptimizeAlpha, type AlphaOptimizationSettings, type PrintMethod, type DtfAlphaMode, type AlphaStatistics } from './alphaOptimization'
import './imagesStudio.css'

const MAX_IMAGE_PIXELS = 30_000_000
const MAX_IMAGE_BYTES = 60 * 1024 * 1024
const PREVIEW_MAX_EDGE = 1300
const ZEN_KEY = 'gas3d.images.zen.v1'
const CONTROLS_KEY = 'gas3d.images.zen.controls.v1'
const INK_MODE_KEY = 'gas3d.images.ink-mode.v1'
const OUTPUT_PRESET_KEY = 'gas3d.images.output-preset.v1'
const UPSCALE_KEY = 'gas3d.images.output-upscale.v1'
const PRINT_METHOD_KEY = 'gas3d.images.print-method.v1'
const DTF_ALPHA_KEY = 'gas3d.images.dtf-alpha.v1'
const ICC_KEY = 'gas3d.images.icc-profile.v1'
const ALPHA_CLEANUP_KEY = 'gas3d.images.alpha-cleanup.v1'
const DETAIL_PROTECTION_KEY = 'gas3d.images.detail-protection.v1'
const DTF_DOT_SIZE_KEY = 'gas3d.images.dtf-dot-size.v1'

const readOutputPreset = (): ExportPreset => {
  try {
    const saved = window.localStorage.getItem(OUTPUT_PRESET_KEY)
    return EXPORT_PRESETS.some((preset) => preset.id === saved) ? saved as ExportPreset : 'auto'
  } catch {
    return 'auto'
  }
}

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
const MAX_BATCH_FILES = 40
type WorkspaceMode = 'single' | 'batch'
type BatchStatus = 'pending' | 'processing' | 'ready' | 'error'
type BatchItem = { id: number; file: File; status: BatchStatus; detail?: string; progress?: number }
type ZoomPosition = { scale: number; x: number; y: number }
const initialZoom: ZoomPosition = { scale: 1, x: 0, y: 0 }
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

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

const downloadName = (fileName: string, mode: InkRemovalMode, output: ExportPreset, width: number, height: number) => {
  const stem = fileName.replace(/\.[^.]+$/, '') || 'art'
  const preset = resolveExportPreset(width, height, output)
  const suffix = preset === 'print-40x53' ? '-40x53-300ppp'
    : preset === 'print-35x40' ? '-35x40-300ppp'
      : preset === 'companion-2x' ? '-companion-x2' : ''
  return stem + suffix + (mode === 'black' ? '-black-tee-ready.png' : '-white-tee-ready.png')
}

export function ImagesStudio() {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const bitmapRef = useRef<ImageBitmap | null>(null)
  const uploadIdRef = useRef(0)
  const batchIdRef = useRef(0)
  const previewRef = useRef<HTMLDivElement | null>(null)
  const detailCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const zoomRef = useRef<ZoomPosition>({ ...initialZoom })
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null)
  const lastCtrlPressRef = useRef(0)

  const [file, setFile] = useState<File | null>(null)
  const [sourcePreview, setSourcePreview] = useState<ImageData | null>(null)
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null)
  const [inkMode, setInkMode] = useState<InkRemovalMode>(initialInkMode)
  const [outputPreset, setOutputPreset] = useState<ExportPreset>(readOutputPreset)
  const [allowUpscale, setAllowUpscale] = useState(() => readPreference(UPSCALE_KEY, true))
  const [printMethod, setPrintMethod] = useState<PrintMethod>(() => {
    try { return window.localStorage.getItem(PRINT_METHOD_KEY) === 'dtf' ? 'dtf' : 'dtg' }
    catch { return 'dtg' }
  })
  const [dtfAlphaMode, setDtfAlphaMode] = useState<DtfAlphaMode>(() => {
    try {
      const stored = window.localStorage.getItem(DTF_ALPHA_KEY)
      return stored === 'solid' || stored === 'preserve' || stored === 'aggressive' ? stored : 'halftone'
    } catch { return 'halftone' }
  })
  const [embedProfile, setEmbedProfile] = useState(() => readPreference(ICC_KEY, true))
  const [alphaCleanup, setAlphaCleanup] = useState(() => {
    try { return Math.max(0, Math.min(30, Number(window.localStorage.getItem(ALPHA_CLEANUP_KEY) ?? 10) || 0)) }
    catch { return 10 }
  })
  const [detailProtection, setDetailProtection] = useState(() => {
    try { return Math.max(0, Math.min(100, Number(window.localStorage.getItem(DETAIL_PROTECTION_KEY) ?? 85) || 0)) }
    catch { return 85 }
  })
  const [dtfDotSize, setDtfDotSize] = useState(() => {
    try {
      const stored = Number(window.localStorage.getItem(DTF_DOT_SIZE_KEY))
      return stored === 12 || stored === 16 ? stored : 8
    } catch { return 8 }
  })
  const [alphaStats, setAlphaStats] = useState<{ original: AlphaStatistics; result: AlphaStatistics } | null>(null)
  const [preset, setPreset] = useState<ImagePreset | null>('balanced')
  const [settings, setSettings] = useState<InkRemovalSettings>(() => ({ ...imagePresets[initialInkMode()].balanced.settings }))
  const [previewMode, setPreviewMode] = useState<ImagePreviewMode>(initialInkMode)
  const [showOriginal, setShowOriginal] = useState(false)
  const [holdOriginal, setHoldOriginal] = useState(false)
  const [removedPercent, setRemovedPercent] = useState(0)
  const [busy, setBusy] = useState<'loading' | 'exporting' | 'batch' | null>(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [zenMode, setZenMode] = useState(() => readPreference(ZEN_KEY, false))
  const [controlsVisible, setControlsVisible] = useState(() => readPreference(CONTROLS_KEY, true))
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('single')
  const [batchItems, setBatchItems] = useState<BatchItem[]>([])
  const [batchSelectedId, setBatchSelectedId] = useState<number | null>(null)
  const [batchSummary, setBatchSummary] = useState<string | null>(null)
  const [batchCurrent, setBatchCurrent] = useState(0)
  const [batchPanelOpen, setBatchPanelOpen] = useState(false)
  const [zoom, setZoom] = useState<ZoomPosition>({ ...initialZoom })
  const [previewResize, setPreviewResize] = useState(0)
  const originalVisible = showOriginal || holdOriginal
  const alphaSettings: AlphaOptimizationSettings = useMemo(() => ({
    ...DEFAULT_ALPHA_SETTINGS,
    method: printMethod,
    dtfMode: dtfAlphaMode,
    cleanupPercent: alphaCleanup,
    cellPixels: dtfDotSize,
    detailProtection,
  }), [printMethod, dtfAlphaMode, alphaCleanup, dtfDotSize, detailProtection])
  const exportGeometry = dimensions ? getExportGeometry(dimensions.width, dimensions.height, outputPreset, allowUpscale) : null

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
    try {
      window.localStorage.setItem(OUTPUT_PRESET_KEY, outputPreset)
      window.localStorage.setItem(UPSCALE_KEY, String(allowUpscale))
    } catch {
      // Print options remain functional without browser storage.
    }
  }, [outputPreset, allowUpscale])

  useEffect(() => {
    try {
      window.localStorage.setItem(PRINT_METHOD_KEY, printMethod)
      window.localStorage.setItem(DTF_ALPHA_KEY, dtfAlphaMode)
      window.localStorage.setItem(ICC_KEY, String(embedProfile))
      window.localStorage.setItem(ALPHA_CLEANUP_KEY, String(alphaCleanup))
      window.localStorage.setItem(DETAIL_PROTECTION_KEY, String(detailProtection))
      window.localStorage.setItem(DTF_DOT_SIZE_KEY, String(dtfDotSize))
    } catch {
      // The print pipeline works without localStorage.
    }
  }, [printMethod, dtfAlphaMode, embedProfile, alphaCleanup, detailProtection, dtfDotSize])

  useEffect(() => {
    const onDown = (event: KeyboardEvent) => {
      if (event.key !== 'Control') {
        // A shortcut such as Ctrl+C between taps is not a comparison gesture.
        if (!['Shift', 'Alt', 'Meta'].includes(event.key)) lastCtrlPressRef.current = 0
        return
      }
      if (event.repeat || event.altKey || event.metaKey) return
      const now = performance.now()
      if (lastCtrlPressRef.current && now - lastCtrlPressRef.current <= 370) {
        setHoldOriginal(true)
        lastCtrlPressRef.current = 0
      } else {
        lastCtrlPressRef.current = now
      }
    }
    const onUp = (event: KeyboardEvent) => {
      if (event.key === 'Control') setHoldOriginal(false)
    }
    const onBlur = () => {
      setHoldOriginal(false)
      lastCtrlPressRef.current = 0
    }
    const onVisibility = () => {
      if (document.hidden) onBlur()
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

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

  const setZoomPosition = (next: ZoomPosition) => {
    zoomRef.current = next
    setZoom(next)
  }

  const resetZoom = () => {
    dragRef.current = null
    setZoomPosition({ ...initialZoom })
  }

  useEffect(() => {
    const node = previewRef.current
    if (!node) return

    const onWheel = (event: WheelEvent) => {
      if (!bitmapRef.current || event.ctrlKey) return
      event.preventDefault()

      const current = zoomRef.current
      const nextScale = clamp(current.scale * Math.exp(-event.deltaY * 0.0016), 1, 10)
      if (nextScale === current.scale) return
      if (nextScale <= 1.001) {
        setZoomPosition({ ...initialZoom })
        return
      }

      const rect = node.getBoundingClientRect()
      const mouseX = event.clientX - rect.left - rect.width / 2
      const mouseY = event.clientY - rect.top - rect.height / 2
      const relativeX = (mouseX - current.x) / current.scale
      const relativeY = (mouseY - current.y) / current.scale
      setZoomPosition({
        scale: nextScale,
        x: mouseX - relativeX * nextScale,
        y: mouseY - relativeY * nextScale,
      })
    }

    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [])

  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (zoomRef.current.scale <= 1 || !bitmapRef.current || event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
  }

  const movePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointer = dragRef.current
    if (!pointer || pointer.pointerId !== event.pointerId) return
    const current = zoomRef.current
    setZoomPosition({
      scale: current.scale,
      x: current.x + event.clientX - pointer.x,
      y: current.y + event.clientY - pointer.y,
    })
    dragRef.current = { pointerId: pointer.pointerId, x: event.clientX, y: event.clientY }
  }

  const endPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

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
      const before = analyzeAlpha(result.image)
      const optimizedPreview = shouldOptimizeAlpha(alphaSettings)
        ? optimizeImageAlpha(result.image, alphaSettings) : result.image
      const after = analyzeAlpha(optimizedPreview)
      ctx.putImageData(originalVisible ? sourcePreview : optimizedPreview, 0, 0)
      setAlphaStats({ original: before, result: after })
      setRemovedPercent(Math.round(result.removedPixels / (sourcePreview.width * sourcePreview.height) * 100))
    })

    return () => cancelAnimationFrame(frame)
  }, [sourcePreview, settings, originalVisible, previewMode, inkMode, alphaSettings])

  useEffect(() => {
    const viewport = previewRef.current
    if (!viewport || !sourcePreview) return
    const observer = new ResizeObserver(() => setPreviewResize((count) => count + 1))
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [sourcePreview, previewMode])

  useEffect(() => {
    const overlay = detailCanvasRef.current
    const viewport = previewRef.current
    if (!overlay) return

    // The low-resolution canvas stays interactive while the user zooms/pans.
    // Clear any previous tile immediately so it cannot lag behind the artwork.
    const overlayContext = overlay.getContext('2d')
    overlayContext?.clearRect(0, 0, overlay.width, overlay.height)

    if (!viewport || !sourcePreview || zoom.scale <= 1.05) return

    let animationFrame = 0
    const timeout = window.setTimeout(() => {
      animationFrame = window.requestAnimationFrame(() => {
        const bitmap = bitmapRef.current
        const image = canvasRef.current
        if (!bitmap || !image || !detailCanvasRef.current) return
        // Viewports and canvases can be replaced as the user switches modes;
        // always resolve the DOM node at the moment the detail is rendered.
        paintNativeDetail({
          bitmap,
          viewport,
          image,
          overlay: detailCanvasRef.current,
          settings,
          inkMode,
          showOriginal: originalVisible,
          alphaSettings,
        })
      })
    }, 110)

    return () => {
      window.clearTimeout(timeout)
      if (animationFrame) window.cancelAnimationFrame(animationFrame)
    }
  }, [zoom, sourcePreview, settings, inkMode, originalVisible, previewMode, previewResize, alphaSettings])

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
      setAlphaStats(null)
      resetZoom()
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

  const addBatchFiles = (incoming: File[]) => {
    if (!incoming.length || busy !== null) return
    const current = batchItems.length
    const additions = incoming.slice(0, Math.max(0, MAX_BATCH_FILES - current))
    if (!additions.length) {
      setError('El lote admite un máximo de ' + MAX_BATCH_FILES + ' imágenes.')
      return
    }

    const items: BatchItem[] = additions.map((image) => ({
      id: ++batchIdRef.current,
      file: image,
      status: 'pending',
    }))
    setBatchItems((previous) => [...previous, ...items])
    setBatchSummary(null)
    if (current === 0 || batchSelectedId === null) {
      setBatchSelectedId(items[0].id)
      setBatchPanelOpen(false)
      void loadImage(items[0].file)
    }
    if (incoming.length > additions.length) {
      setError('Se agregaron solo ' + additions.length + ' archivos; máximo ' + MAX_BATCH_FILES + ' por lote.')
    } else {
      setError(null)
    }
  }

  const selectBatchFile = (item: BatchItem) => {
    if (busy !== null) return
    setBatchSelectedId(item.id)
    setBatchPanelOpen(false)
    void loadImage(item.file)
  }

  const setWorkspace = (next: WorkspaceMode) => {
    if (busy) return
    setWorkspaceMode(next)
    setBatchPanelOpen(next === 'batch')
    setBatchSummary(null)
    if (next === 'batch') {
      if (batchItems.length === 0 && file) {
        const id = ++batchIdRef.current
        setBatchItems([{ id, file, status: 'pending' }])
        setBatchSelectedId(id)
      } else if (batchItems.length) {
        const selected = batchItems.find((item) => item.id === batchSelectedId) ?? batchItems[0]
        setBatchSelectedId(selected.id)
        if (file !== selected.file) void loadImage(selected.file)
      }
    }
    resetZoom()
  }

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.currentTarget.files ?? [])
    if (workspaceMode === 'batch') addBatchFiles(selected)
    else if (selected[0]) void loadImage(selected[0])
    event.currentTarget.value = ''
  }

  const dropFile = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    setDragging(false)
    if (busy) return
    const selected = Array.from(event.dataTransfer.files)
    if (workspaceMode === 'batch') addBatchFiles(selected)
    else if (selected[0]) void loadImage(selected[0])
  }

  const invalidateBatch = () => {
    setBatchItems((current) => current.map((item) => ({
      ...item,
      status: 'pending' as const,
      detail: undefined,
      progress: undefined,
    })))
    setBatchSummary(null)
  }

  const changeSetting = (key: keyof InkRemovalSettings, value: number) => {
    if (busy === 'batch') return
    setPreset(null)
    setSettings((current) => ({ ...current, [key]: value }))
    invalidateBatch()
  }

  const applyPreset = (next: ImagePreset) => {
    if (busy === 'batch') return
    setPreset(next)
    setSettings({ ...imagePresets[inkMode][next].settings })
    invalidateBatch()
  }

  const changeInkMode = (next: InkRemovalMode) => {
    if (next === inkMode || busy === 'batch') return
    setInkMode(next)
    invalidateBatch()
    resetZoom()
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
    resetZoom()
    uploadIdRef.current++
    bitmapRef.current?.close()
    bitmapRef.current = null
    setSourcePreview(null)
    setAlphaStats(null)
    setDimensions(null)
    setFile(null)
    setRemovedPercent(0)
    setError(null)
    setBusy(null)
  }

  const removeBatchFile = (id: number) => {
    if (busy) return
    const remaining = batchItems.filter((item) => item.id !== id)
    setBatchItems(remaining)
    setBatchSummary(null)
    if (batchSelectedId === id) {
      const next = remaining[0]
      setBatchSelectedId(next?.id ?? null)
      if (next) void loadImage(next.file)
      else clear()
    }
  }

  const clearBatch = () => {
    if (busy) return
    setBatchPanelOpen(false)
    setBatchItems([])
    setBatchSelectedId(null)
    setBatchSummary(null)
    clear()
  }

  const exportBatch = async () => {
    if (busy || !batchItems.length) return
    const snapshot = [...batchItems]
    const results: Array<{ name: string; blob: Blob }> = []
    const usedNames = new Set<string>()
    let failures = 0
    setBusy('batch')
    setBatchSummary(null)
    setError(null)
    setProgress(0)
    setBatchCurrent(0)
    setBatchItems((items) => items.map((item) => ({ ...item, status: 'pending' as const, detail: undefined, progress: undefined })))

    for (let i = 0; i < snapshot.length; i++) {
      const item = snapshot[i]
      setBatchCurrent(i + 1)
      setBatchItems((items) => items.map((entry) =>
        entry.id === item.id ? { ...entry, status: 'processing' as const, detail: undefined, progress: 0 } : entry,
      ))
      // Give the browser time to show the active row before decoding begins.
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0))

      let bitmap: ImageBitmap | null = null
      try {
        assertImageFile(item.file)
        bitmap = await createImageBitmap(item.file)
        assertImageDimensions(bitmap)
        const png = await renderTransparentPng(bitmap, settings, inkMode, (value) => {
          setProgress(Math.round((i + value / 100) / snapshot.length * 95))
          setBatchItems((items) => items.map((entry) =>
            entry.id === item.id ? { ...entry, progress: value } : entry,
          ))
        }, outputPreset, allowUpscale, alphaSettings, embedProfile)

        const base = downloadName(item.file.name, inkMode, outputPreset, bitmap.width, bitmap.height)
        let uniqueName = base
        let count = 2
        while (usedNames.has(uniqueName.toLowerCase())) {
          uniqueName = base.replace(/\.png$/i, '-' + count++ + '.png')
        }
        usedNames.add(uniqueName.toLowerCase())
        results.push({ name: uniqueName, blob: png })
        setBatchItems((items) => items.map((entry) =>
          entry.id === item.id ? { ...entry, status: 'ready' as const, progress: 100 } : entry,
        ))
      } catch (cause) {
        failures++
        const detail = cause instanceof Error ? cause.message : 'No se pudo procesar.'
        setBatchItems((items) => items.map((entry) =>
          entry.id === item.id ? { ...entry, status: 'error' as const, detail, progress: undefined } : entry,
        ))
      } finally {
        bitmap?.close()
      }
    }

    try {
      if (!results.length) {
        setBatchSummary('No se pudo exportar ninguna imagen. Revisa los errores de la lista.')
      } else {
        const archive = await createZipArchive(results)
        downloadBlob(archive, 'gas3d-images-' + inkMode + '-ready.zip')
        setBatchSummary(results.length + ' PNG listos en ZIP.' +
          (failures ? ' ' + failures + ' archivos con error; puedes revisarlos en la lista.' : ''))
      }
      setProgress(100)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo generar el ZIP.')
    } finally {
      setBusy(null)
    }
  }

  const exportPng = async () => {
    const bitmap = bitmapRef.current
    const currentFile = file
    if (!bitmap || !currentFile || busy) return
    setError(null)
    setBusy('exporting')
    setProgress(0)

    try {
      const png = await renderTransparentPng(bitmap, settings, inkMode, setProgress, outputPreset, allowUpscale, alphaSettings, embedProfile)
      downloadBlob(png, downloadName(currentFile.name, inkMode, outputPreset, bitmap.width, bitmap.height))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falló la exportación PNG.')
    } finally {
      setBusy(null)
    }
  }
  return (
    <main className={'images-studio' + (zenMode ? ' is-zen' : '') + (workspaceMode === 'batch' ? ' is-batch' : '')} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false)
    }} onDrop={dropFile}>
      <input ref={inputRef} className="images-file-input" type="file" multiple={workspaceMode === 'batch'} accept="image/png,image/jpeg,image/webp" onChange={chooseFile} aria-label={workspaceMode === 'batch' ? 'Cargar imágenes del lote' : 'Cargar una imagen'} />
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
          <button className="images-export" onClick={() => void (workspaceMode === 'batch' ? exportBatch() : exportPng())}
            disabled={(workspaceMode === 'batch' ? batchItems.length === 0 : !file) || busy !== null}>
            <Download size={18} />
            <span>{busy === 'batch' ? 'Lote ' + progress + '%' : busy === 'exporting' ? 'Procesando ' + progress + '%' : workspaceMode === 'batch' ? 'Exportar ZIP' : 'Exportar PNG'}</span>
          </button>
        </div>
      </div>

      {error && <div className="images-error" role="alert">{error}<button aria-label="Cerrar error" onClick={() => setError(null)}><X size={15} /></button></div>}

      <div className={'images-layout' + (workspaceMode === 'batch' ? ' with-batch' : '') + (batchPanelOpen ? ' batch-panel-open' : '') + (zenMode && !controlsVisible ? ' controls-hidden' : '')}>
        {workspaceMode === 'batch' && <>
          <button type="button" className="images-batch-scrim" aria-label="Cerrar panel de imágenes" onClick={() => setBatchPanelOpen(false)} />
          <ImagesBatchSidebar
            items={batchItems}
            selectedId={batchSelectedId}
            running={busy !== null}
            current={batchCurrent}
            summary={batchSummary}
            onSelect={selectBatchFile}
            onRemove={removeBatchFile}
            onAdd={() => inputRef.current?.click()}
            onClose={() => setBatchPanelOpen(false)}
          />
        </>}
        <section className="images-view-column" aria-label="Vista previa del arte">
          <div className="images-preview-header">
            {workspaceMode === 'batch' && <button type="button" className="images-layer-toggle" aria-label="Mostrar imágenes del lote"
              aria-expanded={batchPanelOpen} onClick={() => setBatchPanelOpen((value) => !value)}>
              <Layers3 size={16} />
              <span>{batchItems.length}</span>
            </button>}
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
                onClick={() => { setPreviewMode(mode); resetZoom() }}
                aria-pressed={previewMode === mode}
              >{label}</button>)}
            </div>
            <button className="images-fit" type="button" onClick={resetZoom}
              disabled={!sourcePreview || zoom.scale === 1}
              title="Ajustar imagen a pantalla"
              aria-label="Ajustar imagen a pantalla">
              <Scan size={15} />
              <span>{Math.round(zoom.scale * 100)}%</span>
            </button>
          </div>

          <div ref={previewRef} className={'images-preview images-preview-' + previewMode + ' ink-' + inkMode + (dragging ? ' dragging' : '') + (zoom.scale > 1 ? ' zoomed' : '')}
            onPointerDown={startPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan}>
            <div className="images-zoom-surface" style={{ transform: 'translate(' + zoom.x + 'px, ' + zoom.y + 'px) scale(' + zoom.scale + ')' }}>
            {sourcePreview ? <>
              {previewMode === 'shirt' ? <div className="images-shirt-preview">
                <div className="images-shirt-neck" />
                <div className="images-shirt-print">
                  <canvas ref={canvasRef} aria-label={`Arte procesado sobre tela ${inkMode === 'black' ? 'negra' : 'blanca'}`} />
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
            </div>
            <canvas ref={detailCanvasRef} className="images-native-detail" aria-hidden="true" />
            {dragging && <div className="images-drop-overlay">Suelta aquí la imagen</div>}
          </div>

          {file && <div className="images-preview-footer">
            <div className="images-file-info">
              <strong title={file.name}>{file.name}</strong>
              <small>{(file.size / (1024 * 1024)).toFixed(1)} MB · {removedPercent}% de píxeles totalmente transparentes en preview</small>
            </div>
            <button className={originalVisible ? 'images-before active' : 'images-before'} onClick={() => setShowOriginal((value) => !value)} aria-pressed={showOriginal}
              title="Ver antes/después. Pulsa dos veces Ctrl y mantén la segunda pulsación para ver el original temporalmente.">
              <Eye size={16} /> {originalVisible ? 'Ver resultado' : 'Ver original'}
            </button>
          </div>}
        </section>

        <aside id="images-adjustments" className="images-controls" aria-label="Ajustes de transparencia" aria-hidden={zenMode && !controlsVisible}>
          <div className="images-workspace-modes" role="group" aria-label="Tipo de procesamiento">
            <button type="button" className={workspaceMode === 'single' ? 'active' : ''}
              aria-pressed={workspaceMode === 'single'} disabled={busy !== null}
              onClick={() => setWorkspace('single')}>
              <ImagePlus size={15} /> Individual
            </button>
            <button type="button" className={workspaceMode === 'batch' ? 'active' : ''}
              aria-pressed={workspaceMode === 'batch'} disabled={busy !== null}
              onClick={() => setWorkspace('batch')}>
              <List size={15} /> Por lotes
            </button>
          </div>
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
            {(Object.keys(imagePresets[inkMode]) as ImagePreset[]).map((id) => <button
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

          <section className="images-output-section" aria-label="Formato de exportación">
            <div className="images-output-heading">
              <span>02 / EXPORTACIÓN</span>
              <h3>Lienzo de impresión</h3>
            </div>
            <div className="images-output-presets" role="group" aria-label="Tamaño del PNG exportado">
              {EXPORT_PRESETS.map((option) => <button type="button" key={option.id}
                className={outputPreset === option.id ? 'active' : ''}
                aria-pressed={outputPreset === option.id}
                disabled={busy === 'batch' || busy === 'exporting'}
                title={option.detail}
                onClick={() => {
                  setOutputPreset(option.id)
                  invalidateBatch()
                }}>
                {option.name}
              </button>)}
            </div>
            <button type="button" className={allowUpscale ? 'images-upscale enabled' : 'images-upscale'}
              onClick={() => { setAllowUpscale((value) => !value); invalidateBatch() }}
              disabled={busy === 'batch' || busy === 'exporting'}
              aria-pressed={allowUpscale}>
              <span className="images-upscale-track"><span /></span>
              <span>Permitir ampliar para encajar</span>
            </button>
            <p className="images-output-info">
              {exportGeometry ? <>
                <strong>{numberFormatter.format(exportGeometry.width)} × {numberFormatter.format(exportGeometry.height)} px</strong>
                {exportGeometry.dpi ? ' · 300 ppp reales' : exportGeometry.preset === 'companion-2x' ? ' · escala ×2' : ' · tamaño original'}
                {outputPreset === 'auto' && <> · Auto: {EXPORT_PRESETS.find((item) => item.id === exportGeometry.preset)?.name}</>}
                <span>Encajado completo, centrado, con márgenes transparentes si sobran.</span>
                {exportGeometry.upscaled && <em>Se ampliará el arte: el escalado no crea detalles nuevos.</em>}
              </> : <>
                <strong>Selecciona una imagen</strong>
                <span>Auto analiza la proporción y el tamaño. En un lote decide por cada archivo.</span>
              </>}
            </p>
          </section>

          <section className="images-production-section" aria-label="Preparación de impresión DTG DTF">
            <div className="images-output-heading">
              <span>03 / MÉTODO DE IMPRESIÓN</span>
              <h3>Optimización de transparencia</h3>
            </div>
            <div className="images-method-picker" role="group" aria-label="Método de impresión">
              {(['dtg', 'dtf'] as PrintMethod[]).map((method) => <button key={method} type="button"
                disabled={busy !== null && busy !== 'loading'}
                aria-pressed={printMethod === method}
                className={printMethod === method ? 'active' : ''}
                onClick={() => { setPrintMethod(method); invalidateBatch() }}>
                {method.toUpperCase()}
              </button>)}
            </div>
            {printMethod === 'dtg' ? <p className="images-production-explain">
              DTG: conserva los degradados y semitransparencias originales del diseño limpio.
            </p> : <>
              <div className="images-dtf-modes" role="group" aria-label="Tratamiento de transparencia DTF">
                {([
                  ['halftone', 'Tramado protegido', 'Respeta colores y contornos; trama solo transparencias necesarias.'],
                  ['solid', 'Alfa sólido', 'Umbral de 50%: bordes definidos, sin semitransparencias.'],
                  ['preserve', 'Conservar alfa', 'No modifica las semitransparencias; para un RIP compatible.'],
                  ['aggressive', 'Tramado completo', 'Trama todas las transparencias; usar solo si el arte lo admite.'],
                ] as const).map(([id, name, detail]) => <button key={id} type="button"
                  className={dtfAlphaMode === id ? 'active' : ''}
                  disabled={busy === 'batch' || busy === 'exporting'}
                  aria-pressed={dtfAlphaMode === id}
                  onClick={() => { setDtfAlphaMode(id); invalidateBatch() }}>
                  <span className="images-mode-radio" aria-hidden="true" />
                  <span><strong>{name}</strong><small>{detail}</small></span>
                </button>)}
              </div>
              {(dtfAlphaMode === 'halftone' || dtfAlphaMode === 'aggressive') && <div className="images-dtf-options">
                {dtfAlphaMode === 'halftone' && <label className="images-cleanup-slider">
                  <span><strong>Proteger contornos y detalles</strong><output>{detailProtection}%</output></span>
                  <input type="range" min={0} max={100} step={5} value={detailProtection}
                    disabled={busy === 'batch' || busy === 'exporting'}
                    onChange={(event) => { setDetailProtection(Number(event.currentTarget.value)); invalidateBatch() }}/>
                </label>}
                <div className="images-dtf-pitch">
                  <strong>Tamaño de punto</strong>
                  <div role="group" aria-label="Tamaño de punto de trama DTF">
                    {([['Fino', 8], ['Medio', 12], ['Grueso', 16]] as const).map(([label, size]) =>
                      <button type="button" key={size} className={dtfDotSize === size ? 'active' : ''}
                        aria-pressed={dtfDotSize === size} disabled={busy === 'batch' || busy === 'exporting'}
                        onClick={() => { setDtfDotSize(size); invalidateBatch() }}>{label}</button>)}
                  </div>
                </div>
                <label className="images-cleanup-slider">
                  <span><strong>Limpiar restos de alfa</strong><output>{alphaCleanup}%</output></span>
                  <input type="range" min={0} max={30} step={1} value={alphaCleanup}
                    disabled={busy === 'batch' || busy === 'exporting'}
                    onChange={(event) => { setAlphaCleanup(Number(event.currentTarget.value)); invalidateBatch() }}/>
                </label>
              </div>}
              <p className="images-production-explain">
                DTF: conserva colores originales y sólidos; la trama se genera a tamaño final.
                El modo protegido prioriza detalles de contraste. Verifica el tamaño mínimo del punto
                y el resultado del RIP con el taller. Usa zoom para evaluar trazos finos.
              </p>
              {inkMode === 'black' && settings.shadowThreshold > 85 && <p className="images-dtf-warning">
                Si aún ves puntitos en la cara o sombras del personaje, reduce
                «Eliminar sombras» o prueba el preset «Negro puro»: ese ajuste puede
                volver semitransparentes zonas de la ilustración antes del tramado.
              </p>}
            </>}
            {alphaStats && <p className="images-alpha-diagnostic">
              Alfa parcial: <strong>{(alphaStats.original.partial / Math.max(1, alphaStats.original.total) * 100).toFixed(1)}%</strong>
              {' '}→ <strong>{(alphaStats.result.partial / Math.max(1, alphaStats.result.total) * 100).toFixed(1)}%</strong> en vista previa.
              {shouldOptimizeAlpha(alphaSettings) && <span>La exportación DTF tendrá alfa 0 o 255.</span>}
            </p>}
          </section>
          <section className="images-production-section" aria-label="Gestión del color PNG">
            <div className="images-output-heading">
              <span>04 / GESTIÓN DE COLOR</span>
              <h3>PNG listo para impresión</h3>
            </div>
            <div className="images-color-rule">
              <span><strong>Convertir a sRGB</strong><small>Decodificación con gestión ICC del navegador → Canvas 2D sRGB</small></span>
              <span className="images-color-active">Activo</span>
            </div>
            <button type="button" className="images-color-rule images-color-toggle"
              aria-pressed={embedProfile} disabled={busy === 'batch' || busy === 'exporting'}
              onClick={() => { setEmbedProfile((value) => !value); invalidateBatch() }}>
              <span><strong>Incrustar perfil ICC sRGB</strong><small>Perfil real dentro del PNG (iCCP)</small></span>
              <span className={embedProfile ? 'images-color-switch on' : 'images-color-switch'} aria-hidden="true"><i /></span>
            </button>
            <div className="images-color-rule">
              <span><strong>Profundidad de color</strong><small>Con transparencia y sin paleta indexada</small></span>
              <span className="images-color-active">RGBA · 8 bits</span>
            </div>
            <p className="images-production-explain">
              Se verifican RGBA 8 bits, el perfil ICC seleccionado y los 300 ppp cuando corresponden.
              sRGB mejora la consistencia, pero el RIP y la calibración del taller siguen influyendo en el color.
            </p>
          </section>

          <div className="images-bottom-actions">
            <button onClick={() => inputRef.current?.click()} className="images-replace" disabled={busy === 'batch' || busy === 'exporting'}>
              <Upload size={16} /> {workspaceMode === 'batch' ? 'Añadir al lote' : file ? 'Cambiar imagen' : 'Subir imagen'}
            </button>
            {(workspaceMode === 'batch' ? batchItems.length > 0 : Boolean(file)) && <button
              className="images-clear" disabled={busy !== null}
              onClick={workspaceMode === 'batch' ? clearBatch : clear}
              title={workspaceMode === 'batch' ? 'Vaciar lote' : 'Cerrar imagen'}>
              <X size={16} />
            </button>}
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
