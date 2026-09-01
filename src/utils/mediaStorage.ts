const DATABASE_NAME = 'garment-ad-studio-media'
const STORE_NAME = 'media'

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function storeValue(key: string, value: unknown) {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(value, key)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  database.close()
}

async function storeValues(values: [string, unknown][]) {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    values.forEach(([key, value]) => store.put(value, key))
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
  database.close()
}

export async function storeMedia(key: string, file: Blob) { await storeValue(key, file) }

export async function storeMediaMetadata(key: string, metadata: object) { await storeValue(metadataMediaKey(key), metadata) }

export async function loadMedia(key: string) {
  const database = await openDatabase()
  const result = await new Promise<Blob | null>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key)
    request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null)
    request.onerror = () => reject(request.error)
  })
  database.close()
  return result
}

export async function loadMediaMetadata<T extends object>(key: string) {
  const database = await openDatabase()
  const result = await new Promise<T | null>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(metadataMediaKey(key))
    request.onsuccess = () => resolve(request.result && typeof request.result === 'object' && !(request.result instanceof Blob) ? request.result as T : null)
    request.onerror = () => reject(request.error)
  })
  database.close()
  return result
}

export const renderMediaKey = (key: string) => `${key}:render`
export const thumbnailMediaKey = (key: string) => `${key}:thumb`
export const metadataMediaKey = (key: string) => `${key}:meta`
export const sourceMediaKey = (key: string) => `${key}:source`

export async function storePreparedMedia(key: string, renderBlob: Blob, thumbnailBlob: Blob, metadata: object, sourceBlob?: Blob) {
  const values: [string, unknown][] = [[renderMediaKey(key), renderBlob], [thumbnailMediaKey(key), thumbnailBlob], [metadataMediaKey(key), metadata]]
  if (sourceBlob) values.push([sourceMediaKey(key), sourceBlob])
  await storeValues(values)
  await removeMedia(key)
}

export async function loadSourceMedia(key: string) { return loadMedia(sourceMediaKey(key)) }

export async function loadPreparedMedia<T extends object>(key: string) {
  const [renderBlob, thumbnailBlob, metadata] = await Promise.all([
    loadMedia(renderMediaKey(key)), loadMedia(thumbnailMediaKey(key)), loadMediaMetadata<T>(key),
  ])
  if (renderBlob) return { renderBlob, thumbnailBlob, metadata }
  const legacy = await loadMedia(key)
  return legacy ? { renderBlob: legacy, thumbnailBlob: null, metadata: null } : null
}

export async function removeMedia(key: string) {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).delete(key)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  database.close()
}

export async function removePreparedMedia(key: string) {
  await Promise.all([removeMedia(key), removeMedia(renderMediaKey(key)), removeMedia(thumbnailMediaKey(key)), removeMedia(metadataMediaKey(key)), removeMedia(sourceMediaKey(key))])
}

export const printMediaKey = (placement: string) => `print:${placement}`
export const variantMediaKey = (role: string) => `variant:${role}`
export const collectionMediaKey = (id: string, role: 'main' | 'companion' = 'main') => role === 'main' ? `collection:${id}` : `collection:${id}:companion`
export const backgroundMediaKey = 'background'
export const overlayMediaKey = (id: string) => `overlay:${id}`
export const musicMediaKey = 'music'
export const createMediaRevisionKey = (baseKey: string) => `${baseKey}:revision:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`
