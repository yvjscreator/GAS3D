import { useCallback, useRef } from 'react'
import type { BackgroundSettings } from '../types/studio'

type Args = { renderCanvas: HTMLCanvasElement | null; media: HTMLImageElement | HTMLVideoElement | null; background: BackgroundSettings; duration: number; onProgress: (seconds: number) => void; onFinish: (message: string) => void; onError: (message: string) => void }

export function useRecording() {
  const stopRef = useRef<(() => void) | null>(null)
  const start = useCallback((args: Args) => {
    const { renderCanvas, media, background, duration, onProgress, onFinish, onError } = args
    if (!renderCanvas || !renderCanvas.captureStream) { onError('Este navegador no permite capturar el canvas.'); return }
    const composition = document.createElement('canvas')
    composition.width = renderCanvas.width; composition.height = renderCanvas.height
    if (!composition.width || !composition.height) { onError('El preview aún no está listo.'); return }
    const context = composition.getContext('2d')
    if (!context) { onError('No se pudo crear el canvas de exportación.'); return }
    const draw = () => {
      context.clearRect(0, 0, composition.width, composition.height)
      context.fillStyle = background.color; context.fillRect(0, 0, composition.width, composition.height)
      if (media && ((media instanceof HTMLImageElement && media.complete) || (media instanceof HTMLVideoElement && media.readyState >= 2))) {
        const sourceWidth = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth
        const sourceHeight = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight
        const scale = Math.max(composition.width / sourceWidth, composition.height / sourceHeight)
        const width = sourceWidth * scale, height = sourceHeight * scale
        context.filter = `blur(${background.blur * 0.18}px)`
        context.drawImage(media, (composition.width - width) / 2, (composition.height - height) / 2, width, height)
        context.filter = 'none'
      }
      if (background.darkness) { context.fillStyle = `rgba(0,0,0,${background.darkness / 100})`; context.fillRect(0, 0, composition.width, composition.height) }
      context.drawImage(renderCanvas, 0, 0, composition.width, composition.height)
    }
    let frame = 0; const started = performance.now(); let recorder: MediaRecorder
    const loop = () => { draw(); onProgress(Math.min(duration, (performance.now() - started) / 1000)); frame = requestAnimationFrame(loop) }
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((value) => MediaRecorder.isTypeSupported(value))
    try {
      recorder = new MediaRecorder(composition.captureStream(30), mime ? { mimeType: mime, videoBitsPerSecond: 7_000_000 } : undefined)
    } catch { onError('No se pudo iniciar MediaRecorder en este navegador.'); return }
    const chunks: BlobPart[] = []
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
    recorder.onerror = () => onError('La grabación se interrumpió inesperadamente.')
    recorder.onstop = () => {
      cancelAnimationFrame(frame)
      const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' })
      const url = URL.createObjectURL(blob); const link = document.createElement('a')
      link.href = url; link.download = `garment-ad-${Date.now()}.webm`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
      onFinish('Video exportado en WebM.')
    }
    draw(); frame = requestAnimationFrame(loop); recorder.start(250)
    const timer = window.setTimeout(() => recorder.state !== 'inactive' && recorder.stop(), duration * 1000)
    stopRef.current = () => { window.clearTimeout(timer); if (recorder.state !== 'inactive') recorder.stop() }
  }, [])
  return { start, stop: () => stopRef.current?.() }
}
