import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildPresentationGroups, buildPresentationPlan } from '../src/utils/presentationPlanner'
import { applyBeatSyncToProject, createCollectionProject, createDirectorProject } from '../src/config/advancedDirectors'
import { buildProfessionalShotSequence, getProfessionalDuration } from '../src/config/professionalRecording'
import { defaultBeatSyncSettings } from '../src/utils/beatSync'
import { buildRecordingResourceManifest } from '../src/utils/recordingPreflight'
import { evaluateBackgroundFrame, evaluateDirectorFrame } from '../src/utils/stageTimeline'
import type { CollectionItem, DirectorShotKind, PresentationMode } from '../src/types/studio'

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

equal(buildProfessionalShotSequence('frontLeftSleeve', allShots).length, 7, 'La secuencia básica predeterminada debe derivar siete tomas')
equal(buildProfessionalShotSequence('frontLeftSleeve', withoutHero).length, 6, 'La secuencia básica no reaccionó al quitar Hero')
equal(buildProfessionalShotSequence('frontLeftSleeve', ['itemShowcase']).length, 4, 'La secuencia individual debe contener cuatro variantes')

const beatSync = { ...defaultBeatSyncSettings(), enabled: true, bpm: 120, barsPerChange: 1, offset: 0 }
equal(getProfessionalDuration(24, beatSync, allShots), 14, 'Beat Sync no deriva la duración desde siete tomas reales')
equal(getProfessionalDuration(24, beatSync, ['itemShowcase']), 8, 'Beat Sync no deriva la duración desde cuatro tomas reales')
const synced = applyBeatSyncToProject(createDirectorProject('cinematic', [], true, false, allShots, 'mixed'), beatSync)
equal(synced.duration, 18, 'El modo mixto no alineó una escena grupal y siete individuales al ritmo')
const syncedDirector = synced.tracks.find((track) => track.type === 'director')?.clips ?? []
for (const label of synced.tracks.filter((track) => track.type === 'label').flatMap((track) => track.clips)) {
  const scene = syncedDirector.find((clip) => clip.sceneId === label.sceneId)
  check(Boolean(scene) && scene!.start === label.start && scene!.duration === label.duration, 'Una etiqueta perdió sincronía con su escena')
}

const collectionItems = Array.from({ length: 12 }, (_, index) => ({
  id: `collection-${index + 1}`, name: `Diseño ${index + 1}`, asset: { name: 'principal.png' }, companionAsset: { name: 'companion.png' },
})) as CollectionItem[]
const collection = createCollectionProject(collectionItems.slice(0, 9), [], false, false, undefined, undefined, undefined, undefined, 'grouped', allShots)
equal(collection.presentationPlan?.groups.map((group) => group.length), [3, 3, 3], 'La colección de nueve diseños no usa 3 + 3 + 3')
equal(collection.tracks.find((track) => track.type === 'director')?.clips.map((clip) => clip.itemIds?.length), [3, 3, 3], 'Las escenas de colección no guardan sus IDs explícitos')
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

const sixtySecondProject = createDirectorProject('cinematic', [], false, false, allShots, 'mixed')
sixtySecondProject.duration = 60
const backgroundTrack = sixtySecondProject.tracks.find((track) => track.type === 'background')!
backgroundTrack.clips[0].duration = 60
const staleBackgroundTiming = { start: 0, duration: 8, enter: 'none' as const, exit: 'none' as const }
check(evaluateBackgroundFrame(sixtySecondProject, staleBackgroundTiming, 59.9).visible, 'El fondo dirigido desaparece por el timing antiguo antes del final')
check(!evaluateBackgroundFrame(null, staleBackgroundTiming, 59.9).visible, 'La prueba de regresión no detecta el timing antiguo')
check(evaluateDirectorFrame(sixtySecondProject, 59.9, 'editing').visible, 'El stage de edición oculta la prenda por un playhead sin clip')
check(!evaluateDirectorFrame(sixtySecondProject, 59.9, 'recording').visible, 'Recording debe respetar la ausencia real de una toma en timeline')

const sourceFiles = ['src/config/professionalRecording.ts', 'src/utils/presentationPlanner.ts']
const combinedSource = sourceFiles.map((file) => readFileSync(file, 'utf8')).join('\n')
check(!combinedSource.includes('PROFESSIONAL_CUE_COUNT'), 'Regresó el conteo fijo de cues profesionales')
check(!combinedSource.match(/batchIndex\s*\*\s*4/), 'Regresó la indexación fija por lotes de cuatro')

console.log(`Roadmap QA completado: ${assertions} verificaciones.`)
