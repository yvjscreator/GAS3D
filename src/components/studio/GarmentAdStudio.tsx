import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AdStage } from '../stage/AdStage'
import { GarmentPanel } from './GarmentPanel'
import { DesignPanel } from './DesignPanel'
import { BackgroundPanel } from './BackgroundPanel'
import { AnimationPanel } from './AnimationPanel'
import { FormatSelector } from './FormatSelector'
import { ExportPanel } from './ExportPanel'
import { CampaignPanel } from './CampaignPanel'
import { LayersDrawer } from './LayersDrawer'
import { BeatSyncPanel } from './BeatSyncPanel'
import { useStudioStore } from '../../store/studioStore'
import { useRecording } from '../../hooks/useRecording'
import { printPlacements, type BeatSyncSettings, type CollectionItem, type DirectorProject, type GarmentVariantId, type PrintPlacement, type PrintSettings, type PrintZoneAdjustment, type VariantAssetRole } from '../../types/studio'
import { createVariantPrints, garmentVariantPresets, getGarmentVariantPreset, hasVariantLibrary } from '../../config/garmentVariants'
import { backgroundMediaKey, collectionMediaKey, loadMedia, musicMediaKey, overlayMediaKey, printMediaKey, variantMediaKey } from '../../utils/mediaStorage'
import { exportQualities, getExportResolution } from '../../config/exportPresets'
import { getProfessionalDuration, getProfessionalRecordingFrame } from '../../config/professionalRecording'
import { getMusicGain } from '../../utils/audioTimeline'
import { AdvancedDirectorPanel } from './AdvancedDirectorPanel'
import { AdvancedTimeline } from './AdvancedTimeline'
import { activeAssetClips, activeClip, clipOpacity, getAdvancedDirectorFrame, getCollectionDirectorFrame, isCompleteCollectionItem, isValidCollectionSize } from '../../config/advancedDirectors'
import type { VariantCameraPreset } from '../../types/studio'
import { ChevronDown, Circle, Menu, PanelLeftClose, Pause, Play, Settings2, Sparkles } from '../icons'
import { beatDuration, hasBeatMap } from '../../utils/beatSync'

const placementRotation: Record<PrintPlacement, number> = { frontCenter: 0, frontChest: 0, backCenter: Math.PI, leftSleeve: Math.PI / 2, rightSleeve: -Math.PI / 2 }
const collectionPrints = (item: CollectionItem | null, template: Record<PrintPlacement, PrintSettings>) => {
  const result = Object.values(template).map((print) => ({ ...print, url: null, name: null }))
  if (!item) return result
  const main = result.find((print) => print.placement === item.placement); const companion = result.find((print) => print.placement === item.companionPlacement)
  if (main) Object.assign(main, item.print, { url: item.asset.url, name: item.asset.name, placement: item.placement })
  if (companion) Object.assign(companion, item.companionPrint, { url: item.companionAsset.url, name: item.companionAsset.name, placement: item.companionPlacement })
  return result
}
const collectionZones = (item: CollectionItem | null, template: Record<PrintPlacement, PrintZoneAdjustment>) => item ? { ...template, [item.placement]: item.zoneAdjustment, [item.companionPlacement]: item.companionZoneAdjustment } : template
const directorFrameAt = (project: DirectorProject, time: number, items: CollectionItem[], beatSync: BeatSyncSettings) => project.id === 'collection' ? getCollectionDirectorFrame(project, time, items, beatSync) : getAdvancedDirectorFrame(project, time, beatSync)

type ControlPanelId = 'garment' | 'variants' | 'designs' | 'background' | 'format' | 'beat' | 'animation' | 'director' | 'export'

function AccordionSection({ id, title, children, active, onChange }: { id: ControlPanelId; title: string; children: ReactNode; active: boolean; onChange: (id: ControlPanelId | null) => void }) {
  return <details className="control-accordion" open={active}><summary onClick={(event) => { event.preventDefault(); onChange(active ? null : id) }}><span>{title}</span><b><ChevronDown size={13} /></b></summary><div className="accordion-body">{children}</div></details>
}

