export type PreflightPhase = 'preparing' | 'preloading' | 'warming' | 'ready'
export type RecordingResourceKind = 'model' | 'image' | 'video' | 'audio' | 'font'

export interface RecordingResource {
  id: string
  label: string
  kind: RecordingResourceKind
  url?: string | null
  fontFamily?: string
}

export interface RecordingManifestInput {
  modelUrl: string
  images: { id: string; label: string; url: string | null | undefined }[]
  background?: { type: 'color' | 'image' | 'video'; url: string | null; name: string | null }
  music?: { url: string | null; name: string | null }
  backgroundAudioEnabled?: boolean
  fonts?: string[]
}

export interface PreflightProgress {
  phase: PreflightPhase
  completed: number
  total: number
  message: string
}

export function buildRecordingResourceManifest(input: RecordingManifestInput): RecordingResource[] {
  const resources: RecordingResource[] = [{ id: 'garment-model', label: 'Modelo 3D', kind: 'model', url: input.modelUrl }]
  const seen = new Set<string>()
  input.images.forEach((image) => {
    if (!image.url || seen.has(image.url)) return
    seen.add(image.url); resources.push({ id: image.id, label: image.label, kind: 'image', url: image.url })
  })
  if (input.background?.url && input.background.type !== 'color') resources.push({ id: 'background', label: input.background.name ?? 'Fondo', kind: input.background.type, url: input.background.url })
  if (input.music?.url) resources.push({ id: 'music', label: input.music.name ?? 'Música', kind: 'audio', url: input.music.url })
  if (input.backgroundAudioEnabled && input.background?.type === 'video' && input.background.url) resources.push({ id: 'background-audio', label: 'Audio del fondo', kind: 'audio', url: input.background.url })
  ;[...new Set(input.fonts ?? [])].forEach((fontFamily) => resources.push({ id: `font-${fontFamily}`, label: `Fuente ${fontFamily}`, kind: 'font', fontFamily }))
  return resources
}

const waitEvent = (element: HTMLMediaElement, eventName: 'loadeddata' | 'loadedmetadata', timeoutMs: number) => new Promise<void>((resolve, reject) => {
  if ((eventName === 'loadeddata' && element.readyState >= 2) || (eventName === 'loadedmetadata' && element.readyState >= 1)) { resolve(); return }
  const timeout = window.setTimeout(() => { cleanup(); reject(new Error('Tiempo de espera agotado.')) }, timeoutMs)
  const loaded = () => { cleanup(); resolve() }
  const failed = () => { cleanup(); reject(new Error('El navegador no pudo decodificar el recurso.')) }
  const cleanup = () => { window.clearTimeout(timeout); element.removeEventListener(eventName, loaded); element.removeEventListener('error', failed) }
  element.addEventListener(eventName, loaded, { once: true }); element.addEventListener('error', failed, { once: true })
})

async function preloadResource(resource: RecordingResource, backgroundMedia: HTMLImageElement | HTMLVideoElement | null, timeoutMs: number) {
  if (resource.kind === 'model') {
    if (!resource.url || resource.url === 'procedural-garment') return
    const response = await fetch(resource.url, { cache: 'force-cache' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    await response.arrayBuffer()
    return
  }
  if (resource.kind === 'font') {
    if (document.fonts && resource.fontFamily) await document.fonts.load(`16px "${resource.fontFamily}"`)
    return
  }
  if (!resource.url) throw new Error('No tiene una URL preparada.')
  if (resource.kind === 'image') {
    const image = new Image(); image.decoding = 'async'; image.src = resource.url
    await Promise.race([image.decode(), new Promise((_, reject) => window.setTimeout(() => reject(new Error('Tiempo de espera agotado.')), timeoutMs))])
    return
  }
  if (resource.id === 'background' && backgroundMedia) {
    if (backgroundMedia instanceof HTMLImageElement) await backgroundMedia.decode()
    else await waitEvent(backgroundMedia, 'loadeddata', timeoutMs)
    return
  }
  const media = document.createElement(resource.kind === 'video' ? 'video' : 'audio')
  media.preload = 'auto'; media.src = resource.url
  try { await waitEvent(media, resource.kind === 'video' ? 'loadeddata' : 'loadedmetadata', timeoutMs) }
  finally { media.removeAttribute('src'); media.load() }
}

function nextFrame() { return new Promise<void>((resolve) => requestAnimationFrame(() => resolve())) }

async function waitForCanvas(canvas: HTMLCanvasElement | null, width: number, height: number, timeoutMs: number) {
  const started = performance.now()
  while (!canvas || canvas.width < width - 2 || canvas.height < height - 2) {
    if (performance.now() - started > timeoutMs) throw new Error('La GPU no pudo preparar la resolución solicitada.')
    await nextFrame()
  }
}

export async function runRecordingPreflight({ manifest, canvas, width, height, backgroundMedia, onProgress, timeoutMs = 15_000 }: {
  manifest: RecordingResource[]
  canvas: HTMLCanvasElement | null
  width: number
  height: number
  backgroundMedia: HTMLImageElement | HTMLVideoElement | null
  onProgress: (progress: PreflightProgress) => void
  timeoutMs?: number
}) {
  onProgress({ phase: 'preparing', completed: 0, total: manifest.length, message: `Manifiesto preparado · ${manifest.length} recursos` })
  let completed = 0
  for (const resource of manifest) {
    onProgress({ phase: 'preloading', completed, total: manifest.length, message: `Preparando ${resource.label}` })
    try { await preloadResource(resource, backgroundMedia, timeoutMs) }
    catch (error) { throw new Error(`${resource.label}: ${error instanceof Error ? error.message : 'no se pudo preparar'}`) }
    completed += 1
    onProgress({ phase: 'preloading', completed, total: manifest.length, message: `${resource.label} listo` })
  }
  if (document.fonts) await document.fonts.ready
  onProgress({ phase: 'warming', completed, total: manifest.length, message: 'Preparando GPU y shaders' })
  await waitForCanvas(canvas, width, height, timeoutMs)
  await nextFrame(); await nextFrame(); await nextFrame()
  onProgress({ phase: 'ready', completed, total: manifest.length, message: 'Todos los recursos están listos' })
  return { resourceCount: manifest.length, width, height }
}
