import type { PresentationForm, SubtitleSavedSession, VoiceStyleId } from './types'

const SESSION_KEY = 'gas3d.subtitle.session.v4'
const LEGACY_SESSION_KEYS = ['gas3d.subtitle.session.v3', 'gas3d.subtitle.session.v2']
const DB_NAME = 'gas3d-subtitle-studio'
const STORE_NAME = 'media'
const VIDEO_KEY = 'current-video'
const GENERATED_AUDIO_KEY = 'generated-presentation-audio'

const defaultPresentationForm = (): PresentationForm => ({
  presentationType: 'influencer',
  product: '',
  highlights: '',
  audience: '',
  cta: '',
  language: 'es-LATAM',
})

export function saveSubtitleSession(session: SubtitleSavedSession) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // Storage can be unavailable in private/restricted modes.
  }
}

export function loadSubtitleSession(): SubtitleSavedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as SubtitleSavedSession
      if (parsed?.version === 4) return parsed
    }

    for (const key of LEGACY_SESSION_KEYS) {
      const legacyRaw = localStorage.getItem(key)
      if (!legacyRaw) continue
      const legacy = JSON.parse(legacyRaw) as Record<string, unknown>
      if (legacy?.version !== 2 && legacy?.version !== 3) continue

      const migrated: SubtitleSavedSession = {
        version: 4,
        language: typeof legacy.language === 'string' ? legacy.language : 'auto',
        job: (legacy.job ?? null) as SubtitleSavedSession['job'],
        wordOverrides: (legacy.wordOverrides ?? {}) as Record<number, string>,
        preset: (legacy.preset ?? 'viral') as SubtitleSavedSession['preset'],
        baseColor: typeof legacy.baseColor === 'string' ? legacy.baseColor : '#FFFFFF',
        activeColor: typeof legacy.activeColor === 'string' ? legacy.activeColor : '#FFE347',
        outlineColor: typeof legacy.outlineColor === 'string' ? legacy.outlineColor : '#000000',
        fontScale: typeof legacy.fontScale === 'number' ? legacy.fontScale : 6,
        position: (legacy.position ?? 'bottom') as SubtitleSavedSession['position'],
        maxWords: typeof legacy.maxWords === 'number' ? legacy.maxWords : 5,
        uppercase: Boolean(legacy.uppercase),
        fileName: typeof legacy.fileName === 'string' ? legacy.fileName : null,
        presentationForm: defaultPresentationForm(),
        presentationScript: null,
        presentationDraft: '',
        voice: 'Sulafat',
        voiceStyle: 'influencer' as VoiceStyleId,
        generatedVoiceReady: false,
        generatedVoiceSignature: '',
        videoMode: null,
      }

      saveSubtitleSession(migrated)
      for (const legacyKey of LEGACY_SESSION_KEYS) localStorage.removeItem(legacyKey)
      return migrated
    }

    return null
  } catch {
    return null
  }
}

export function clearSubtitleSession() {
  try {
    localStorage.removeItem(SESSION_KEY)
    for (const key of LEGACY_SESSION_KEYS) localStorage.removeItem(key)
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

const saveBlob = async (key: string, blob: Blob) => {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(blob, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('No se pudo guardar el archivo.'))
      tx.onabort = () => reject(tx.error ?? new Error('No se pudo guardar el archivo.'))
    })
  } finally {
    db.close()
  }
}

const loadBlob = async (key: string) => {
  const db = await openDb()
  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const request = tx.objectStore(STORE_NAME).get(key)
      request.onsuccess = () => {
        const value = request.result
        resolve(value instanceof Blob ? value : null)
      }
      request.onerror = () => reject(request.error ?? new Error('No se pudo recuperar el archivo.'))
    })
  } finally {
    db.close()
  }
}

const clearBlob = async (key: string) => {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('No se pudo limpiar el archivo.'))
    })
  } finally {
    db.close()
  }
}

export async function saveSubtitleVideo(file: File) {
  await saveBlob(VIDEO_KEY, file)
}

export async function loadSubtitleVideo(): Promise<File | null> {
  const value = await loadBlob(VIDEO_KEY)
  if (!value) return null
  if (value instanceof File) return value
  return new File([value], 'video-restaurado.mp4', { type: value.type || 'video/mp4' })
}

export async function clearSubtitleVideo() {
  await clearBlob(VIDEO_KEY)
}

export async function saveGeneratedPresentationAudio(blob: Blob) {
  await saveBlob(GENERATED_AUDIO_KEY, blob)
}

export async function loadGeneratedPresentationAudio() {
  return loadBlob(GENERATED_AUDIO_KEY)
}

export async function clearGeneratedPresentationAudio() {
  await clearBlob(GENERATED_AUDIO_KEY)
}