export function GarmentAdStudio() {
  const studio = useStudioStore(); const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [activePanel, setActivePanel] = useState<ControlPanelId | null>(studio.studioMode === 'advanced' ? 'director' : 'variants')
  const [guidesHidden, setGuidesHidden] = useState(false)
  const [professionalPreviewing, setProfessionalPreviewing] = useState(false)
  const [professionalPreviewElapsed, setProfessionalPreviewElapsed] = useState(0)
  const [advancedPlaying, setAdvancedPlaying] = useState(false)
  const [framingMode, setFramingMode] = useState(false)
  const [heroVariantId, setHeroVariantId] = useState<GarmentVariantId>('frontLeftSleeve'); const previewFrame = useRef(0)
  const lastControlPress = useRef(0)
  const media = useRef<HTMLImageElement | HTMLVideoElement | null>(null); const musicMedia = useRef<HTMLAudioElement | null>(null); const { start } = useRecording()
  const advancedProject = studio.advancedProjects[studio.activeDirectorId]
  const activeCollectionItem = studio.collectionItems.find((item) => item.id === studio.activeCollectionItemId) ?? studio.collectionItems[0] ?? null
  const completeCollectionItems = studio.collectionItems.filter(isCompleteCollectionItem)
  const selectedCamera = studio.campaignMode === 'collection' ? activeCollectionItem?.camera ?? advancedProject.cameras.frontLeftSleeve : advancedProject.cameras[studio.activeVariantId]
  const [cameraDraft, setCameraDraft] = useState<VariantCameraPreset>(selectedCamera)
  useEffect(() => { if (!framingMode) { const state = useStudioStore.getState(); const project = state.advancedProjects[state.activeDirectorId]; const item = state.collectionItems.find((candidate) => candidate.id === state.activeCollectionItemId); setCameraDraft(state.campaignMode === 'collection' ? item?.camera ?? project.cameras.frontLeftSleeve : project.cameras[state.activeVariantId]) } }, [framingMode, studio.activeDirectorId, studio.activeVariantId, studio.activeCollectionItemId, studio.campaignMode, studio.advancedProjects])
  useEffect(() => { useStudioStore.getState().syncAdvancedAssets() }, [studio.background.videoAudioEnabled, studio.music.name, studio.overlayLayers.length])
  useEffect(() => {
    let active = true
    const restoredUrls: string[] = []
    const restore = async () => {
      for (const role of ['large', 'small'] as VariantAssetRole[]) {
        const current = useStudioStore.getState().variantAssets[role]
        if (!current.name) continue
        const blob = await loadMedia(variantMediaKey(role)).catch(() => null)
        if (!active || !blob) continue
        const url = URL.createObjectURL(blob); restoredUrls.push(url)
        useStudioStore.getState().setVariantAsset(role, { ...current, url })
      }
      for (const item of useStudioStore.getState().collectionItems) {
        if (item.asset.name) {
          const blob = await loadMedia(collectionMediaKey(item.id, 'main')).catch(() => null)
          if (active && blob) { const url = URL.createObjectURL(blob); restoredUrls.push(url); useStudioStore.getState().updateCollectionItem(item.id, { asset: { ...item.asset, url }, print: { ...item.print, url, name: item.asset.name } }) }
        }
        if (item.companionAsset.name) {
          const blob = await loadMedia(collectionMediaKey(item.id, 'companion')).catch(() => null)
          if (active && blob) { const url = URL.createObjectURL(blob); restoredUrls.push(url); useStudioStore.getState().updateCollectionItem(item.id, { companionAsset: { ...item.companionAsset, url }, companionPrint: { ...item.companionPrint, url, name: item.companionAsset.name } }) }
        }
      }
      for (const placement of printPlacements) {
        const current = useStudioStore.getState().prints[placement]
        if (!current.name) continue
        const blob = await loadMedia(printMediaKey(placement)).catch(() => null)
        if (!active || !blob) continue
        const url = URL.createObjectURL(blob); restoredUrls.push(url)
        useStudioStore.getState().setPrint(placement, { url })
      }
      const state = useStudioStore.getState()
      if (state.background.type !== 'color' && state.background.name) {
        const blob = await loadMedia(backgroundMediaKey).catch(() => null)
        if (active && blob) { const url = URL.createObjectURL(blob); restoredUrls.push(url); useStudioStore.getState().setBackground({ url }) }
      }
      if (state.music.name) {
        const blob = await loadMedia(musicMediaKey).catch(() => null)
        if (active && blob) { const url = URL.createObjectURL(blob); restoredUrls.push(url); useStudioStore.getState().setMusic({ url }) }
      }
      for (const layer of state.overlayLayers) {
        if (layer.type !== 'image' || !layer.sourceName) continue
        const blob = await loadMedia(overlayMediaKey(layer.id)).catch(() => null)
        if (!active || !blob) continue
        const url = URL.createObjectURL(blob); restoredUrls.push(url)
        useStudioStore.getState().updateOverlayLayer(layer.id, { url })
      }
    }
    void restore()
    return () => { active = false; restoredUrls.forEach((url) => URL.revokeObjectURL(url)) }
  }, [])
  useEffect(() => () => { cancelAnimationFrame(previewFrame.current); musicMedia.current?.pause() }, [])
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Control' || event.repeat) return
      const now = performance.now()
      if (now - lastControlPress.current <= 420) {
        setGuidesHidden((hidden) => !hidden)
        lastControlPress.current = 0
      } else lastControlPress.current = now
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
  const restartBackgroundVideo = (seconds = 0) => { if (studio.background.type === 'video' && media.current instanceof HTMLVideoElement) { studio.setBackground({ videoPaused: false }); media.current.currentTime = media.current.duration ? seconds % media.current.duration : seconds; void media.current.play() } }
  const syncPreviewMusic = (seconds: number) => {
    const element = musicMedia.current; const music = useStudioStore.getState().music
    if (!element || !music.url) return
    const state = useStudioStore.getState(); const project = state.advancedProjects[state.activeDirectorId]; const directed = state.studioMode === 'advanced' || state.campaignMode === 'collection'; const advancedClip = directed ? activeAssetClips(project, 'music', seconds)[0] : null
    const gain = directed ? (advancedClip ? clipOpacity(advancedClip, seconds) * music.volume / 100 : 0) : getMusicGain(music, seconds); const sourceTime = advancedClip ? advancedClip.sourceStart + seconds - advancedClip.start : Math.max(0, seconds - music.start)
    if (gain > 0) {
      if (Math.abs(element.currentTime - sourceTime) > .28) element.currentTime = Math.min(sourceTime, Math.max(0, music.sourceDuration - .02))
      element.volume = Math.min(1, gain); if (element.paused) void element.play().catch(() => undefined)
    } else if (!element.paused) element.pause()
  }
  const play = () => {
    cancelAnimationFrame(previewFrame.current)
    if (studio.studioMode === 'advanced' || studio.campaignMode === 'collection') {
      const project = useStudioStore.getState().advancedProjects[studio.activeDirectorId]
      const startAt = project.playhead >= project.duration - .05 ? 0 : project.playhead
      restartBackgroundVideo(startAt)
      studio.setAdvancedPlayhead(startAt); setAdvancedPlaying(true); setProfessionalPreviewing(true); studio.play()
      const started = performance.now() - startAt * 1000
      const tick = () => {
        const elapsed = Math.min(project.duration, (performance.now() - started) / 1000); useStudioStore.getState().setAdvancedPlayhead(elapsed); syncPreviewMusic(elapsed)
        const state = useStudioStore.getState(); const directed = directorFrameAt(state.advancedProjects[state.activeDirectorId], elapsed, state.collectionItems, state.beatSync)
        if (directed?.collectionItemId) state.setActiveCollectionItemId(directed.collectionItemId)
        else if (directed && state.activeVariantId !== directed.variantId) state.setActiveVariantId(directed.variantId)
        if (elapsed < project.duration) previewFrame.current = requestAnimationFrame(tick)
        else { musicMedia.current?.pause(); setAdvancedPlaying(false); setProfessionalPreviewing(false) }
      }
      previewFrame.current = requestAnimationFrame(tick); return
    }
    restartBackgroundVideo()
    const professional = Boolean(studio.variantAssets.large.url && studio.variantAssets.small.url)
    const totalDuration = professional ? getProfessionalDuration(studio.duration, studio.beatSync) : studio.duration
    const selectedHero = professionalPreviewing ? heroVariantId : studio.activeVariantId; setHeroVariantId(selectedHero); const started = performance.now(); setProfessionalPreviewElapsed(0); setProfessionalPreviewing(true); studio.play()
    const tick = () => {
      const elapsed = Math.min(totalDuration, (performance.now() - started) / 1000); syncPreviewMusic(elapsed)
      if (professional) { const state = useStudioStore.getState(); const directed = getProfessionalRecordingFrame(elapsed, totalDuration, selectedHero, state.cameraView, state.beatSync); setProfessionalPreviewElapsed(elapsed); if (state.activeVariantId !== directed.variantId) state.setActiveVariantId(directed.variantId) }
      if (elapsed < totalDuration) previewFrame.current = requestAnimationFrame(tick)
      else { musicMedia.current?.pause(); setProfessionalPreviewing(false); if (professional) useStudioStore.getState().setActiveVariantId(selectedHero) }
    }
    setProfessionalPreviewing(professional)
    previewFrame.current = requestAnimationFrame(tick)
  }
  const pauseAdvanced = () => { cancelAnimationFrame(previewFrame.current); musicMedia.current?.pause(); if (media.current instanceof HTMLVideoElement) media.current.pause(); setAdvancedPlaying(false); setProfessionalPreviewing(false) }
  const seekAdvanced = (time: number) => {
    pauseAdvanced(); studio.setAdvancedPlayhead(time); if (media.current instanceof HTMLVideoElement) media.current.currentTime = media.current.duration ? time % media.current.duration : time
    const state = useStudioStore.getState(); const directed = directorFrameAt(state.advancedProjects[state.activeDirectorId], time, state.collectionItems, state.beatSync)
    if (directed?.collectionItemId) studio.setActiveCollectionItemId(directed.collectionItemId); else if (directed) studio.setActiveVariantId(directed.variantId)
  }
  const record = () => {
    const validCollectionItems = studio.collectionItems.filter(isCompleteCollectionItem)
    if (studio.campaignMode === 'collection' && !isValidCollectionSize(validCollectionItems.length)) {
      studio.setRecording('error', 0, 'Completa 2, 3 o 4 pares de artes; para colecciones mayores usa 8, 12, 16…')
      return
    }
    const output = getExportResolution(studio.format, studio.exportQuality)
    const bitrate = exportQualities[studio.exportQuality].bitrate
    const isAdvanced = studio.studioMode === 'advanced'; const isCollection = studio.campaignMode === 'collection'; const usesDirector = isAdvanced || isCollection; const project = studio.advancedProjects[studio.activeDirectorId]
    const sequenceReady = Boolean(studio.variantAssets.large.url && studio.variantAssets.small.url)
    const originalVariant = professionalPreviewing ? heroVariantId : studio.activeVariantId
    const originalCollectionItemId = studio.activeCollectionItemId
    const totalDuration = usesDirector ? project.duration : sequenceReady ? getProfessionalDuration(studio.duration, studio.beatSync) : studio.duration
    cancelAnimationFrame(previewFrame.current); musicMedia.current?.pause(); setProfessionalPreviewing(false); setAdvancedPlaying(false); setHeroVariantId(originalVariant)
    if (sequenceReady || isAdvanced) studio.setActiveVariantId(garmentVariantPresets[0].id)
    if (isCollection && validCollectionItems[0]) studio.setActiveCollectionItemId(validCollectionItems[0].id)
    studio.setRecording('recording', 0, 'Preparando render de alta resolución…')
    const begin = () => { restartBackgroundVideo(); studio.play(); const current = useStudioStore.getState(); start({ renderCanvas: canvas, media: media.current, background: current.background, music: current.music, beatSync: current.beatSync, overlayLayers: current.overlayLayers, layerOrder: current.layerOrder, systemLayerTimings: current.systemLayerTimings, professionalHeroVariantId: !usesDirector && sequenceReady ? originalVariant : null, advancedProject: usesDirector ? current.advancedProjects[current.activeDirectorId] : null, collectionItems: current.collectionItems.filter(isCompleteCollectionItem), duration: totalDuration, width: output.width, height: output.height, bitrate,
      onProgress: (seconds) => {
        if (usesDirector) {
          const state = useStudioStore.getState(); state.setAdvancedPlayhead(seconds)
          const directed = directorFrameAt(state.advancedProjects[state.activeDirectorId], seconds, state.collectionItems, state.beatSync)
          if (directed?.collectionItemId) state.setActiveCollectionItemId(directed.collectionItemId)
          else if (directed && state.activeVariantId !== directed.variantId) state.setActiveVariantId(directed.variantId)
        } else if (sequenceReady) {
          const state = useStudioStore.getState(); const directed = getProfessionalRecordingFrame(seconds, totalDuration, originalVariant, state.cameraView, state.beatSync)
          if (useStudioStore.getState().activeVariantId !== directed.variantId) useStudioStore.getState().setActiveVariantId(directed.variantId)
        }
        studio.setRecording('recording', seconds)
      },
      onFinish: (message) => { if (sequenceReady || isAdvanced) useStudioStore.getState().setActiveVariantId(originalVariant); if (isCollection) useStudioStore.getState().setActiveCollectionItemId(originalCollectionItemId); studio.setRecording('ready', totalDuration, message) },
      onError: (message) => { if (sequenceReady || isAdvanced) useStudioStore.getState().setActiveVariantId(originalVariant); if (isCollection) useStudioStore.getState().setActiveCollectionItemId(originalCollectionItemId); studio.setRecording('error', 0, message) },
    }) }
    let attempts = 0
    const waitForResolution = () => {
      attempts += 1
      if (canvas && canvas.width >= output.width - 2 && canvas.height >= output.height - 2) { begin(); return }
      if (attempts > 120) { if (sequenceReady || isAdvanced) useStudioStore.getState().setActiveVariantId(originalVariant); if (isCollection) useStudioStore.getState().setActiveCollectionItemId(originalCollectionItemId); studio.setRecording('error', 0, 'La GPU no pudo preparar la resolución solicitada. Prueba calidad Alta.'); return }
      requestAnimationFrame(waitForResolution)
    }
    requestAnimationFrame(waitForResolution)
  }
  const variantLibraryEnabled = hasVariantLibrary(studio.variantAssets)
  const activeVariant = getGarmentVariantPreset(studio.activeVariantId)
  const collectionMode = studio.campaignMode === 'collection'
  const basicProfessionalDuration = variantLibraryEnabled ? getProfessionalDuration(studio.duration, studio.beatSync) : studio.duration
  const directedMode = studio.studioMode === 'advanced' || collectionMode
  const collectionReady = !collectionMode || isValidCollectionSize(completeCollectionItems.length)
  const collectionDirecting = collectionMode && (studio.studioMode === 'advanced' || advancedPlaying || studio.recordingStatus === 'recording')
  const stageUsesProject = !framingMode && (studio.studioMode === 'advanced' || collectionDirecting)
  const advancedTime = studio.recordingStatus === 'recording' && directedMode ? studio.recordingElapsed : advancedProject.playhead
  const professionalFrame = stageUsesProject
    ? directorFrameAt(advancedProject, advancedTime, studio.collectionItems, studio.beatSync)
    : variantLibraryEnabled && studio.recordingStatus === 'recording'
    ? getProfessionalRecordingFrame(studio.recordingElapsed, basicProfessionalDuration, heroVariantId, studio.cameraView, studio.beatSync)
    : variantLibraryEnabled && professionalPreviewing ? getProfessionalRecordingFrame(professionalPreviewElapsed, basicProfessionalDuration, heroVariantId, studio.cameraView, studio.beatSync) : null
  const variantTemplate = studio.variantPrintSettings.frontLeftSleeve
  const zoneTemplate = studio.variantZoneAdjustments.frontLeftSleeve
  const editingCompanion = collectionMode && studio.activeCollectionAssetRole === 'companion'
  const activeCollectionPlacement = activeCollectionItem ? editingCompanion ? activeCollectionItem.companionPlacement : activeCollectionItem.placement : studio.activePrintPlacement
  const activePrintSettings = collectionMode ? variantTemplate : variantLibraryEnabled ? studio.variantPrintSettings[studio.activeVariantId] : studio.prints
  const activeZoneAdjustments = collectionMode ? collectionZones(activeCollectionItem, zoneTemplate) : variantLibraryEnabled ? studio.variantZoneAdjustments[studio.activeVariantId] : studio.printZoneAdjustments
  const printApplications = collectionMode ? collectionPrints(activeCollectionItem, variantTemplate) : variantLibraryEnabled ? createVariantPrints(activePrintSettings, studio.variantAssets, studio.activeVariantId) : Object.values(activePrintSettings)
  const updatePrint = (placement: Parameters<typeof studio.setPrint>[0], value: Parameters<typeof studio.setPrint>[1]) => {
    if (collectionMode && activeCollectionItem && placement === activeCollectionPlacement) studio.updateCollectionItem(activeCollectionItem.id, editingCompanion ? { companionPrint: { ...activeCollectionItem.companionPrint, ...value } } : { print: { ...activeCollectionItem.print, ...value } })
    else if (variantLibraryEnabled) studio.setVariantPrint(studio.activeVariantId, placement, value)
    else studio.setPrint(placement, value)
  }
  const updateZone = (placement: Parameters<typeof studio.setPrintZoneAdjustment>[0], value: Parameters<typeof studio.setPrintZoneAdjustment>[1]) => {
    if (collectionMode && activeCollectionItem && placement === activeCollectionPlacement) studio.updateCollectionItem(activeCollectionItem.id, editingCompanion ? { companionZoneAdjustment: { ...activeCollectionItem.companionZoneAdjustment, ...value } } : { zoneAdjustment: { ...activeCollectionItem.zoneAdjustment, ...value } })
    else if (variantLibraryEnabled) studio.setVariantZoneAdjustment(studio.activeVariantId, placement, value)
    else studio.setPrintZoneAdjustment(placement, value)
  }
  const directorClip = stageUsesProject ? activeClip(advancedProject, 'director', advancedTime) : null
  const batchIndex = directorClip?.batchIndex ?? 0
  const gridViews = collectionMode
    ? completeCollectionItems.slice(batchIndex * 4, batchIndex * 4 + 4).map((item, index) => ({ id: item.id, prints: collectionPrints(item, variantTemplate), zones: collectionZones(item, zoneTemplate), camera: item.camera, garmentColor: item.garmentColor, baseRotation: placementRotation[item.placement], primaryPlacement: item.placement, companionPlacement: item.companionPlacement, motion: studio.collectionMotionIds.length ? studio.collectionMotionIds[(batchIndex * 4 + index) % studio.collectionMotionIds.length] : 'turntableRight' as const, beatDelay: hasBeatMap(studio.beatSync) && studio.beatSync.stagger ? index * beatDuration(studio.beatSync) : 0, beatStyle: hasBeatMap(studio.beatSync) ? studio.beatSync.style : undefined }))
    : garmentVariantPresets.map((variant, index) => ({ id: variant.id, prints: createVariantPrints(studio.variantPrintSettings[variant.id], studio.variantAssets, variant.id), zones: studio.variantZoneAdjustments[variant.id], camera: advancedProject.cameras[variant.id], baseRotation: placementRotation[variant.largePlacement], beatDelay: hasBeatMap(studio.beatSync) && studio.beatSync.stagger ? index * beatDuration(studio.beatSync) : 0, beatStyle: hasBeatMap(studio.beatSync) ? studio.beatSync.style : undefined }))
  const viewerCamera = studio.studioMode === 'advanced' ? cameraDraft : studio.cameraView
  const viewer = { garmentColor: collectionMode && activeCollectionItem ? activeCollectionItem.garmentColor : studio.garmentColor, printApplications, printZoneAdjustments: activeZoneAdjustments, activePrintPlacement: collectionMode && activeCollectionItem ? activeCollectionPlacement : studio.activePrintPlacement, editorMode: studio.editorMode, alignmentRequest: studio.alignmentRequest, onPrintMove: (placement: Parameters<typeof studio.setPrint>[0], x: number, y: number) => updatePrint(placement, { x, y }), onPrintScale: (placement: Parameters<typeof studio.setPrint>[0], scale: number) => updatePrint(placement, { scale }), onPrintZoneChange: updateZone, showPrintGuides: studio.recordingStatus !== 'recording' && !professionalPreviewing && !guidesHidden && studio.studioMode === 'basic', animation: studio.animation, duration: directedMode ? advancedProject.duration : basicProfessionalDuration, playbackKey: studio.playbackKey, targetRotation: studio.targetRotation, cameraView: viewerCamera, cameraFov: studio.studioMode === 'advanced' ? cameraDraft.fov : 35, cameraComposition: studio.studioMode === 'advanced' && framingMode ? cameraDraft.composition : [0, 0] as [number, number], onCameraViewChange: studio.studioMode === 'advanced' ? (view: typeof studio.cameraView) => framingMode && setCameraDraft((current) => ({ ...current, ...view })) : studio.setCameraView, professionalFrame, renderResolution: studio.recordingStatus === 'recording' ? getExportResolution(studio.format, studio.exportQuality) : null }
  const changeMode = (mode: 'basic' | 'advanced') => { cancelAnimationFrame(previewFrame.current); pauseAdvanced(); setFramingMode(false); studio.setStudioMode(mode); setActivePanel(mode === 'advanced' ? 'director' : 'variants') }
  return <main className={studio.studioMode === 'advanced' ? 'studio zen-studio advanced-mode' : 'studio zen-studio'}>
    <button className="controls-toggle" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label={sidebarOpen ? 'Ocultar controles' : 'Mostrar controles'}>{sidebarOpen ? <PanelLeftClose size={15} /> : <Menu size={15} />}<span>{sidebarOpen ? 'Ocultar' : 'Controles'}</span></button>
    <div className="studio-mode-switch" role="group" aria-label="Modo del estudio"><button className={studio.studioMode === 'basic' ? 'active' : ''} onClick={() => changeMode('basic')}><Settings2 size={13} /> Básico</button><button className={studio.studioMode === 'advanced' ? 'active' : ''} onClick={() => changeMode('advanced')}><Sparkles size={13} /> Avanzado</button></div>
    <div className={sidebarOpen ? 'zen-layout' : 'zen-layout sidebar-closed'}>
      <aside className="control-drawer">
        <div className="drawer-spacer" />
        <div className="drawer-intro"><span>{studio.studioMode === 'advanced' ? 'Editor avanzado' : 'Flujo de trabajo'}</span><strong>{collectionMode ? `${completeCollectionItems.length} pares · ${Math.ceil(completeCollectionItems.length / 4)} grupos` : studio.studioMode === 'advanced' ? advancedProject.name : variantLibraryEnabled ? activeVariant.label : 'Configura tu producto'}</strong></div>
        <div className="drawer-group"><p>01 · Producto</p><AccordionSection id="garment" title="Prenda" active={activePanel === 'garment'} onChange={setActivePanel}><GarmentPanel /></AccordionSection></div>
        <div className="drawer-group"><p>02 · Artes</p><AccordionSection id="variants" title="Tipo de campaña y diseños" active={activePanel === 'variants'} onChange={setActivePanel}><CampaignPanel /></AccordionSection>{!collectionMode && <AccordionSection id="designs" title="Ajustar estampados y zonas" active={activePanel === 'designs'} onChange={setActivePanel}><DesignPanel /></AccordionSection>}</div>
        <div className="drawer-group"><p>03 · Escena</p><AccordionSection id="background" title="Fondo e iluminación" active={activePanel === 'background'} onChange={setActivePanel}><BackgroundPanel /></AccordionSection><AccordionSection id="format" title="Formato del lienzo" active={activePanel === 'format'} onChange={setActivePanel}><FormatSelector /></AccordionSection></div>
        <div className="drawer-group"><p>04 · Ritmo</p><AccordionSection id="beat" title="Sincronización musical" active={activePanel === 'beat'} onChange={setActivePanel}><BeatSyncPanel /></AccordionSection></div>
        {studio.studioMode === 'advanced' ? <div className="drawer-group"><p>05 · Dirección</p><AccordionSection id="director" title="Director y cámaras" active={activePanel === 'director'} onChange={setActivePanel}><AdvancedDirectorPanel framing={framingMode} draft={cameraDraft} onBeginFraming={() => { pauseAdvanced(); setCameraDraft(collectionMode ? activeCollectionItem?.camera ?? cameraDraft : advancedProject.cameras[studio.activeVariantId]); setFramingMode(true) }} onCancelFraming={() => { setCameraDraft(collectionMode ? activeCollectionItem?.camera ?? cameraDraft : advancedProject.cameras[studio.activeVariantId]); setFramingMode(false) }} onSaveFraming={() => { if (collectionMode && activeCollectionItem) studio.updateCollectionItem(activeCollectionItem.id, { camera: { ...cameraDraft, saved: true } }); else studio.updateAdvancedCamera(studio.activeVariantId, { ...cameraDraft, saved: true }); setFramingMode(false) }} onDraftFov={(fov) => setCameraDraft((current) => ({ ...current, fov }))} onDraftComposition={(composition) => setCameraDraft((current) => ({ ...current, composition }))} /></AccordionSection></div> : <div className="drawer-group"><p>05 · Movimiento</p><AccordionSection id="animation" title="Movimiento" active={activePanel === 'animation'} onChange={setActivePanel}><AnimationPanel /></AccordionSection></div>}
        <div className="drawer-group"><p>06 · Salida</p><AccordionSection id="export" title="Exportar video" active={activePanel === 'export'} onChange={setActivePanel}><ExportPanel onRecord={record} /></AccordionSection></div>
      </aside>
      <section className={studio.studioMode === 'advanced' ? 'zen-workspace has-timeline' : 'zen-workspace'}>
        <audio ref={musicMedia} className="music-preview-media" src={studio.music.url ?? undefined} preload="auto" />
        <AdStage format={studio.format} background={studio.background} mediaRef={media} onCanvasReady={setCanvas} viewer={viewer} overlayLayers={studio.overlayLayers} layerOrder={studio.layerOrder} selectedLayerId={studio.selectedLayerId} systemLayerTimings={studio.systemLayerTimings} duration={directedMode ? advancedProject.duration : basicProfessionalDuration} playbackKey={studio.playbackKey} recordingStatus={studio.recordingStatus} recordingElapsed={studio.recordingElapsed} professionalFrame={professionalFrame} advancedProject={stageUsesProject ? advancedProject : null} advancedTime={advancedTime} advancedGridViews={stageUsesProject ? gridViews : null} advancedPlaying={advancedPlaying} collectionItems={completeCollectionItems} onSelectLayer={studio.selectLayer} onUpdateOverlay={studio.updateOverlayLayer} />
        <LayersDrawer />
        <div className="workspace-status">{directedMode ? `${advancedProject.name.toUpperCase()} · ${framingMode ? 'MODO ENCUADRE' : `${advancedProject.playhead.toFixed(1)}S`}` : guidesHidden ? 'VISTA LIMPIA · CTRL ×2 PARA VOLVER' : `${studio.editorMode === 'zone' ? 'CONFIGURANDO ZONA' : 'EDITANDO DISEÑO'} · ${variantLibraryEnabled ? activeVariant.label : studio.activePrintPlacement}`}</div>
        <div className="action-dock"><button className="preview-button" disabled={studio.recordingStatus === 'recording' || !collectionReady} onClick={directedMode && advancedPlaying ? pauseAdvanced : play}>{directedMode && advancedPlaying ? <><Pause size={13} /> Pausar</> : <><Play size={13} /> Previsualizar</>}</button><button className="record-button footer-record" disabled={studio.recordingStatus === 'recording' || !collectionReady} onClick={record}><Circle size={10} fill="currentColor" /> Grabar</button></div>
        <p className="preview-hint">{guidesHidden ? 'Vista limpia activa · botón central mueve el encuadre · Ctrl ×2 muestra las guías' : studio.editorMode === 'zone' ? 'Arrastra la zona · Shift bloquea un eje · botón central mueve el encuadre · Ctrl ×2 oculta guías' : 'Arrastra el diseño · Shift bloquea un eje · botón central mueve el encuadre · Ctrl ×2 oculta guías'}</p>
        {(studio.recordingStatus === 'recording' || professionalPreviewing) && professionalFrame && <div className={studio.recordingStatus === 'recording' ? 'recording-overlay' : 'recording-overlay preview-director'}><i /> {studio.recordingStatus === 'recording' ? 'GRABANDO' : 'DIRECTOR'} <span>{professionalFrame.shotLabel}</span><strong>{(directedMode ? advancedTime : studio.recordingStatus === 'recording' ? studio.recordingElapsed : professionalPreviewElapsed).toFixed(1)} / {directedMode ? advancedProject.duration : basicProfessionalDuration}s</strong></div>}
        {studio.studioMode === 'advanced' && <AdvancedTimeline playing={advancedPlaying} onTogglePlay={advancedPlaying ? pauseAdvanced : play} onSeek={seekAdvanced} />}
      </section>
    </div>
  </main>
}
