import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { AdStage } from '../stage/AdStage'
import { DesignPanel } from './DesignPanel'
import { BackgroundPanel } from './BackgroundPanel'
import { CampaignPanel } from './CampaignPanel'
import { LayersDrawer } from './LayersDrawer'
import { AudioPanel } from './AudioPanel'
import { useStudioStore } from '../../store/studioStore'
import { useRecording } from '../../hooks/useRecording'
import { printPlacements, type BeatSyncSettings, type CollectionItem, type DirectorProject, type GarmentVariantId, type PrintPlacement, type PrintSettings, type PrintZoneAdjustment, type RecordingStatus, type VariantAssetRole } from '../../types/studio'
import { createCombinationPrints, getGarmentVariantPreset, hasVariantLibrary } from '../../config/garmentVariants'
import { backgroundMediaKey, collectionMediaKey, loadMedia, loadPreparedMedia, musicMediaKey, overlayMediaKey, printMediaKey, variantMediaKey } from '../../utils/mediaStorage'
import type { PreparedVideoAssetMetadata } from '../../utils/mediaProcessor'
import { exportPresets, exportQualities, getExportResolution } from '../../config/exportPresets'
import { getProfessionalDuration, getProfessionalRecordingFrame } from '../../config/professionalRecording'
import { getMusicGain } from '../../utils/audioTimeline'
import { AdvancedDirectorPanel } from './AdvancedDirectorPanel'
import { AdvancedTimeline } from './AdvancedTimeline'
import { EditorHeader } from './EditorHeader'
import { EditorStatusBar } from './EditorStatusBar'
import { activeAssetClips, activeClip, clipOpacity, createDefaultCamera, getAdvancedDirectorFrame, getCollectionDirectorFrame, isCompleteCollectionItem, isValidCollectionSize } from '../../config/advancedDirectors'
import type { VariantCameraPreset } from '../../types/studio'
import { AlertTriangle, AudioLines, Clapperboard, Image, Images, RefreshCw, X } from '../icons'
import { beatDuration, hasBeatMap } from '../../utils/beatSync'
import { buildPresentationGroups } from '../../utils/presentationPlanner'
import { SettingsPanel } from './SettingsPanel'
import { buildRecordingResourceManifest, runRecordingPreflight } from '../../utils/recordingPreflight'
import { garmentModels } from '../../config/garmentModels'
import { renderAssetManager } from '../../render/RenderAssetManager'
import type { StagePlaybackState } from '../../utils/stageTimeline'
import { WorkspaceTabs } from '../ui'

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
const directorFrameAt = (project: DirectorProject, time: number, items: CollectionItem[], beatSync: BeatSyncSettings, combinations = useStudioStore.getState().designCombinations) => project.id === 'collection' ? getCollectionDirectorFrame(project, time, items, beatSync) : getAdvancedDirectorFrame(project, time, beatSync, combinations)
const timelineHeightKey = 'garment-ad-studio:timeline-height'
const timelineCollapsedKey = 'garment-ad-studio:timeline-collapsed'
const clampTimelineHeight = (value: number) => Math.min(55, Math.max(22, value))
const savedTimelineHeight = () => {
  if (typeof window === 'undefined') return 35
  const value = Number(window.localStorage.getItem(timelineHeightKey))
  return Number.isFinite(value) && value > 0 ? clampTimelineHeight(value) : 35
}
const busyRecordingStatuses: RecordingStatus[] = ['preparing', 'preloading', 'warming', 'ready', 'recording', 'finalizing']

type WorkspaceId = 'designs' | 'scene' | 'direction' | 'audio'
const workspaceKey = 'garment-ad-studio:workspace'
const workspaceTabs = [{ id: 'designs', label: 'Diseños', icon: Images }, { id: 'scene', label: 'Escena', icon: Image }, { id: 'direction', label: 'Dirección', icon: Clapperboard }, { id: 'audio', label: 'Audio', icon: AudioLines }] satisfies { id: WorkspaceId; label: string; icon: typeof Images }[]

