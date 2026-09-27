import type { SubtitleSavedSession } from './types'

const SESSION_KEY = 'gas3d.subtitle.session.v2'
const DB_NAME = 'gas3d-subtitle-studio'
const STORE_NAME = 'media'
const VIDEO_KEY = 'current-video'

export function saveSubtitleSession(session: SubtitleSavedSession) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // localStorage can be unavailable in private/restricted modes.
  }
}

export function loadSubtitleSession(): SubtitleSavedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SubtitleSavedSession
    return parsed?.version === 2 ? parsed : null
  } catch {
    return null
  }
}

export function clearSubtitleSession() {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // Ignore restricted storage environments.
  }
}

const openDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  if (!('indexedDB' in window)) {
    reject(new Error('IndexedDB no está disponible.'))
    return
  }
  const request = indexedDB.open(DB_NAME, 1)
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE_NAME)) {
      request.result.createObjectStore(STORE_NAME)
    }
  }
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error ?? new Error('No se pudo abrir IndexedDB.'))
})

export async function saveSubtitleVideo(file: File) {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(file, VIDEO_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('No se pudo guardar el video.'))
      tx.onabort = () => reject(tx.error ?? new Error('No se pudo guardar el video.'))
    })
  } finally {
    db.close()
  }
}

export async function loadSubtitleVideo(): Promise<File | null> {
  const db = await openDb()
  try {
    return await new Promise<File | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const request = tx.objectStore(STORE_NAME).get(VIDEO_KEY)
      request.onsuccess = () => {
        const value = request.result
        if (value instanceof File) {
          resolve(value)
          return
        }
        if (value instanceof Blob) {
          resolve(new File([value], 'video-restaurado.mp4', { type: value.type || 'video/mp4' }))
          return
        }
        resolve(null)
      }
      request.onerror = () => reject(request.error ?? new Error('No se pudo recuperar el video.'))
    })
  } finally {
    db.close()
  }
}

export async function clearSubtitleVideo() {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(VIDEO_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('No se pudo limpiar el video.'))
    })
  } finally {
    db.close()
  }
}
