import type { DirectorShotKind, PresentationMode, PresentationPlan, PresentationScene } from '../types/studio'
import { defaultEnabledShotTypes, shotDefinition } from '../config/directorShots'

export const MAX_GROUP_SIZE = 4

/**
 * Divides an ordered set into the minimum number of groups of at most four,
 * distributing the remainder across the earliest groups. This deliberately
 * avoids orphan groups such as 4 + 4 + 1 when 3 + 3 + 3 is possible.
 */
export function buildPresentationGroups<T>(items: readonly T[], maxSize = MAX_GROUP_SIZE): T[][] {
  if (!items.length) return []
  const safeMax = Math.max(1, Math.floor(maxSize))
  const groupCount = Math.ceil(items.length / safeMax)
  const baseSize = Math.floor(items.length / groupCount)
  const largerGroups = items.length % groupCount
  const groups: T[][] = []
  let cursor = 0
  for (let index = 0; index < groupCount; index += 1) {
    const size = baseSize + (index < largerGroups ? 1 : 0)
    groups.push(items.slice(cursor, cursor + size) as T[])
    cursor += size
  }
  return groups
}

export function buildPresentationPlan(itemIds: readonly string[], mode: PresentationMode, enabledShotTypes: readonly DirectorShotKind[] = defaultEnabledShotTypes): PresentationPlan {
  const orderedIds = [...itemIds]
  const groups = buildPresentationGroups(orderedIds)
  const enabled = new Set(enabledShotTypes)
  const groupScenes: PresentationScene[] = groups.map((group, index) => ({
    id: `group-${index + 1}`,
    kind: 'groupShowcase',
    itemIds: group,
    order: index,
    rhythmicUnits: shotDefinition('groupShowcase').rhythmicUnits,
  } satisfies PresentationScene)).filter(() => enabled.has('groupShowcase'))
  const itemScenes: PresentationScene[] = orderedIds.flatMap((itemId) => {
    const candidates: DirectorShotKind[] = ['itemShowcase', 'hero', 'detailLarge', 'detailSmall']
    return candidates.filter((kind) => enabled.has(kind)).map((kind) => ({
      id: `${kind}-${itemId}`,
      kind,
      itemIds: [itemId],
      order: 0,
      rhythmicUnits: shotDefinition(kind).rhythmicUnits,
    } satisfies PresentationScene))
  })
  const scenes = mode === 'grouped' ? groupScenes : mode === 'sequential' ? itemScenes : [...groupScenes, ...itemScenes]
  return { mode, itemIds: orderedIds, groups, scenes: scenes.map((scene, index) => ({ ...scene, order: index })) }
}

export function presentationSceneItems(plan: PresentationPlan | undefined, sceneId: string | undefined) {
  if (!plan || !sceneId) return []
  return plan.scenes.find((scene) => scene.id === sceneId)?.itemIds ?? []
}
