import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { BackgroundLayer } from './BackgroundLayer'
import { GarmentViewer } from '../viewer/GarmentViewer'
import { exportPresets } from '../../config/exportPresets'
import type { BackgroundSettings, FormatId, LayerTiming, RecordingStatus, StageLayerId, StageOverlayLayer, SystemLayerId } from '../../types/studio'
import type { GarmentViewerProps } from '../viewer/GarmentViewer'
import { evaluateBackgroundFrame, evaluateDirectorFrame, evaluateLayerFrame, type StagePlaybackState } from '../../utils/stageTimeline'
import type { ProfessionalRecordingFrame } from '../../config/professionalRecording'
import type { CollectionItem, DesignCombination, DirectorProject, GarmentVariantId, VariantLabelSettings } from '../../types/studio'
import { activeAssetClips, activeClip, activeLabelClips, clipOpacity } from '../../config/advancedDirectors'
import { AdvancedGridViewer, type GridVariantView } from '../viewer/AdvancedGridViewer'
import { getGridLayout } from '../../utils/gridLayout'

type Props = {
  format: FormatId
  background: BackgroundSettings
  viewer: Omit<GarmentViewerProps, 'onCanvasReady' | 'background' | 'backgroundMediaRef'>
  onCanvasReady: (canvas: HTMLCanvasElement) => void
  mediaRef: React.MutableRefObject<HTMLImageElement | HTMLVideoElement | null>
  overlayLayers: StageOverlayLayer[]
  layerOrder: StageLayerId[]
  selectedLayerId: StageLayerId
  systemLayerTimings: Record<SystemLayerId, LayerTiming>
  duration: number
  playbackKey: number
  recordingStatus: RecordingStatus
  recordingElapsed: number
  professionalFrame?: ProfessionalRecordingFrame | null
  advancedProject?: DirectorProject | null
  advancedTime?: number
  advancedGridViews?: GridVariantView[] | null
  playbackState?: StagePlaybackState
  collectionItems?: CollectionItem[]
  designCombinations?: DesignCombination[]
  onSelectLayer: (id: StageLayerId) => void
  onUpdateOverlay: (id: string, value: Partial<StageOverlayLayer>) => void
}

const frameStyle = (timing: LayerTiming, time: number, zIndex: number, opacityMultiplier = 1): CSSProperties => {
  const frame = evaluateLayerFrame(timing, time)
  return { zIndex, opacity: frame.opacity * opacityMultiplier, visibility: frame.visible ? 'visible' : 'hidden', transform: `translate(${frame.translateX}%, ${frame.translateY}%) scale(${frame.scale})` }
}

