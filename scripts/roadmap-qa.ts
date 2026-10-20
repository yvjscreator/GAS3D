import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { buildPresentationGroups, buildPresentationPlan } from '../src/utils/presentationPlanner'
import { applyBeatSyncToProject, createCollectionProject, createDefaultLabel, createDirectorProject } from '../src/config/advancedDirectors'
import { defaultBeatSyncSettings, nextDownbeat, quantizedCueDuration } from '../src/utils/beatSync'
import { evaluateShotTiming } from '../src/utils/shotTiming'
import { evaluateDirectorTransition } from '../src/config/directorTransitions'
import { defaultQuickVideoSettings, resolveQuickVideoPreset } from '../src/config/quickVideoPresets'
import { buildRecordingResourceManifest } from '../src/utils/recordingPreflight'
import { evaluateBackgroundFrame, evaluateDirectorFrame } from '../src/utils/stageTimeline'
import { getExportResolution } from '../src/config/exportPresets'
import type { CollectionItem, DesignCombination, DirectorShotKind, PresentationMode } from '../src/types/studio'

let assertions = 0
const check = (condition: unknown, message: string) => { assertions += 1; assert.ok(condition, message) }
const equal = (actual: unknown, expected: unknown, message: string) => { assertions += 1; assert.deepEqual(actual, expected, message) }

const expectedGroups: Record<number, number[]> = {
  2: [2], 3: [3], 4: [4], 5: [3, 2], 6: [3, 3], 7: [4, 3], 8: [4, 4],
  9: [3, 3, 3], 10: [4, 3, 3], 11: [4, 4, 3], 12: [4, 4, 4],
}
for (let count = 2; count <= 12; count += 1) {
  const items = Array.from({ length: count }, (_, index) => `item-${index + 1}`)
  const groups = buildPresentationGroups(items)
  equal(groups.map((group) => group.length), expectedGroups[count], `Distribución equilibrada incorrecta para ${count} elementos`)
  equal(groups.flat(), items, `El orden se perdió para ${count} elementos`)
}

const ids = ['v1', 'v2', 'v3', 'v4']
const allShots: DirectorShotKind[] = ['groupShowcase', 'itemShowcase', 'hero', 'detailLarge', 'detailSmall']
const planCounts: Record<PresentationMode, number> = { grouped: 1, sequential: 16, mixed: 17 }
for (const mode of ['grouped', 'sequential', 'mixed'] as const) {
  const plan = buildPresentationPlan(ids, mode, allShots)
  equal(plan.scenes.length, planCounts[mode], `Cantidad de escenas incorrecta para ${mode}`)
  equal(plan.itemIds, ids, `El plan ${mode} no conserva IDs explícitos`)
}

const directorCounts: Record<PresentationMode, number> = { grouped: 1, sequential: 7, mixed: 8 }
for (const mode of ['grouped', 'sequential', 'mixed'] as const) {
  const project = createDirectorProject('cinematic', [], false, false, allShots, mode)
  const clips = project.tracks.find((track) => track.type === 'director')?.clips ?? []
  equal(clips.length, directorCounts[mode], `Timeline de variantes incorrecta para ${mode}`)
  check(clips.every((clip) => Boolean(clip.sceneId) && Boolean(clip.itemIds?.length)), `Faltan referencias de escena en ${mode}`)
  equal(project.presentationPlan?.mode, mode, `El proyecto no conserva el modo ${mode}`)
}

const withoutHero = allShots.filter((kind) => kind !== 'hero')
const noHeroProject = createDirectorProject('cinematic', [], false, false, withoutHero, 'mixed')
const noHeroClips = noHeroProject.tracks.find((track) => track.type === 'director')?.clips ?? []
check(noHeroClips.every((clip) => clip.shotKind !== 'hero'), 'Desactivar Hero no lo eliminó de la timeline')
equal(noHeroClips.length, 7, 'Desactivar Hero no redujo la duración lógica del plan')

