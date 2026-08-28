import type { PresentationMode, PresentationPlan, PresentationScene } from '../types/studio'

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

export function buildPresentationPlan(itemIds: readonly string[], mode: PresentationMode): PresentationPlan {
  const orderedIds = [...itemIds]
  const groups = buildPresentationGroups(orderedIds)
  const groupScenes: PresentationScene[] = groups.map((group, index) => ({
    id: `group-${index + 1}`,
    kind: 'group',
    itemIds: group,
    order: index,
    rhythmicUnits: 2,
  }))
  const itemScenes: PresentationScene[] = orderedIds.map((itemId, index) => ({
    id: `item-${itemId}`,
    kind: 'item',
    itemIds: [itemId],
    order: index,
    rhythmicUnits: 1,
  }))
  const scenes = mode === 'grouped' ? groupScenes : mode === 'sequential' ? itemScenes : [...groupScenes, ...itemScenes]
  return { mode, itemIds: orderedIds, groups, scenes: scenes.map((scene, index) => ({ ...scene, order: index })) }
}

export function presentationSceneItems(plan: PresentationPlan | undefined, sceneId: string | undefined) {
  if (!plan || !sceneId) return []
  return plan.scenes.find((scene) => scene.id === sceneId)?.itemIds ?? []
}