export function GarmentAdStudio() {
  const studio = useStudioStore(); const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const [timelineHeight, setTimelineHeight] = useState(savedTimelineHeight)
  const [timelineCollapsed, setTimelineCollapsed] = useState(() => typeof window !== 'undefined' && window.localStorage.getItem(timelineCollapsedKey) === 'true')
  const [workspace, setWorkspaceState] = useState<WorkspaceId>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(workspaceKey) : null
    return saved === 'scene' || saved === 'direction' || saved === 'audio' ? saved : 'designs'
  })
  const [guidesHidden, setGuidesHidden] = useState(false)
  const [professionalPreviewing, setProfessionalPreviewing] = useState(false)
  const [professionalPreviewElapsed, setProfessionalPreviewElapsed] = useState(0)
  const [advancedPlaying, setAdvancedPlaying] = useState(false)
  const [stagePlaybackState, setStagePlaybackState] = useState<StagePlaybackState>('editing')
  const [assetTask, setAssetTask] = useState<string | null>(null)
  const [framingMode, setFramingMode] = useState(false)
  const [heroVariantId, setHeroVariantId] = useState<GarmentVariantId>('frontLeftSleeve'); const previewFrame = useRef(0)
  const lastControlPress = useRef(0)
  const timelineSelectionUpdate = useRef(false)
  const previewSelection = useRef<{ variantId: GarmentVariantId; collectionItemId: string | null; designCombinationId: string | null } | null>(null)
  const media = useRef<HTMLImageElement | HTMLVideoElement | null>(null); const musicMedia = useRef<HTMLAudioElement | null>(null); const { start } = useRecording()
  const advancedProject = studio.advancedProjects[studio.activeDirectorId]
  useEffect(() => { if (useStudioStore.getState().studioMode !== 'advanced') useStudioStore.getState().setStudioMode('advanced') }, [])
  const activeCollectionItem = studio.collectionItems.find((item) => item.id === studio.activeCollectionItemId) ?? studio.collectionItems[0] ?? null
  const activeCombination = studio.designCombinations.find((item) => item.id === studio.activeDesignCombinationId) ?? studio.designCombinations[0]
  const enabledCombinations = studio.designCombinations.filter((item) => item.enabled).sort((a, b) => a.order - b.order)
  const completeCollectionItems = studio.collectionItems.filter(isCompleteCollectionItem)
  const orderedDirectorClips = [...(advancedProject.tracks.find((track) => track.type === 'director')?.clips ?? [])].sort((a, b) => a.start - b.start)
  const activeDirectorClipIndex = Math.max(0, orderedDirectorClips.findIndex((clip) => advancedProject.playhead >= clip.start && advancedProject.playhead <= clip.start + clip.duration))
  const preloadItemIds = orderedDirectorClips.slice(activeDirectorClipIndex, activeDirectorClipIndex + 2).flatMap((clip) => clip.itemIds ?? (clip.collectionItemId ? [clip.collectionItemId] : []))
  const adaptivePreloadUrls = studio.campaignMode === 'collection'
    ? [...new Set(preloadItemIds)].flatMap((id) => { const item = completeCollectionItems.find((candidate) => candidate.id === id); return item ? [item.asset.url, item.companionAsset.url] : [] })
    : [studio.variantAssets.large.url, studio.variantAssets.small.url]
  adaptivePreloadUrls.push(...studio.overlayLayers.filter((layer) => layer.type === 'image').map((layer) => layer.url))
  const adaptivePreloadKey = [...new Set(adaptivePreloadUrls.filter((url): url is string => Boolean(url)))].sort().join('\u0000')
  useEffect(() => {
    const urls = adaptivePreloadKey ? adaptivePreloadKey.split('\u0000') : []
    void renderAssetManager.prepareSceneWindow(urls).catch(() => undefined)
  }, [adaptivePreloadKey])
  const selectedCamera = studio.campaignMode === 'collection' ? activeCollectionItem?.camera ?? advancedProject.cameras.frontLeftSleeve : activeCombination?.camera ?? advancedProject.cameras[studio.activeVariantId]
  const [cameraDraft, setCameraDraft] = useState<VariantCameraPreset>(selectedCamera)
  useEffect(() => {
    if (advancedPlaying || studio.recordingStatus === 'recording') return
    if (timelineSelectionUpdate.current) { timelineSelectionUpdate.current = false; return }
    setStagePlaybackState('editing')
  }, [advancedPlaying, studio.activeCollectionItemId, studio.activeVariantId, studio.recordingStatus])
  useEffect(() => { if (!framingMode) { const state = useStudioStore.getState(); const project = state.advancedProjects[state.activeDirectorId]; const item = state.collectionItems.find((candidate) => candidate.id === state.activeCollectionItemId); const combination = state.designCombinations.find((candidate) => candidate.id === state.activeDesignCombinationId); setCameraDraft(state.campaignMode === 'collection' ? item?.camera ?? project.cameras.frontLeftSleeve : combination?.camera ?? project.cameras[state.activeVariantId]) } }, [framingMode, studio.activeDirectorId, studio.activeVariantId, studio.activeCollectionItemId, studio.activeDesignCombinationId, studio.campaignMode, studio.advancedProjects, studio.collectionItems, studio.designCombinations])
  useEffect(() => { useStudioStore.getState().syncAdvancedAssets() }, [studio.background.videoAudioEnabled, studio.music.name, studio.overlayLayers.length])
  useEffect(() => {
    let active = true
    const restoredUrls: string[] = []
    const restore = async () => {
      for (const role of ['large', 'small'] as VariantAssetRole[]) {
        const current = useStudioStore.getState().variantAssets[role]
        if (!current.name) continue
        const prepared = await loadPreparedMedia<PreparedVideoAssetMetadata>(variantMediaKey(role)).catch(() => null)
        if (!active || !prepared) continue
        const url = URL.createObjectURL(prepared.renderBlob); restoredUrls.push(url)
        const thumbnailUrl = prepared.thumbnailBlob ? URL.createObjectURL(prepared.thumbnailBlob) : url; if (prepared.thumbnailBlob) restoredUrls.push(thumbnailUrl)
        const metadata = prepared.metadata
        useStudioStore.getState().setVariantAsset(role, { ...current, url, thumbnailUrl, width: metadata?.proxyWidth ?? current.width, height: metadata?.proxyHeight ?? current.height, originalWidth: metadata?.originalWidth ?? current.originalWidth, originalHeight: metadata?.originalHeight ?? current.originalHeight, originalBytes: metadata?.originalBytes ?? current.originalBytes, renderBytes: metadata?.renderBytes ?? prepared.renderBlob.size, profile: metadata?.profile ?? current.profile })
      }
      for (const item of useStudioStore.getState().collectionItems) {
        if (item.asset.name) {
          const prepared = await loadPreparedMedia<PreparedVideoAssetMetadata>(collectionMediaKey(item.id, 'main')).catch(() => null)
          if (active && prepared) { const url = URL.createObjectURL(prepared.renderBlob); restoredUrls.push(url); const thumbnailUrl = prepared.thumbnailBlob ? URL.createObjectURL(prepared.thumbnailBlob) : url; if (prepared.thumbnailBlob) restoredUrls.push(thumbnailUrl); const metadata = prepared.metadata; useStudioStore.getState().updateCollectionItem(item.id, { asset: { ...item.asset, url, thumbnailUrl, width: metadata?.proxyWidth ?? item.asset.width, height: metadata?.proxyHeight ?? item.asset.height, originalWidth: metadata?.originalWidth ?? item.asset.originalWidth, originalHeight: metadata?.originalHeight ?? item.asset.originalHeight, originalBytes: metadata?.originalBytes ?? item.asset.originalBytes, renderBytes: metadata?.renderBytes ?? prepared.renderBlob.size, profile: metadata?.profile ?? item.asset.profile }, print: { ...item.print, url, name: item.asset.name } }) }
        }
        if (item.companionAsset.name) {
          const prepared = await loadPreparedMedia<PreparedVideoAssetMetadata>(collectionMediaKey(item.id, 'companion')).catch(() => null)
          if (active && prepared) { const url = URL.createObjectURL(prepared.renderBlob); restoredUrls.push(url); const thumbnailUrl = prepared.thumbnailBlob ? URL.createObjectURL(prepared.thumbnailBlob) : url; if (prepared.thumbnailBlob) restoredUrls.push(thumbnailUrl); const metadata = prepared.metadata; useStudioStore.getState().updateCollectionItem(item.id, { companionAsset: { ...item.companionAsset, url, thumbnailUrl, width: metadata?.proxyWidth ?? item.companionAsset.width, height: metadata?.proxyHeight ?? item.companionAsset.height, originalWidth: metadata?.originalWidth ?? item.companionAsset.originalWidth, originalHeight: metadata?.originalHeight ?? item.companionAsset.originalHeight, originalBytes: metadata?.originalBytes ?? item.companionAsset.originalBytes, renderBytes: metadata?.renderBytes ?? prepared.renderBlob.size, profile: metadata?.profile ?? item.companionAsset.profile }, companionPrint: { ...item.companionPrint, url, name: item.companionAsset.name } }) }
        }
      }
      for (const placement of printPlacements) {
        const current = useStudioStore.getState().prints[placement]
        if (!current.name) continue
        const prepared = await loadPreparedMedia(printMediaKey(placement)).catch(() => null)
        if (!active || !prepared) continue
        const url = URL.createObjectURL(prepared.renderBlob); restoredUrls.push(url)
        useStudioStore.getState().setPrint(placement, { url })
      }
      const state = useStudioStore.getState()
      if (state.background.type !== 'color' && state.background.name) {
        const prepared = await loadPreparedMedia(backgroundMediaKey).catch(() => null)
        if (active && prepared) { const url = URL.createObjectURL(prepared.renderBlob); restoredUrls.push(url); useStudioStore.getState().setBackground({ url }) }
      }
      if (state.music.name) {
        const blob = await loadMedia(musicMediaKey).catch(() => null)
        if (active && blob) { const url = URL.createObjectURL(blob); restoredUrls.push(url); useStudioStore.getState().setMusic({ url }) }
      }
      for (const layer of state.overlayLayers) {
        if (layer.type !== 'image' || !layer.sourceName) continue
        const prepared = await loadPreparedMedia(overlayMediaKey(layer.id)).catch(() => null)
        if (!active || !prepared) continue
        const url = URL.createObjectURL(prepared.renderBlob); restoredUrls.push(url)
        useStudioStore.getState().updateOverlayLayer(layer.id, { url })
      }
    }
    void restore()
    return () => { active = false; restoredUrls.forEach((url) => URL.revokeObjectURL(url)) }
  }, [])
  useEffect(() => {
    const handleHistoryKeys = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, [contenteditable="true"]')) return
      const key = event.key.toLowerCase()
      if (key === 'z') { event.preventDefault(); if (event.shiftKey) useStudioStore.getState().redo(); else useStudioStore.getState().undo() }
      else if (key === 'y') { event.preventDefault(); useStudioStore.getState().redo() }
    }
    window.addEventListener('keydown', handleHistoryKeys)
    return () => window.removeEventListener('keydown', handleHistoryKeys)
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
    previewSelection.current = { variantId: studio.activeVariantId, collectionItemId: studio.activeCollectionItemId, designCombinationId: studio.activeDesignCombinationId }
    setStagePlaybackState('playing')
    if (studio.studioMode === 'advanced' || studio.campaignMode === 'collection') {
      const project = useStudioStore.getState().advancedProjects[studio.activeDirectorId]
      const startAt = project.playhead >= project.duration - .05 ? 0 : project.playhead
      restartBackgroundVideo(startAt)
      studio.setAdvancedPlayhead(startAt); setAdvancedPlaying(true); setProfessionalPreviewing(true); studio.play()
      let started: number | null = null
      const tick = (timestamp: number) => {
        started ??= timestamp - startAt * 1000
        const elapsed = Math.min(project.duration, (timestamp - started) / 1000); useStudioStore.getState().setAdvancedPlayhead(elapsed); syncPreviewMusic(elapsed)
        const state = useStudioStore.getState(); const directed = directorFrameAt(state.advancedProjects[state.activeDirectorId], elapsed, state.collectionItems, state.beatSync)
        if (directed?.collectionItemId) state.setActiveCollectionItemId(directed.collectionItemId)
        else if (directed?.designCombinationId) state.setActiveDesignCombinationId(directed.designCombinationId)
        else if (directed && state.activeVariantId !== directed.variantId) state.setActiveVariantId(directed.variantId)
        if (elapsed < project.duration) previewFrame.current = requestAnimationFrame(tick)
        else {
          musicMedia.current?.pause(); setAdvancedPlaying(false); setProfessionalPreviewing(false); setStagePlaybackState('editing')
          const selected = previewSelection.current; previewSelection.current = null
          if (selected) { state.setActiveVariantId(selected.variantId); state.setActiveCollectionItemId(selected.collectionItemId); state.setActiveDesignCombinationId(selected.designCombinationId) }
        }
      }
      previewFrame.current = requestAnimationFrame(tick); return
    }
    restartBackgroundVideo()
    const professional = Boolean(studio.variantAssets.large.url && studio.variantAssets.small.url)
    const totalDuration = professional ? getProfessionalDuration(studio.duration, studio.beatSync, studio.enabledShotTypes) : studio.duration
    const selectedHero = professionalPreviewing ? heroVariantId : studio.activeVariantId; setHeroVariantId(selectedHero); let started: number | null = null; setProfessionalPreviewElapsed(0); setProfessionalPreviewing(true); studio.play()
    const tick = (timestamp: number) => {
      started ??= timestamp
      const elapsed = Math.min(totalDuration, (timestamp - started) / 1000); syncPreviewMusic(elapsed)
      if (professional) { const state = useStudioStore.getState(); const directed = getProfessionalRecordingFrame(elapsed, totalDuration, selectedHero, state.cameraView, state.beatSync, state.enabledShotTypes); setProfessionalPreviewElapsed(elapsed); if (state.activeVariantId !== directed.variantId) state.setActiveVariantId(directed.variantId) }
      if (elapsed < totalDuration) previewFrame.current = requestAnimationFrame(tick)
      else { musicMedia.current?.pause(); setProfessionalPreviewing(false); setStagePlaybackState('editing'); if (professional) useStudioStore.getState().setActiveVariantId(selectedHero); previewSelection.current = null }
    }
    setProfessionalPreviewing(professional)
    previewFrame.current = requestAnimationFrame(tick)
  }
  const pauseAdvanced = () => {
    cancelAnimationFrame(previewFrame.current); musicMedia.current?.pause(); if (media.current instanceof HTMLVideoElement) media.current.pause(); setAdvancedPlaying(false); setProfessionalPreviewing(false); setStagePlaybackState('editing')
    const selected = previewSelection.current; previewSelection.current = null
    if (selected) { useStudioStore.getState().setActiveVariantId(selected.variantId); useStudioStore.getState().setActiveCollectionItemId(selected.collectionItemId); useStudioStore.getState().setActiveDesignCombinationId(selected.designCombinationId) }
  }
  const seekAdvanced = (time: number) => {
    pauseAdvanced(); setStagePlaybackState('scrubbing'); studio.setAdvancedPlayhead(time); if (media.current instanceof HTMLVideoElement) media.current.currentTime = media.current.duration ? time % media.current.duration : time
    const state = useStudioStore.getState(); const directed = directorFrameAt(state.advancedProjects[state.activeDirectorId], time, state.collectionItems, state.beatSync)
    if (directed?.collectionItemId && directed.collectionItemId !== state.activeCollectionItemId) { timelineSelectionUpdate.current = true; studio.setActiveCollectionItemId(directed.collectionItemId) }
    else if (directed?.designCombinationId && directed.designCombinationId !== state.activeDesignCombinationId) { timelineSelectionUpdate.current = true; studio.setActiveDesignCombinationId(directed.designCombinationId) }
    else if (directed && directed.variantId !== state.activeVariantId) { timelineSelectionUpdate.current = true; studio.setActiveVariantId(directed.variantId) }
  }
  const record = async (skipPreflight = false) => {
    const validCollectionItems = studio.collectionItems.filter(isCompleteCollectionItem)
    if (studio.campaignMode === 'collection' && !isValidCollectionSize(validCollectionItems.length)) {
      studio.setRecording('error', 0, 'Completa al menos 2 pares de artes para grabar la colección.')
      return
    }
    const output = getExportResolution(studio.format, studio.exportQuality)
    const bitrate = exportQualities[studio.exportQuality].bitrate
    const isAdvanced = studio.studioMode === 'advanced'; const isCollection = studio.campaignMode === 'collection'; const usesDirector = isAdvanced || isCollection; const project = studio.advancedProjects[studio.activeDirectorId]
    const sequenceReady = Boolean(studio.variantAssets.large.url && studio.variantAssets.small.url)
    const originalVariant = professionalPreviewing ? heroVariantId : studio.activeVariantId
    const originalCollectionItemId = studio.activeCollectionItemId
    const originalDesignCombinationId = studio.activeDesignCombinationId
    const totalDuration = usesDirector ? project.duration : sequenceReady ? getProfessionalDuration(studio.duration, studio.beatSync, studio.enabledShotTypes) : studio.duration
    cancelAnimationFrame(previewFrame.current); musicMedia.current?.pause(); setProfessionalPreviewing(false); setAdvancedPlaying(false); setHeroVariantId(originalVariant)
    if (sequenceReady || isAdvanced) studio.setActiveDesignCombinationId(enabledCombinations[0]?.id ?? studio.activeDesignCombinationId)
    if (isCollection && validCollectionItems[0]) studio.setActiveCollectionItemId(validCollectionItems[0].id)
    if (usesDirector) studio.setAdvancedPlayhead(0)
    const restoreSelection = () => { if (sequenceReady || isAdvanced) { useStudioStore.getState().setActiveVariantId(originalVariant); useStudioStore.getState().setActiveDesignCombinationId(originalDesignCombinationId) } if (isCollection) useStudioStore.getState().setActiveCollectionItemId(originalCollectionItemId) }
    const usedCollectionIds = new Set(project.presentationPlan?.itemIds ?? validCollectionItems.map((item) => item.id))
    const printResources = isCollection
      ? validCollectionItems.filter((item) => usedCollectionIds.has(item.id)).flatMap((item) => [{ id: `${item.id}-main`, label: `${item.name} · Principal`, url: item.asset.url }, { id: `${item.id}-companion`, label: `${item.name} · Companion`, url: item.companionAsset.url }])
      : sequenceReady
      ? [{ id: 'variant-large', label: 'Arte principal', url: studio.variantAssets.large.url }, { id: 'variant-small', label: 'Arte secundaria', url: studio.variantAssets.small.url }]
      : Object.values(studio.prints).filter((print) => print.url).map((print) => ({ id: `print-${print.placement}`, label: print.name ?? print.placement, url: print.url }))
    const overlayResources = studio.overlayLayers.filter((layer) => layer.type === 'image').map((layer) => ({ id: `overlay-${layer.id}`, label: layer.name, url: layer.url }))
    const fonts = [...studio.overlayLayers.filter((layer) => layer.type === 'text').map(() => 'Manrope'), ...studio.designCombinations.map((item) => item.label.fontFamily), ...validCollectionItems.map((item) => item.label.fontFamily)]
    const manifest = buildRecordingResourceManifest({ modelUrl: garmentModels[0]?.path ?? 'procedural-garment', images: [...printResources, ...overlayResources], background: { type: studio.background.type, url: studio.background.url, name: studio.background.name }, music: { url: studio.music.url, name: studio.music.name }, backgroundAudioEnabled: studio.background.videoAudioEnabled, fonts })
    renderAssetManager.beginRecordingSession(manifest.flatMap((resource) => resource.kind === 'image' && resource.url ? [resource.url] : []))
    studio.setRecording('preparing', 0, 'Construyendo manifiesto de grabación…', { completed: 0, total: manifest.length })
    const begin = () => { restartBackgroundVideo(); studio.play(); const current = useStudioStore.getState(); start({ renderCanvas: canvas, media: media.current, background: current.background, music: current.music, beatSync: current.beatSync, enabledShotTypes: current.enabledShotTypes, overlayLayers: current.overlayLayers, layerOrder: current.layerOrder, systemLayerTimings: current.systemLayerTimings, professionalHeroVariantId: !usesDirector && sequenceReady ? originalVariant : null, advancedProject: usesDirector ? current.advancedProjects[current.activeDirectorId] : null, collectionItems: current.collectionItems.filter(isCompleteCollectionItem), designCombinations: current.designCombinations, duration: totalDuration, width: output.width, height: output.height, bitrate, fps: current.exportFps,
      onProgress: (seconds) => {
        if (usesDirector) {
          const state = useStudioStore.getState(); state.setAdvancedPlayhead(seconds)
          const directed = directorFrameAt(state.advancedProjects[state.activeDirectorId], seconds, state.collectionItems, state.beatSync)
          if (directed?.collectionItemId) state.setActiveCollectionItemId(directed.collectionItemId)
          else if (directed?.designCombinationId) state.setActiveDesignCombinationId(directed.designCombinationId)
          else if (directed && state.activeVariantId !== directed.variantId) state.setActiveVariantId(directed.variantId)
        } else if (sequenceReady) {
          const state = useStudioStore.getState(); const directed = getProfessionalRecordingFrame(seconds, totalDuration, originalVariant, state.cameraView, state.beatSync, state.enabledShotTypes)
          if (useStudioStore.getState().activeVariantId !== directed.variantId) useStudioStore.getState().setActiveVariantId(directed.variantId)
        }
        studio.setRecording('recording', seconds)
      },
      onFinalizing: () => studio.setRecording('finalizing', totalDuration, 'Codificando y guardando el archivo…'),
      onFinish: (message) => { renderAssetManager.endRecordingSession(); restoreSelection(); setStagePlaybackState('editing'); studio.setRecording('done', totalDuration, message) },
      onError: (message) => { renderAssetManager.endRecordingSession(); restoreSelection(); setStagePlaybackState('editing'); studio.setRecording('error', 0, message) },
    }) }
    if (skipPreflight) {
      studio.setRecording('recording', 0, 'Preflight omitido manualmente', { completed: 0, total: manifest.length })
      begin()
      return
    }
    try {
      await runRecordingPreflight({ manifest, canvas, width: output.width, height: output.height, backgroundMedia: media.current, onProgress: (progress) => studio.setRecording(progress.phase, 0, progress.message, progress) })
      studio.setRecording('recording', 0, 'Grabación iniciada', { completed: manifest.length, total: manifest.length })
      begin()
    } catch (error) {
      renderAssetManager.endRecordingSession()
      restoreSelection()
      studio.setRecording('error', 0, error instanceof Error ? `No se pudo preparar: ${error.message}` : 'No se pudo completar el preflight.')
    }
  }
  const variantLibraryEnabled = hasVariantLibrary(studio.variantAssets)
  const activeVariant = getGarmentVariantPreset(studio.activeVariantId)
  const collectionMode = studio.campaignMode === 'collection'
  const basicProfessionalDuration = variantLibraryEnabled ? getProfessionalDuration(studio.duration, studio.beatSync, studio.enabledShotTypes) : studio.duration
  const directedMode = studio.studioMode === 'advanced' || collectionMode
  const recordingBusy = busyRecordingStatuses.includes(studio.recordingStatus)
  const collectionReady = !collectionMode || isValidCollectionSize(completeCollectionItems.length)
  const collectionDirecting = collectionMode && (studio.studioMode === 'advanced' || advancedPlaying || recordingBusy)
  const stageUsesProject = !framingMode && (studio.studioMode === 'advanced' || collectionDirecting)
  const advancedTime = studio.recordingStatus === 'recording' && directedMode ? studio.recordingElapsed : advancedProject.playhead
  const timelineStageActive = stagePlaybackState !== 'editing' || studio.recordingStatus === 'recording'
  const professionalFrame = stageUsesProject && timelineStageActive
    ? directorFrameAt(advancedProject, advancedTime, studio.collectionItems, studio.beatSync)
    : variantLibraryEnabled && studio.recordingStatus === 'recording'
    ? getProfessionalRecordingFrame(studio.recordingElapsed, basicProfessionalDuration, heroVariantId, studio.cameraView, studio.beatSync, studio.enabledShotTypes)
    : variantLibraryEnabled && professionalPreviewing ? getProfessionalRecordingFrame(professionalPreviewElapsed, basicProfessionalDuration, heroVariantId, studio.cameraView, studio.beatSync, studio.enabledShotTypes) : null
  const variantTemplate = studio.variantPrintSettings.frontLeftSleeve
  const zoneTemplate = studio.variantZoneAdjustments.frontLeftSleeve
  const editingCompanion = collectionMode && studio.activeCollectionAssetRole === 'companion'
  const activeCollectionPlacement = activeCollectionItem ? editingCompanion ? activeCollectionItem.companionPlacement : activeCollectionItem.placement : studio.activePrintPlacement
  const activeDesignPlacement = activeCombination ? activeCombination.focusRole === 'main' ? activeCombination.mainPlacement : activeCombination.companionPlacement : studio.activePrintPlacement
  const activePrintSettings = collectionMode ? variantTemplate : activeCombination?.printSettings ?? studio.prints
  const activeZoneAdjustments = collectionMode ? collectionZones(activeCollectionItem, zoneTemplate) : activeCombination?.zoneAdjustments ?? studio.printZoneAdjustments
  const printApplications = collectionMode ? collectionPrints(activeCollectionItem, variantTemplate) : activeCombination ? createCombinationPrints(activeCombination, studio.variantAssets) : Object.values(activePrintSettings)
  const updatePrint = (placement: Parameters<typeof studio.setPrint>[0], value: Parameters<typeof studio.setPrint>[1]) => {
    if (collectionMode && activeCollectionItem && placement === activeCollectionPlacement) studio.updateCollectionItem(activeCollectionItem.id, editingCompanion ? { companionPrint: { ...activeCollectionItem.companionPrint, ...value } } : { print: { ...activeCollectionItem.print, ...value } })
    else if (activeCombination) studio.updateDesignCombination(activeCombination.id, { printSettings: { ...activeCombination.printSettings, [placement]: { ...activeCombination.printSettings[placement], ...value } } })
    else studio.setPrint(placement, value)
  }
  const updateZone = (placement: Parameters<typeof studio.setPrintZoneAdjustment>[0], value: Parameters<typeof studio.setPrintZoneAdjustment>[1]) => {
    if (collectionMode && activeCollectionItem && placement === activeCollectionPlacement) studio.updateCollectionItem(activeCollectionItem.id, editingCompanion ? { companionZoneAdjustment: { ...activeCollectionItem.companionZoneAdjustment, ...value } } : { zoneAdjustment: { ...activeCollectionItem.zoneAdjustment, ...value } })
    else if (activeCombination) studio.updateDesignCombination(activeCombination.id, { zoneAdjustments: { ...activeCombination.zoneAdjustments, [placement]: { ...activeCombination.zoneAdjustments[placement], ...value } } })
    else studio.setPrintZoneAdjustment(placement, value)
  }
  const directorClip = stageUsesProject && timelineStageActive ? activeClip(advancedProject, 'director', advancedTime) : null
  const sceneItemIds = directorClip?.itemIds ?? []
  const sceneItems = sceneItemIds.map((id) => completeCollectionItems.find((item) => item.id === id)).filter((item): item is CollectionItem => Boolean(item))
  const sceneCombinations = (sceneItemIds.length ? sceneItemIds.map((id) => enabledCombinations.find((item) => item.id === id)).filter((item): item is NonNullable<typeof item> => Boolean(item)) : enabledCombinations)
  const gridViews = collectionMode
    ? sceneItems.map((item, index) => ({ id: item.id, prints: collectionPrints(item, variantTemplate), zones: collectionZones(item, zoneTemplate), camera: item.camera, garmentColor: item.garmentColor, baseRotation: placementRotation[item.placement], primaryPlacement: item.placement, companionPlacement: item.companionPlacement, motion: studio.collectionMotionIds.length ? studio.collectionMotionIds[Math.max(0, completeCollectionItems.findIndex((candidate) => candidate.id === item.id)) % studio.collectionMotionIds.length] : 'turntableRight' as const, beatDelay: hasBeatMap(studio.beatSync) && studio.beatSync.stagger ? index * beatDuration(studio.beatSync) : 0, beatStyle: hasBeatMap(studio.beatSync) ? studio.beatSync.style : undefined }))
    : sceneCombinations.map((combination, index) => ({ id: combination.id, prints: createCombinationPrints(combination, studio.variantAssets), zones: combination.zoneAdjustments, camera: combination.camera, garmentColor: combination.garmentColor, baseRotation: placementRotation[combination.mainPlacement], primaryPlacement: combination.mainPlacement, companionPlacement: combination.companionPlacement, motion: studio.collectionMotionIds.length ? studio.collectionMotionIds[index % studio.collectionMotionIds.length] : 'turntableRight' as const, beatDelay: hasBeatMap(studio.beatSync) && studio.beatSync.stagger ? index * beatDuration(studio.beatSync) : 0, beatStyle: hasBeatMap(studio.beatSync) ? studio.beatSync.style : undefined }))
  const viewerCamera = cameraDraft
  const resetFraming = () => {
    pauseAdvanced()
    const reset = collectionMode ? createDefaultCamera() : createDefaultCamera(activeCombination?.presetId ?? studio.activeVariantId)
    setCameraDraft(reset)
    if (collectionMode && activeCollectionItem) studio.updateCollectionItem(activeCollectionItem.id, { camera: reset })
    else if (activeCombination) studio.updateDesignCombination(activeCombination.id, { camera: reset })
    setFramingMode(false)
  }
  const viewer = { garmentColor: collectionMode && activeCollectionItem ? activeCollectionItem.garmentColor : activeCombination?.garmentColor ?? studio.garmentColor, printApplications, printZoneAdjustments: activeZoneAdjustments, activePrintPlacement: collectionMode && activeCollectionItem ? activeCollectionPlacement : activeDesignPlacement, editorMode: studio.editorMode, alignmentRequest: studio.alignmentRequest, onPrintMove: (placement: Parameters<typeof studio.setPrint>[0], x: number, y: number) => updatePrint(placement, { x, y }), onPrintScale: (placement: Parameters<typeof studio.setPrint>[0], scale: number) => updatePrint(placement, { scale }), onPrintZoneChange: updateZone, showPrintGuides: !recordingBusy && !professionalPreviewing && !guidesHidden && stagePlaybackState === 'editing', animation: studio.animation, duration: directedMode ? advancedProject.duration : basicProfessionalDuration, playbackKey: studio.playbackKey, targetRotation: studio.targetRotation, cameraView: viewerCamera, cameraFov: cameraDraft.fov, cameraComposition: framingMode ? cameraDraft.composition : [0, 0] as [number, number], onCameraViewChange: (view: typeof studio.cameraView) => framingMode && setCameraDraft((current) => ({ ...current, ...view })), professionalFrame, renderResolution: recordingBusy ? getExportResolution(studio.format, studio.exportQuality) : null }
  const setWorkspace = (next: WorkspaceId) => { setWorkspaceState(next); window.localStorage.setItem(workspaceKey, next); if (next !== 'direction' && framingMode) { setCameraDraft(selectedCamera); setFramingMode(false) } }
  const resizeTimeline = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const editor = event.currentTarget.parentElement
    if (!editor) return
    const bounds = editor.getBoundingClientRect()
    const move = (moveEvent: PointerEvent) => {
      const next = clampTimelineHeight((bounds.bottom - moveEvent.clientY) / bounds.height * 100)
      setTimelineHeight(next)
      window.localStorage.setItem(timelineHeightKey, next.toFixed(2))
    }
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop)
  }
  const setTimelineVisibility = (collapsed: boolean) => {
    setTimelineCollapsed(collapsed)
    window.localStorage.setItem(timelineCollapsedKey, String(collapsed))
  }
  useEffect(() => {
    const toggleTimeline = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.key.toLowerCase() !== 't' || event.ctrlKey || event.metaKey || event.altKey || target?.matches('input, textarea, select, [contenteditable="true"]')) return
      event.preventDefault(); setTimelineCollapsed((current) => { const next = !current; window.localStorage.setItem(timelineCollapsedKey, String(next)); return next })
    }
    window.addEventListener('keydown', toggleTimeline)
    return () => window.removeEventListener('keydown', toggleTimeline)
  }, [])
  const layoutStyle = {
    '--stage-width': `${exportPresets[studio.format].ratio * 100}dvh`,
    '--timeline-height': `${timelineHeight}%`,
  } as CSSProperties
  const outputResolution = getExportResolution(studio.format, studio.exportQuality)
  const statusDuration = directedMode ? advancedProject.duration : basicProfessionalDuration
  const statusTime = studio.recordingStatus === 'recording' ? studio.recordingElapsed : directedMode ? advancedProject.playhead : professionalPreviewing ? professionalPreviewElapsed : 0
  const statusPlaying = advancedPlaying || professionalPreviewing
  const statusCampaign = collectionMode ? `Colección · ${completeCollectionItems.length} prendas` : activeCombination ? `Diseño único · ${activeCombination.name}` : variantLibraryEnabled ? `Variantes · ${activeVariant.label}` : 'Diseño individual'
  const statusSelection = collectionMode && activeCollectionItem ? `${activeCollectionItem.name} · ${editingCompanion ? 'Companion' : 'Principal'}` : `${activeCollectionPlacement} · ${studio.editorMode === 'zone' ? 'Zona' : 'Diseño'}`
  const statusActivity = assetTask ?? (framingMode ? 'Ajustando encuadre' : guidesHidden ? 'Vista limpia' : studio.editorMode === 'zone' ? 'Configurando zona imprimible' : 'Editando estampado')
  const directorPanel = <AdvancedDirectorPanel framing={framingMode} draft={cameraDraft} onBeginFraming={() => { pauseAdvanced(); setCameraDraft(collectionMode ? activeCollectionItem?.camera ?? cameraDraft : activeCombination?.camera ?? cameraDraft); setFramingMode(true) }} onCancelFraming={() => { setCameraDraft(collectionMode ? activeCollectionItem?.camera ?? cameraDraft : activeCombination?.camera ?? cameraDraft); setFramingMode(false) }} onSaveFraming={() => { if (collectionMode && activeCollectionItem) studio.updateCollectionItem(activeCollectionItem.id, { camera: { ...cameraDraft, saved: true } }); else if (activeCombination) studio.updateDesignCombination(activeCombination.id, { camera: { ...cameraDraft, saved: true } }); setFramingMode(false) }} onResetFraming={resetFraming} onDraftFov={(fov) => setCameraDraft((current) => ({ ...current, fov }))} onDraftComposition={(composition) => setCameraDraft((current) => ({ ...current, composition }))} />
  return <main className="studio zen-studio advanced-mode unified-studio">
    <div className="zen-layout" style={layoutStyle}>
      <section className={`editor-column${timelineCollapsed ? ' timeline-collapsed' : ' has-editor-timeline'}`}>
        <EditorHeader canUndo={studio.canUndo} canRedo={studio.canRedo} onUndo={studio.undo} onRedo={studio.redo} renderLayers={(close) => <LayersDrawer embedded onRequestClose={close} />} renderSettings={() => <SettingsPanel onTaskChange={setAssetTask} />} layerCount={studio.layerOrder.length} playing={statusPlaying} recording={studio.recordingStatus === 'recording'} previewDisabled={recordingBusy || !collectionReady} recordDisabled={recordingBusy || !collectionReady} onPreview={statusPlaying ? pauseAdvanced : play} onRecord={() => { void record() }} />
        <WorkspaceTabs value={workspace} tabs={workspaceTabs} onChange={setWorkspace} />
        <aside className="control-drawer workspace-drawer">
        <div className="drawer-intro"><span>{workspaceTabs.find((tab) => tab.id === workspace)?.label}</span><strong>{collectionMode ? `${completeCollectionItems.length} pares · ${buildPresentationGroups(completeCollectionItems).length} grupos · ${studio.presentationMode}` : variantLibraryEnabled ? activeVariant.label : 'Configura tu producto'}</strong></div>
        <div className="workspace-content">{workspace === 'designs' ? <><CampaignPanel />{!collectionMode && <DesignPanel />}</> : workspace === 'scene' ? <BackgroundPanel /> : workspace === 'direction' ? directorPanel : <AudioPanel />}</div>
        </aside>
        <>
          <button className="editor-split-resizer" onPointerDown={resizeTimeline} aria-label="Cambiar altura de la línea de tiempo" title="Arrastra para cambiar la altura de la línea de tiempo" />
          <div className="timeline-slot"><AdvancedTimeline embedded collapsed={timelineCollapsed} onCollapsedChange={setTimelineVisibility} playing={advancedPlaying} onTogglePlay={advancedPlaying ? pauseAdvanced : play} onSeek={seekAdvanced} /></div>
        </>
        <EditorStatusBar mode={studio.studioMode} campaign={statusCampaign} selection={statusSelection} activity={statusActivity} currentTime={statusTime} duration={statusDuration} playing={statusPlaying} recordingStatus={studio.recordingStatus} recordingMessage={studio.recordingMessage} preparedResources={studio.recordingPreparedResources} totalResources={studio.recordingTotalResources} shot={professionalFrame?.shotLabel} output={`${outputResolution.width}×${outputResolution.height} · ${studio.exportFps} FPS`} />
        {studio.recordingStatus === 'error' && <div className="preflight-status-banner" role="alert"><AlertTriangle size={15} /><span>{studio.recordingMessage}</span><button onClick={() => { void record() }}><RefreshCw size={13} /> Reintentar</button><button className="warning" onClick={() => { void record(true) }}><AlertTriangle size={13} /> Grabar igualmente</button><button onClick={() => studio.setRecording('idle')} aria-label="Cerrar aviso"><X size={13} /></button></div>}
      </section>
      <section className="zen-workspace">
        <audio ref={musicMedia} className="music-preview-media" src={studio.music.url ?? undefined} preload="auto" />
        <AdStage format={studio.format} background={studio.background} mediaRef={media} onCanvasReady={setCanvas} viewer={viewer} overlayLayers={studio.overlayLayers} layerOrder={studio.layerOrder} selectedLayerId={studio.selectedLayerId} systemLayerTimings={studio.systemLayerTimings} duration={directedMode ? advancedProject.duration : basicProfessionalDuration} playbackKey={studio.playbackKey} recordingStatus={studio.recordingStatus} recordingElapsed={studio.recordingElapsed} professionalFrame={professionalFrame} advancedProject={stageUsesProject ? advancedProject : null} advancedTime={advancedTime} advancedGridViews={stageUsesProject ? gridViews : null} playbackState={studio.recordingStatus === 'recording' ? 'recording' : stagePlaybackState} collectionItems={completeCollectionItems} designCombinations={studio.designCombinations} onSelectLayer={studio.selectLayer} onUpdateOverlay={studio.updateOverlayLayer} />
      </section>
    </div>
  </main>
}