const dynamicCombinations = Array.from({ length: 4 }, (_, index) => ({
  id: `combination-${index + 1}`,
  name: `Combinación ${index + 1}`,
  enabled: index !== 1,
  order: index,
  presetId: index < 2 ? 'frontLeftSleeve' : undefined,
  label: { ...createDefaultLabel(`Combinación ${index + 1}`), enabled: index !== 3 },
})) as DesignCombination[]
const dynamicProject = createDirectorProject('cinematic', [], false, false, ['groupShowcase', 'itemShowcase'], 'mixed', dynamicCombinations, ['turntableLeft'], ['matchRotation'])
const dynamicDirectorClips = dynamicProject.tracks.find((track) => track.type === 'director')?.clips ?? []
equal(dynamicProject.presentationPlan?.itemIds, ['combination-1', 'combination-3', 'combination-4'], 'El director dinámico no respetó combinaciones habilitadas y su orden')
check(dynamicDirectorClips.every((item) => !item.itemIds?.includes('combination-2')), 'Una combinación deshabilitada llegó a la película')
check(dynamicDirectorClips.some((item) => item.designCombinationId === 'combination-3'), 'Las tomas individuales no conservan el ID dinámico')
equal(dynamicProject.tracks.filter((track) => track.type === 'label').length, 2, 'Se creó una pista para una etiqueta desactivada')
check(dynamicDirectorClips.filter((item) => item.type === 'directorShot').every((item) => item.garmentMotion === 'turntableLeft'), 'El movimiento elegido no llegó a las tomas dinámicas')
check(dynamicDirectorClips.every((item) => item.directorTransition === 'matchRotation'), 'La transición de director elegida no llegó a todo el montaje dinámico')

const beatSync = { ...defaultBeatSyncSettings(), enabled: true, bpm: 120, barsPerChange: 1, offset: 0 }
const synced = applyBeatSyncToProject(createDirectorProject('cinematic', [], true, false, allShots, 'mixed'), beatSync)
equal(synced.duration, 30, 'El modo mixto no respetó la nueva jerarquía rítmica y los mínimos legibles de tomas')
const syncedDirector = synced.tracks.find((track) => track.type === 'director')?.clips ?? []
for (const label of synced.tracks.filter((track) => track.type === 'label').flatMap((track) => track.clips)) {
  const scene = syncedDirector.find((clip) => clip.sceneId === label.sceneId)
  check(Boolean(scene) && scene!.start === label.start && scene!.duration === label.duration, 'Una etiqueta perdió sincronía con su escena')
}

const semanticHold = evaluateShotTiming(.5)
equal(semanticHold.phase, 'hold', 'El timing semántico abandonó HOLD demasiado pronto')
equal(semanticHold.motionProgress, 0, 'HOLD volvió a ejecutar movimiento fuerte')
check(evaluateShotTiming(.8).phase === 'transition', 'La ventana de transición semántica no es determinista')
equal(quantizedCueDuration(beatSync, 1, 3.2), 4, 'Un hero a 120 BPM no se expandió hasta un cue legible')
equal(nextDownbeat(2.15, beatSync), 4, 'El siguiente downbeat no quedó cuantizado al compás')

const transitionFrame = evaluateDirectorTransition('matchRotation', { phase: 'transition', local: 1, overall: .95, motionProgress: .9 }, 0, Math.PI / 2)
check(Math.abs(transitionFrame.rotationOffset - Math.PI / 2) < .0001, 'Match Rotation no alinea la salida con la orientación siguiente')

const quickPremium = resolveQuickVideoPreset(defaultQuickVideoSettings())
equal(quickPremium.presentationMode, 'mixed', 'Premium rápido dejó de usar narrativa mixta')
check(quickPremium.shotTiming.hold >= .7, 'Premium rápido dejó de reservar tiempo dominante de exhibición')
check(quickPremium.transitionIds.includes('matchRotation'), 'Premium rápido perdió Match Rotation')

const generatedSemanticProject = createDirectorProject('cinematic', [], false, false, allShots, 'mixed')
const generatedDirectorShots = generatedSemanticProject.tracks.find((track) => track.type === 'director')?.clips.filter((clip) => clip.type === 'directorShot') ?? []
check(generatedDirectorShots.every((clip) => Boolean(clip.shotTiming)), 'Una toma nueva no recibió ShotTimingProfile')
check(generatedSemanticProject.tracks.find((track) => track.type === 'director')?.clips.every((clip) => Boolean(clip.directorTransition)), 'Una toma nueva no recibió transición de director')

const manualProject = createDirectorProject('cinematic', [], false, false, allShots, 'mixed')
const manualTrack = manualProject.tracks.find((track) => track.type === 'director')!
const manualTarget = manualTrack.clips.find((clip) => clip.type === 'directorShot')!
manualTarget.start = 1.25
manualTarget.duration = 5.5
manualTarget.manualTiming = true
const manualSynced = applyBeatSyncToProject(manualProject, beatSync)
const manualAfterSync = manualSynced.tracks.find((track) => track.type === 'director')?.clips.find((clip) => clip.id === manualTarget.id)
equal(manualAfterSync?.start, 1.25, 'Beat sync sobrescribió el inicio manual')
equal(manualAfterSync?.duration, 5.5, 'Beat sync sobrescribió la duración manual')

