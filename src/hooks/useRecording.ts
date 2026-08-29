import { useCallback, useRef } from 'react'
import type { AudioTrackSettings, BackgroundSettings, CollectionItem, DesignCombination, DirectorProject, LayerTiming, StageLayerId, StageOverlayLayer, SystemLayerId, VariantLabelSettings } from '../types/studio'
import { evaluateBackgroundFrame, evaluateDirectorFrame, evaluateLayerFrame, type LayerFrame } from '../utils/stageTimeline'
import { activeAssetClips, activeClip, activeLabelClips, clipOpacity } from '../config/advancedDirectors'
import { getGridLayout } from '../utils/gridLayout'

type Args = {
  renderCanvas: HTMLCanvasElement | null
  media: HTMLImageElement | HTMLVideoElement | null
  background: BackgroundSettings
  music: AudioTrackSettings
  overlayLayers: StageOverlayLayer[]
  layerOrder: StageLayerId[]
  systemLayerTimings: Record<SystemLayerId, LayerTiming>
  advancedProject: DirectorProject
  collectionItems?: CollectionItem[]
  designCombinations?: DesignCombination[]
  duration: number
  width: number
  height: number
  bitrate: number
  fps: number
  onProgress: (seconds: number) => void
  onFinalizing: () => void
  onFinish: (message: string) => void
  onError: (message: string) => void
}

const readyMedia = (media: HTMLImageElement | HTMLVideoElement | null) => Boolean(media && ((media instanceof HTMLImageElement && media.complete) || (media instanceof HTMLVideoElement && media.readyState >= 2)))

function withFrame(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, frame: LayerFrame, draw: () => void, opacityMultiplier = 1) {
  if (!frame.visible || frame.opacity <= 0) return
  context.save(); context.globalAlpha *= frame.opacity * opacityMultiplier
  context.translate(canvas.width * (.5 + frame.translateX / 100), canvas.height * (.5 + frame.translateY / 100))
  context.scale(frame.scale, frame.scale); context.translate(-canvas.width / 2, -canvas.height / 2)
  draw(); context.restore()
}