export function AdStage({ format, background, viewer, onCanvasReady, mediaRef, overlayLayers, layerOrder, selectedLayerId, systemLayerTimings, duration, playbackKey, recordingStatus, recordingElapsed, professionalFrame = null, advancedProject = null, advancedTime, advancedGridViews = null, playbackState = 'editing', collectionItems = [], designCombinations = [], onSelectLayer, onUpdateOverlay }: Props) {
  const ratio = exportPresets[format].ratio; const frameRef = useRef<HTMLDivElement>(null)
  const [previewTime, setPreviewTime] = useState(.72); const [playing, setPlaying] = useState(false)
  const selectedTiming = selectedLayerId === 'background' || selectedLayerId === 'garment' ? systemLayerTimings[selectedLayerId] : overlayLayers.find((layer) => layer.id === selectedLayerId)?.timing
  useEffect(() => { if (!playing && recordingStatus !== 'recording' && selectedTiming) setPreviewTime(selectedTiming.start + Math.min(.72, selectedTiming.duration * .45)) }, [playing, recordingStatus, selectedLayerId, selectedTiming])
  useEffect(() => {
    if (!playbackKey) return
    let frame = 0; const started = performance.now(); setPlaying(true); setPreviewTime(0)
    const loop = () => { const elapsed = (performance.now() - started) / 1000; setPreviewTime(Math.min(duration, elapsed)); if (elapsed < duration) frame = requestAnimationFrame(loop); else setPlaying(false) }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [duration, playbackKey])
  const time = advancedProject && advancedTime !== undefined ? advancedTime : recordingStatus === 'recording' ? recordingElapsed : previewTime
  const zById = useMemo(() => new Map(layerOrder.map((id, index) => [id, index + 2])), [layerOrder])
  const beginDrag = (event: ReactPointerEvent<HTMLElement>, layer: StageOverlayLayer) => {
    if (recordingStatus === 'recording' || !frameRef.current) return
    event.preventDefault(); event.stopPropagation(); onSelectLayer(layer.id); event.currentTarget.setPointerCapture(event.pointerId)
    const bounds = frameRef.current.getBoundingClientRect(); const startX = event.clientX; const startY = event.clientY; const originalX = layer.x; const originalY = layer.y
    const move = (moveEvent: PointerEvent) => {
      let dx = (moveEvent.clientX - startX) / bounds.width * 100; let dy = (moveEvent.clientY - startY) / bounds.height * 100
      if (moveEvent.shiftKey) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0 }
      onUpdateOverlay(layer.id, { x: Math.min(100, Math.max(0, originalX + dx)), y: Math.min(100, Math.max(0, originalY + dy)) })
    }
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop)
  }
  const beginResize = (event: ReactPointerEvent<HTMLButtonElement>, layer: StageOverlayLayer) => {
    if (recordingStatus === 'recording' || !frameRef.current) return
    event.preventDefault(); event.stopPropagation(); const bounds = frameRef.current.getBoundingClientRect(); const startX = event.clientX; const originalWidth = layer.width
    const move = (moveEvent: PointerEvent) => onUpdateOverlay(layer.id, { width: Math.min(100, Math.max(4, originalWidth + (moveEvent.clientX - startX) / bounds.width * 100)) })
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop)
  }
  const assetFrame = (assetId: string) => {
    if (!advancedProject) return null
    const clips = activeAssetClips(advancedProject, assetId, time)
    if (!clips.length) return { visible: false, opacity: 0, translateX: 0, translateY: 0, scale: 1 }
    return { visible: true, opacity: Math.max(...clips.map((item) => clipOpacity(item, time))), translateX: 0, translateY: 0, scale: 1 }
  }
  const directorClip = advancedProject && playbackState !== 'editing' ? activeClip(advancedProject, 'director', time) : null
  const gridActive = directorClip?.type === 'gridScene'
  const directorFrame = evaluateDirectorFrame(advancedProject, time, playbackState, professionalFrame?.garmentOpacity ?? 1)
  const backgroundFrame = evaluateBackgroundFrame(advancedProject, systemLayerTimings.background, time)
  const labelClips = advancedProject && playbackState !== 'editing' ? activeLabelClips(advancedProject, time) : []
  const backgroundAudioClips = advancedProject ? activeAssetClips(advancedProject, 'background-audio', time) : []
  const stageBackground = advancedProject ? { ...background, videoPaused: background.videoPaused || playbackState === 'scrubbing', videoAudioEnabled: background.videoAudioEnabled && backgroundAudioClips.length > 0, videoVolume: background.videoVolume * (backgroundAudioClips.length ? Math.max(...backgroundAudioClips.map((item) => clipOpacity(item, time))) : 0) } : background
  const labelPosition = (variantId: GarmentVariantId | undefined, collectionItemId: string | undefined, designCombinationId: string | undefined, x: number, y: number) => {
    if (!gridActive) return { x, y }
    const sceneItems = collectionItemId ? (directorClip?.itemIds ?? []).map((id) => collectionItems.find((item) => item.id === id)).filter((item): item is CollectionItem => Boolean(item)) : []
    const sceneCombinationIds = designCombinationId ? directorClip?.itemIds ?? [] : []
    const index = collectionItemId ? sceneItems.findIndex((item) => item.id === collectionItemId) : designCombinationId ? sceneCombinationIds.indexOf(designCombinationId) : Math.max(0, advancedGridViews?.findIndex((view) => view.id === variantId) ?? 0)
    const count = collectionItemId ? sceneItems.length : designCombinationId ? sceneCombinationIds.length : advancedGridViews?.length ?? 1; const cell = getGridLayout(Math.max(1, count))[Math.max(0, index)]
    return { x: (cell.x + x / 100 * cell.width) * 100, y: (1 - cell.y - cell.height + y / 100 * cell.height) * 100 }
  }
  return <section className="preview-shell">
    <div ref={frameRef} className="preview-frame" style={{ aspectRatio: String(ratio), '--stage-ratio': ratio } as CSSProperties}>
      <div className="stage-layer background-stage-layer" style={{ zIndex: 0, opacity: backgroundFrame.opacity, visibility: backgroundFrame.visible ? 'visible' : 'hidden', transform: `translate(${backgroundFrame.translateX}%, ${backgroundFrame.translateY}%) scale(${backgroundFrame.scale})` }} onPointerDown={() => onSelectLayer('background')}><BackgroundLayer background={stageBackground} mediaRef={mediaRef} /><div className="background-shade" style={{ opacity: background.darkness / 100 }} /></div>
      <div className="stage-layer viewer-layer" style={{ ...(advancedProject ? { zIndex: zById.get('garment') ?? 2, opacity: directorFrame.opacity, visibility: directorFrame.visible ? 'visible' : 'hidden' as const, transform: `translate(${directorFrame.translateX}%, ${directorFrame.translateY}%) scale(${directorFrame.scale})` } : frameStyle(systemLayerTimings.garment, time, zById.get('garment') ?? 2, professionalFrame?.garmentOpacity ?? 1)) }} onPointerDown={() => onSelectLayer('garment')}>
        {gridActive && advancedGridViews ? <AdvancedGridViewer views={advancedGridViews} garmentColor={viewer.garmentColor} time={time - (directorClip?.start ?? 0)} duration={directorClip?.duration ?? advancedProject?.duration ?? duration} background={background} backgroundMediaRef={mediaRef} renderResolution={viewer.renderResolution} onCanvasReady={onCanvasReady} /> : <GarmentViewer {...viewer} background={background} backgroundMediaRef={mediaRef} onCanvasReady={onCanvasReady} />}
        {gridActive && <div className="grid-cell-guides">{getGridLayout(advancedGridViews?.length ?? 4).map((cell, index) => <i key={index} style={{ left: `${cell.x * 100}%`, top: `${(1 - cell.y - cell.height) * 100}%`, width: `${cell.width * 100}%`, height: `${cell.height * 100}%` }} />)}</div>}
      </div>
      {overlayLayers.map((layer) => {
        const frame = assetFrame(layer.id) ?? evaluateLayerFrame(layer.timing, time); const selected = selectedLayerId === layer.id && recordingStatus !== 'recording'
        const style: CSSProperties = { left: `${layer.x + frame.translateX}%`, top: `${layer.y + frame.translateY}%`, width: `${layer.width}%`, zIndex: zById.get(layer.id) ?? 3, opacity: frame.opacity * layer.opacity / 100, visibility: frame.visible ? 'visible' : 'hidden', transform: `translate(-50%, -50%) rotate(${layer.rotation}deg) scale(${frame.scale})` }
        return <div key={layer.id} className={selected ? 'stage-overlay selected' : 'stage-overlay'} style={style} onPointerDown={(event) => beginDrag(event, layer)}>
          {layer.type === 'image' ? layer.url && <img src={layer.url} alt={layer.name} draggable={false} /> : <div className="stage-text" style={{ color: layer.color, fontSize: `${layer.fontSize}cqw`, fontWeight: layer.fontWeight }}>{layer.text}</div>}
          {selected && <button className="overlay-resize-handle" title="Cambiar tamaño" onPointerDown={(event) => beginResize(event, layer)} />}
        </div>
      })}
      {labelClips.map((item) => {
        const collectionItem = item.collectionItemId ? collectionItems.find((candidate) => candidate.id === item.collectionItemId) : null
        const combination = item.designCombinationId ? designCombinations.find((candidate) => candidate.id === item.designCombinationId) : null
        if (!item.variantId && !collectionItem && !combination) return null
        const settings: VariantLabelSettings | undefined = collectionItem?.label ?? combination?.label ?? (item.variantId ? advancedProject!.labels[item.variantId] : undefined)
        if (!settings?.enabled) return null
        const transition = evaluateLayerFrame({ start: item.start, duration: item.duration, enter: settings.enter, exit: settings.exit }, time); const position = labelPosition(item.variantId, item.collectionItemId, item.designCombinationId, settings.x + transition.translateX, settings.y + transition.translateY); const opacity = clipOpacity(item, time) * transition.opacity
        return <div key={item.id} className="advanced-variant-label" style={{ left: `${position.x}%`, top: `${position.y}%`, color: settings.color, background: settings.backgroundEnabled ? `color-mix(in srgb, ${settings.backgroundColor} ${settings.backgroundOpacity}%, transparent)` : 'transparent', border: settings.borderEnabled ? `${settings.borderWidth}px solid ${settings.borderColor}` : 'none', borderRadius: settings.borderRadius, boxShadow: settings.shadowEnabled ? '0 8px 24px #0009' : 'none', backdropFilter: settings.backgroundEnabled && settings.backdropBlurEnabled ? 'blur(8px)' : 'none', padding: settings.backgroundEnabled || settings.borderEnabled ? '.45em .75em' : 0, fontFamily: settings.fontFamily, fontSize: `${settings.fontSize}cqw`, opacity, transform: `translate(-50%,-50%) scale(${transition.scale})` }}>{settings.text}</div>
      })}
    </div>
  </section>
}