const collectionItems = Array.from({ length: 12 }, (_, index) => ({
  id: `collection-${index + 1}`, name: `Diseño ${index + 1}`, asset: { name: 'principal.png' }, companionAsset: { name: 'companion.png' }, label: { ...createDefaultLabel(`Diseño ${index + 1}`), enabled: index !== 1 },
})) as CollectionItem[]
const collection = createCollectionProject(collectionItems.slice(0, 9), [], false, false, undefined, undefined, undefined, undefined, 'grouped', allShots)
equal(collection.presentationPlan?.groups.map((group) => group.length), [3, 3, 3], 'La colección de nueve diseños no usa 3 + 3 + 3')
equal(collection.tracks.find((track) => track.type === 'director')?.clips.map((clip) => clip.itemIds?.length), [3, 3, 3], 'Las escenas de colección no guardan sus IDs explícitos')
equal(collection.tracks.filter((track) => track.type === 'label').length, 8, 'La colección generó una pista para una etiqueta desactivada')
for (let count = 2; count <= 12; count += 1) {
  for (const mode of ['grouped', 'sequential', 'mixed'] as const) {
    const project = createCollectionProject(collectionItems.slice(0, count), [], false, false, undefined, undefined, undefined, undefined, mode, allShots)
    equal(project.presentationPlan?.itemIds.length, count, `La colección ${mode} perdió elementos para tamaño ${count}`)
    check((project.tracks.find((track) => track.type === 'director')?.clips.length ?? 0) > 0, `La colección ${mode} quedó sin escenas para tamaño ${count}`)
  }
}

const manifest = buildRecordingResourceManifest({
  modelUrl: '/garment.glb',
  images: [{ id: 'a', label: 'A', url: '/a.png' }, { id: 'a-copy', label: 'A copia', url: '/a.png' }, { id: 'b', label: 'B', url: '/b.png' }],
  background: { type: 'video', url: '/background.mp4', name: 'Fondo' },
  music: { url: '/music.mp3', name: 'Música' }, backgroundAudioEnabled: true,
  fonts: ['Manrope', 'Manrope', 'DM Mono'],
})
equal(manifest.length, 8, 'El manifiesto no deduplicó o perdió recursos de grabación')
equal(manifest.filter((resource) => resource.url === '/a.png').length, 1, 'Una imagen duplicada se precargará más de una vez')
check(manifest.some((resource) => resource.id === 'background-audio'), 'Falta el audio del video de fondo en el manifiesto')

equal(getExportResolution('reel', 'hd'), { width: 1080, height: 1920 }, 'La salida HD vertical no es real')
equal(getExportResolution('reel', '2k'), { width: 1440, height: 2560 }, 'La salida 2K vertical no es real')
equal(getExportResolution('reel', '4k'), { width: 2160, height: 3840 }, 'La salida 4K vertical no es real')

const sixtySecondProject = createDirectorProject('cinematic', [], false, false, allShots, 'mixed')
sixtySecondProject.duration = 60
const backgroundTrack = sixtySecondProject.tracks.find((track) => track.type === 'background')!
backgroundTrack.clips[0].duration = 60
const staleBackgroundTiming = { start: 0, duration: 8, enter: 'none' as const, exit: 'none' as const }
check(evaluateBackgroundFrame(sixtySecondProject, staleBackgroundTiming, 59.9).visible, 'El fondo dirigido desaparece por el timing antiguo antes del final')
check(!evaluateBackgroundFrame(null, staleBackgroundTiming, 59.9).visible, 'La prueba de regresión no detecta el timing antiguo')
check(evaluateDirectorFrame(sixtySecondProject, 59.9, 'editing').visible, 'El stage de edición oculta la prenda por un playhead sin clip')
check(!evaluateDirectorFrame(sixtySecondProject, 59.9, 'recording').visible, 'Recording debe respetar la ausencia real de una toma en timeline')