function drawCover(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, media: HTMLImageElement | HTMLVideoElement) {
  const sourceWidth = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth
  const sourceHeight = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight
  if (!sourceWidth || !sourceHeight) return
  const scale = Math.max(canvas.width / sourceWidth, canvas.height / sourceHeight)
  const width = sourceWidth * scale; const height = sourceHeight * scale
  context.drawImage(media, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
}

export function useRecording() {
  const stopRef = useRef<(() => void) | null>(null)
  const start = useCallback((args: Args) => {
    const { renderCanvas, media, background, music, overlayLayers, layerOrder, systemLayerTimings, advancedProject, collectionItems = [], designCombinations = [], duration, width: outputWidth, height: outputHeight, bitrate, fps, onProgress, onFinalizing, onFinish, onError } = args
    if (!renderCanvas || !renderCanvas.captureStream) { onError('Este navegador no permite capturar el canvas.'); return }
    const composition = document.createElement('canvas'); composition.width = outputWidth; composition.height = outputHeight
    if (!composition.width || !composition.height) { onError('El preview aún no está listo.'); return }
    const context = composition.getContext('2d')
    if (!context) { onError('No se pudo crear el canvas de exportación.'); return }
    const overlayImages = new Map<string, HTMLImageElement>()
    overlayLayers.forEach((layer) => { if (layer.type === 'image' && layer.url) { const image = new Image(); image.src = layer.url; overlayImages.set(layer.id, image) } })
    const drawBackground = (seconds: number) => withFrame(context, composition, evaluateBackgroundFrame(advancedProject, systemLayerTimings.background, seconds), () => {
      context.fillStyle = background.color; context.fillRect(0, 0, composition.width, composition.height)
      if (media && readyMedia(media)) { context.save(); context.filter = `blur(${background.blur * .18 * outputWidth / 1080}px)`; drawCover(context, composition, media); context.restore() }
      if (background.darkness) { context.fillStyle = `rgba(0,0,0,${background.darkness / 100})`; context.fillRect(0, 0, composition.width, composition.height) }
    })
    const drawGarment = (seconds: number) => {
      const directedFrame = evaluateDirectorFrame(advancedProject, seconds, 'recording')
      withFrame(context, composition, directedFrame, () => context.drawImage(renderCanvas, 0, 0, composition.width, composition.height))
    }
    const drawOverlay = (layer: StageOverlayLayer, seconds: number) => {
      const clips = activeAssetClips(advancedProject, layer.id, seconds)
      const frame = { visible: clips.length > 0, opacity: clips.length ? Math.max(...clips.map((item) => clipOpacity(item, seconds))) : 0, translateX: 0, translateY: 0, scale: 1 }; if (!frame.visible || frame.opacity <= 0) return
      const centerX = composition.width * (layer.x + frame.translateX) / 100; const centerY = composition.height * (layer.y + frame.translateY) / 100
      const layerWidth = composition.width * layer.width / 100
      context.save(); context.globalAlpha = frame.opacity * layer.opacity / 100; context.translate(centerX, centerY); context.rotate(layer.rotation * Math.PI / 180); context.scale(frame.scale, frame.scale)
      if (layer.type === 'image') {
        const image = overlayImages.get(layer.id)
        if (image?.complete && image.naturalWidth) { const height = layerWidth * image.naturalHeight / image.naturalWidth; context.drawImage(image, -layerWidth / 2, -height / 2, layerWidth, height) }
      } else {
        const fontSize = composition.width * layer.fontSize / 100
        context.fillStyle = layer.color; context.font = `${layer.fontWeight} ${fontSize}px Manrope, sans-serif`; context.textAlign = 'center'; context.textBaseline = 'middle'
        const lines = layer.text.split('\n'); const lineHeight = fontSize * 1.15; const top = -(lines.length - 1) * lineHeight / 2
        lines.forEach((line, index) => context.fillText(line, 0, top + index * lineHeight, layerWidth))
      }
      context.restore()
    }
    const videoStream = composition.captureStream(fps); let audioContext: AudioContext | null = null; const audioElements: HTMLAudioElement[] = []
    let musicElement: HTMLAudioElement | null = null; let musicGain: GainNode | null = null; let backgroundGain: GainNode | null = null; let backgroundElement: HTMLAudioElement | null = null
    let captureStream: MediaStream = videoStream
    const needsBackgroundAudio = background.type === 'video' && Boolean(background.url) && background.videoAudioEnabled
    const needsMusic = Boolean(music.url)
    if (needsBackgroundAudio || needsMusic) {
      try {
        audioContext = new AudioContext(); const destination = audioContext.createMediaStreamDestination()
        const connect = (url: string, volume: number, loop: boolean) => {
          const element = document.createElement('audio'); element.src = url; element.preload = 'auto'; element.loop = loop
          const gain = audioContext!.createGain(); gain.gain.value = volume; audioContext!.createMediaElementSource(element).connect(gain).connect(destination); audioElements.push(element)
          return { element, gain }
        }
        if (needsBackgroundAudio && background.url) { const backgroundAudio = connect(background.url, background.videoVolume / 100, true); backgroundElement = backgroundAudio.element; backgroundGain = backgroundAudio.gain; backgroundAudio.element.currentTime = 0; void backgroundAudio.element.play().catch(() => undefined) }
        if (needsMusic && music.url) { const connectedMusic = connect(music.url, 0, false); musicElement = connectedMusic.element; musicGain = connectedMusic.gain }
        void audioContext.resume().catch(() => undefined)
        captureStream = new MediaStream([...videoStream.getVideoTracks(), ...destination.stream.getAudioTracks()])
      } catch { audioElements.forEach((element) => element.pause()); void audioContext?.close(); onError('El navegador no pudo crear la mezcla de audio.'); return }
    }
    const updateAudio = (seconds: number) => {
      if (backgroundGain && backgroundElement) {
        const clips = activeAssetClips(advancedProject, 'background-audio', seconds); const gain = clips.length ? Math.max(...clips.map((item) => clipOpacity(item, seconds))) * background.videoVolume / 100 : 0
        backgroundGain.gain.value = gain
        if (gain > 0 && backgroundElement.paused) void backgroundElement.play().catch(() => undefined)
        if (gain <= 0 && !backgroundElement.paused) backgroundElement.pause()
      }
      if (!musicElement || !musicGain) return
      const advancedMusic = activeAssetClips(advancedProject, 'music', seconds)[0]
      const gain = advancedMusic ? clipOpacity(advancedMusic, seconds) * music.volume / 100 : 0; const sourceTime = advancedMusic ? advancedMusic.sourceStart + seconds - advancedMusic.start : 0; musicGain.gain.value = gain
      if (gain > 0) {
        if (musicElement.readyState >= 1 && Math.abs(musicElement.currentTime - sourceTime) > .28) musicElement.currentTime = Math.min(sourceTime, Math.max(0, music.sourceDuration - .02))
        if (musicElement.paused) void musicElement.play().catch(() => undefined)
      } else if (!musicElement.paused) musicElement.pause()
    }
    const cleanupAudio = () => { audioElements.forEach((element) => { element.pause(); element.removeAttribute('src'); element.load() }); void audioContext?.close(); videoStream.getTracks().forEach((track) => track.stop()) }
    let frame = 0; const started = performance.now(); let recorder: MediaRecorder
    const draw = (seconds: number) => {
      context.clearRect(0, 0, composition.width, composition.height); context.fillStyle = '#000'; context.fillRect(0, 0, composition.width, composition.height)
      drawBackground(seconds)
      layerOrder.forEach((id) => { if (id === 'garment') drawGarment(seconds); else { const layer = overlayLayers.find((item) => item.id === id); if (layer) drawOverlay(layer, seconds) } })
      const directorItem = activeClip(advancedProject, 'director', seconds)
      if (directorItem?.type === 'gridScene') {
        const count = advancedProject.id === 'collection' ? directorItem.itemIds?.length ?? 0 : directorItem.itemIds?.length ?? 0
        context.save(); context.strokeStyle = 'rgba(160,190,220,.22)'; context.lineWidth = Math.max(1, outputWidth / 900); getGridLayout(count).forEach((cell) => context.strokeRect(cell.x * outputWidth, (1 - cell.y - cell.height) * outputHeight, cell.width * outputWidth, cell.height * outputHeight)); context.restore()
      }
      activeLabelClips(advancedProject, seconds).forEach((item) => {
        const collectionItem = item.collectionItemId ? collectionItems.find((candidate) => candidate.id === item.collectionItemId) : null
        const combination = item.designCombinationId ? designCombinations.find((candidate) => candidate.id === item.designCombinationId) : null
        if (!item.variantId && !collectionItem && !combination) return
        const settings: VariantLabelSettings | undefined = collectionItem?.label ?? combination?.label ?? (item.variantId ? advancedProject.labels[item.variantId] : undefined)
        if (!settings?.enabled) return
        const transition = evaluateLayerFrame({ start: item.start, duration: item.duration, enter: settings.enter, exit: settings.exit }, seconds)
        let xPercent = settings.x + transition.translateX; let yPercent = settings.y + transition.translateY
        if (directorItem?.type === 'gridScene') {
          const sceneItems = collectionItem ? (directorItem.itemIds ?? []).map((id) => collectionItems.find((candidate) => candidate.id === id)).filter((candidate): candidate is CollectionItem => Boolean(candidate)) : []
          const sceneCombinationIds = combination ? directorItem.itemIds ?? [] : []
          const index = collectionItem ? sceneItems.findIndex((candidate) => candidate.id === collectionItem.id) : combination ? sceneCombinationIds.indexOf(combination.id) : 0
          const cell = getGridLayout(Math.max(1, collectionItem ? sceneItems.length : sceneCombinationIds.length || 1))[Math.max(0, index)]; xPercent = (cell.x + xPercent / 100 * cell.width) * 100; yPercent = (1 - cell.y - cell.height + yPercent / 100 * cell.height) * 100
        }
        const baseOpacity = clipOpacity(item, seconds) * transition.opacity; const fontSize = composition.width * settings.fontSize / 100; context.save(); context.globalAlpha = baseOpacity; context.font = `700 ${fontSize}px ${settings.fontFamily}, sans-serif`; context.textAlign = 'center'; context.textBaseline = 'middle'
        const metrics = context.measureText(settings.text); const hasBox = settings.backgroundEnabled || settings.borderEnabled; const paddingX = hasBox ? fontSize * .7 : 0; const paddingY = hasBox ? fontSize * .42 : 0; const x = composition.width * xPercent / 100; const y = composition.height * yPercent / 100
        const boxX = x - metrics.width / 2 - paddingX; const boxY = y - fontSize / 2 - paddingY; const boxWidth = metrics.width + paddingX * 2; const boxHeight = fontSize + paddingY * 2
        if (settings.backgroundEnabled && settings.backdropBlurEnabled) { context.save(); context.beginPath(); context.roundRect(boxX, boxY, boxWidth, boxHeight, settings.borderRadius * outputWidth / 1080); context.clip(); context.filter = `blur(${Math.max(2, outputWidth / 135)}px)`; context.drawImage(composition, 0, 0); context.restore() }
        context.translate(x, y); context.scale(transition.scale, transition.scale); context.translate(-x, -y); context.beginPath(); context.roundRect(boxX, boxY, boxWidth, boxHeight, settings.borderRadius * outputWidth / 1080)
        if (settings.shadowEnabled && hasBox) { context.shadowColor = 'rgba(0,0,0,.58)'; context.shadowBlur = fontSize * .42; context.shadowOffsetY = fontSize * .16 }
        if (settings.backgroundEnabled) { context.fillStyle = settings.backgroundColor; context.globalAlpha = baseOpacity * settings.backgroundOpacity / 100; context.fill() }
        if (settings.borderEnabled && settings.borderWidth > 0) { context.globalAlpha = baseOpacity; context.shadowColor = 'transparent'; context.strokeStyle = settings.borderColor; context.lineWidth = settings.borderWidth * outputWidth / 1080; context.stroke() }
        context.globalAlpha = baseOpacity; context.shadowColor = settings.shadowEnabled && !hasBox ? 'rgba(0,0,0,.72)' : 'transparent'; context.shadowBlur = settings.shadowEnabled && !hasBox ? fontSize * .28 : 0; context.shadowOffsetY = settings.shadowEnabled && !hasBox ? fontSize * .08 : 0; context.fillStyle = settings.color; context.fillText(settings.text, x, y); context.restore()
      })
    }
    const loop = () => { const seconds = Math.min(duration, (performance.now() - started) / 1000); updateAudio(seconds); draw(seconds); onProgress(seconds); frame = requestAnimationFrame(loop) }
    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9', 'video/webm'].find((value) => MediaRecorder.isTypeSupported(value))
    try { recorder = new MediaRecorder(captureStream, mime ? { mimeType: mime, videoBitsPerSecond: bitrate, audioBitsPerSecond: 192_000 } : undefined) } catch { cleanupAudio(); onError('No se pudo iniciar MediaRecorder en este navegador.'); return }
    const chunks: BlobPart[] = []
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
    recorder.onerror = () => onError('La grabación se interrumpió inesperadamente.')
    recorder.onstop = () => {
      onFinalizing()
      cancelAnimationFrame(frame); cleanupAudio()
      const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' }); const url = URL.createObjectURL(blob); const link = document.createElement('a')
      link.href = url; link.download = `garment-ad-${outputWidth}x${outputHeight}-${Date.now()}.webm`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
      onFinish(`Video ${outputWidth} × ${outputHeight} a ${fps} FPS exportado en WebM${needsBackgroundAudio || needsMusic ? ' con audio' : ''}.`)
    }
    updateAudio(0); draw(0); frame = requestAnimationFrame(loop); recorder.start(250)
    const timer = window.setTimeout(() => recorder.state !== 'inactive' && recorder.stop(), duration * 1000)
    stopRef.current = () => { window.clearTimeout(timer); if (recorder.state !== 'inactive') recorder.stop() }
  }, [])
  return { start, stop: () => stopRef.current?.() }
}
