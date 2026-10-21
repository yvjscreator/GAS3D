import { loadMedia, removeMedia, storeMedia } from '../../utils/mediaStorage'

export type CollageBackground = 'black' | 'white'
export type CollageItemMeta = { id: string; name: string; background: CollageBackground }
export type CollageManifest = { version: 1; items: CollageItemMeta[]; lastName: string | null }

const MANIFEST_KEY = 'gas3d.collage.manifest.v1'
const MEDIA_PREFIX = 'collage:item:'
const LAST_MEDIA_KEY = 'collage:last'

export const collageMediaKey = (id: string) => MEDIA_PREFIX + id

export function readCollageManifest(): CollageManifest {
  const empty: CollageManifest = { version: 1, items: [], lastName: null }
  try {
    const value = JSON.parse(localStorage.getItem(MANIFEST_KEY) ?? 'null') as Partial<CollageManifest> | null
    if (!value || value.version !== 1 || !Array.isArray(value.items)) return empty
    const seen = new Set<string>()
    const items = value.items.filter((item): item is CollageItemMeta => {
      if (!item || typeof item.id !== 'string' || typeof item.name !== 'string' || !item.id || seen.has(item.id)) return false
      seen.add(item.id)
      return true
    }).map((item) => ({ id: item.id, name: item.name, background: item.background === 'white' ? 'white' as const : 'black' as const }))
    return { version: 1, items, lastName: typeof value.lastName === 'string' ? value.lastName : null }
  } catch { return empty }
}

export function saveCollageManifest(items: CollageItemMeta[], lastName: string | null): boolean {
  try {
    localStorage.setItem(MANIFEST_KEY, JSON.stringify({ version: 1, items, lastName } satisfies CollageManifest))
    return true
  } catch { return false }
}

export const loadCollageImage = (id: string) => loadMedia(collageMediaKey(id))
export const storeCollageImage = (id: string, blob: Blob) => storeMedia(collageMediaKey(id), blob)
export const removeCollageImage = (id: string) => removeMedia(collageMediaKey(id))
export const storeLastCollageImage = (blob: Blob) => storeMedia(LAST_MEDIA_KEY, blob)
export const loadLastCollageImage = () => loadMedia(LAST_MEDIA_KEY)