const sourceFiles = ['src/utils/presentationPlanner.ts', 'src/config/advancedDirectors.ts']
const combinedSource = sourceFiles.map((file) => readFileSync(file, 'utf8')).join('\n')
check(!combinedSource.includes('PROFESSIONAL_CUE_COUNT'), 'Regresó el conteo fijo de cues profesionales')
check(!combinedSource.match(/batchIndex\s*\*\s*4/), 'Regresó la indexación fija por lotes de cuatro')
check(!existsSync('src/config/professionalRecording.ts'), 'El camino de grabación profesional legacy volvió al proyecto')
check(!readFileSync('src/hooks/useRecording.ts', 'utf8').includes('captureStream(30)'), 'La grabación volvió a fijar 30 FPS ignorando Configuración')
const mediaStorageSource = readFileSync('src/utils/mediaStorage.ts', 'utf8')
check(mediaStorageSource.includes(':source`'), 'IndexedDB no conserva una clave source para los originales')
check(mediaStorageSource.includes('storeValues(values)'), 'El reemplazo de proxy dejó de usar una escritura agrupada segura')
for (const file of ['src/components/studio/VariantsPanel.tsx', 'src/components/studio/CampaignPanel.tsx']) check(readFileSync(file, 'utf8').match(/storePreparedMedia\([^\n]+,\s*(item\.file|file)\)/), `${file} no entrega el original al almacenamiento frío`)
const studioShellSource = readFileSync('src/components/studio/GarmentAdStudio.tsx', 'utf8')
check(studioShellSource.includes('garment-ad-studio:timeline-height'), 'La altura de timeline dejó de persistirse')
check(studioShellSource.includes('garment-ad-studio:timeline-collapsed'), 'El estado colapsado de timeline dejó de persistirse')
check(!studioShellSource.includes('<AnimationPanel'), 'Animación legacy volvió a duplicar los controles de Dirección')
check(!studioShellSource.includes('getProfessional'), 'El shell volvió a depender del camino profesional legacy')
check(studioShellSource.includes('<QuickVideoPanel') && studioShellSource.includes("studioExperienceMode === 'quick'"), 'El shell perdió la entrada de Video rápido')
const studioStoreSource = readFileSync('src/store/studioStore.ts', 'utf8')
check(studioStoreSource.includes("studioExperienceMode: persisted.studioExperienceMode ?? 'quick'"), 'Video rápido dejó de ser la entrada predeterminada')
check(studioStoreSource.includes('preserveManualTimelineEdits({'), 'La migración dejó de preservar timing manual')
check(readFileSync('src/config/advancedDirectors.ts', 'utf8').includes('ADVANCED_SCHEMA_VERSION = 10'), 'El schema del rediseño de video no avanzó a v10')

const collectionPanelSource = readFileSync('src/components/studio/CampaignPanel.tsx', 'utf8')
check(collectionPanelSource.includes('onDoubleClick') && collectionPanelSource.includes('.filter((placement)'), 'Colección perdió la selección P/C contextual o volvió a mostrar ubicaciones ocupadas')
check(collectionPanelSource.includes('<PrintZoneInspector') && collectionPanelSource.includes('companionZoneAdjustment'), 'Colección perdió los controles completos o la zona independiente del Companion')
const variantsPanelSource = readFileSync('src/components/studio/VariantsPanel.tsx', 'utf8')
check(variantsPanelSource.includes('chooseOne') && !variantsPanelSource.includes('inspected.sort'), 'Diseño único volvió a inferir Principal por resolución')
check(variantsPanelSource.includes('single-design-workspace') && variantsPanelSource.includes('updateName') && variantsPanelSource.includes('updatePlacement'), 'Las variantes dejaron de tener edición directa maestro/detalle')
check(variantsPanelSource.includes('<PrintZoneInspector') && !studioShellSource.includes('<DesignPanel'), 'Diseño único volvió a separar o duplicar el inspector de estampado')
check(!variantsPanelSource.includes('Incluir en el video') && !variantsPanelSource.includes('variant-role-selector'), 'El detalle de Diseño único volvió a duplicar controles de la lista maestra')
const printInspectorSource = readFileSync('src/components/studio/PrintZoneInspector.tsx', 'utf8')
check(printInspectorSource.includes('Alinear zona sobre la prenda') && printInspectorSource.includes('printSizePresetsCm') && printInspectorSource.includes("onEditorModeChange('zone')"), 'El inspector compartido perdió controles de zona')
check(!printInspectorSource.includes('Arte seleccionada') && !printInspectorSource.includes("slider('Horizontal'") && !printInspectorSource.includes('Integración con tela'), 'El inspector compartido volvió a mostrar controles redundantes')
const layersSource = readFileSync('src/components/studio/LayersDrawer.tsx', 'utf8')
check(!layersSource.includes('musicMediaKey') && !layersSource.includes('selectedMusic'), 'Capas volvió a duplicar la autoridad de Audio')
const timelineSource = readFileSync('src/components/studio/AdvancedTimeline.tsx', 'utf8')
check(timelineSource.includes('canSplit') && timelineSource.includes("track.type === 'background'"), 'Timeline volvió a mostrar acciones imposibles')
check(readFileSync('src/components/studio/BackgroundPanel.tsx', 'utf8').includes("background.type !== 'color' && range('Desenfoque'"), 'Escena volvió a mostrar desenfoque sin efecto para un fondo de color')

console.log(`Roadmap QA completado: ${assertions} verificaciones.`)
