import { inspectPng } from './colorManagement'

export type CompressionResult = {
  blob: Blob
  originalBytes: number
  finalBytes: number
  status: 'optimized' | 'unchanged' | 'skipped' | 'failed'
  note?: string
}

const MAX_PIXELS_MOBILE = 20_000_000
const MAX_PIXELS_DESKTOP = 34_000_000

type WorkerOutput =
  | { id: number; optimized: ArrayBuffer }
  | { id: number; error: string }

const samePrintMetadata = async (original: Blob, compressed: Blob) => {
  const [before, after] = await Promise.all([inspectPng(original), inspectPng(compressed)])
  return before.width === after.width
    && before.height === after.height
    && before.bitDepth === 8 && after.bitDepth === 8
    && before.colorType === 6 && after.colorType === 6
    && before.icc === after.icc
    && before.dpi === after.dpi
}

/**
 * Safe browser-local PNG recompression. No pixels, ICC or pHYs may change.
 * Any failure, timeout, metadata mismatch or size increase keeps the source.
 */
export async function optimizePngLosslessly(source: Blob): Promise<CompressionResult> {
  const fallback = (status: CompressionResult['status'], note?: string): CompressionResult => ({
    blob: source,
    originalBytes: source.size,
    finalBytes: source.size,
    status,
    note,
  })

  try {
    const metadata = await inspectPng(source)
    const maxPixels = window.matchMedia('(max-width: 720px)').matches
      ? MAX_PIXELS_MOBILE : MAX_PIXELS_DESKTOP
    if (metadata.width * metadata.height > maxPixels) {
      return fallback('skipped', 'La compresión avanzada se omitió para proteger la memoria del dispositivo.')
    }
    if (metadata.bitDepth !== 8 || metadata.colorType !== 6) {
      return fallback('skipped', 'El optimizador solo acepta RGBA de 8 bits por canal.')
    }

    const input = await source.arrayBuffer()
    let worker: Worker
    try {
      worker = new Worker(new URL('./pngOptimize.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      return fallback('failed', 'El navegador no pudo iniciar la optimización; se utilizó el PNG original.')
    }

    // Never trap an export behind compression. If the native recompressor cannot
    // finish quickly, terminate it and return the verified source PNG unchanged.
    const timeoutMs = window.matchMedia('(max-width: 720px)').matches ? 8_000 : 12_000
    const output = await new Promise<ArrayBuffer>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        reject(new Error('La optimización excedió el tiempo seguro; se utilizó el PNG original.'))
      }, timeoutMs)
      worker.addEventListener('message', (event: MessageEvent<WorkerOutput>) => {
        if (event.data.id !== 1) return
        window.clearTimeout(timer)
        if ('error' in event.data) reject(new Error(event.data.error))
        else resolve(event.data.optimized)
      }, { once: true })
      worker.addEventListener('error', (event) => {
        window.clearTimeout(timer)
        reject(new Error(event.message || 'Falló el compresor nativo.'))
      }, { once: true })
      // Transfer the input buffer instead of creating a second large copy.
      worker.postMessage({ id: 1, png: input }, [input])
    }).finally(() => worker.terminate())

    const candidate = new Blob([output], { type: 'image/png' })
    if (candidate.size >= source.size) return fallback('unchanged')
    if (!(await samePrintMetadata(source, candidate))) {
      return fallback('failed', 'La compresión alteró el formato RGBA, el ICC o los 300 ppp; se conservó el original.')
    }
    return {
      blob: candidate,
      originalBytes: source.size,
      finalBytes: candidate.size,
      status: 'optimized',
    }
  } catch (error) {
    return fallback('failed', error instanceof Error ? error.message : 'La compresión no se pudo completar.')
  }
}

export function describeCompression(result: CompressionResult) {
  if (result.status !== 'optimized') {
    return result.note ?? (result.status === 'unchanged'
      ? 'El PNG original ya es igual o menor que la versión optimizada.'
      : 'Se utilizó el PNG original sin modificar.')
  }
  const mb = (size: number) => (size / 1_000_000).toFixed(2) + ' MB'
  const saved = (100 * (result.originalBytes - result.finalBytes) / result.originalBytes).toFixed(1)
  return mb(result.originalBytes) + ' → ' + mb(result.finalBytes) + ' (−' + saved + '%), sin pérdida.'
}
