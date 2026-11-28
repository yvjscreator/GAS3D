import { appApiRoot, appFetch, readAppSession } from '../auth/session'
import { loadGeminiApiKey } from './storage'
import type {
  AiLogResponse,
  GeminiVoiceCatalog,
  PresentationForm,
  PresentationScriptJob,
  SubtitleJob,
  VoiceStyleId,
} from './types'

const apiRoot = appApiRoot()
const apiBase = `${apiRoot}/api/subtitles`
const AI_SESSION_KEY = 'gas3d.ai.session.v1'
const VOICE_CATALOG_CACHE_KEY = 'gas3d.ai.voice-catalog.v1'
const VOICE_CATALOG_TTL_MS = 24 * 60 * 60 * 1000

export const geminiKeyOwner = () => readAppSession()?.user ?? 'local'

let inMemoryAiSession: string | undefined

export const getAiSessionId = () => {
  try {
    const existing = localStorage.getItem(AI_SESSION_KEY)
    if (existing) return existing
    const created = crypto.randomUUID()
    localStorage.setItem(AI_SESSION_KEY, created)
    return created
  } catch {
    return inMemoryAiSession ??= crypto.randomUUID()
  }
}

const aiHeaders = () => ({
  'X-AI-Session-ID': getAiSessionId(),
})

async function geminiHeaders(personalKey?: string | null, base = aiHeaders()) {
  // Project settings and status requests only use the session identifier.
  const key = personalKey === undefined ? await loadGeminiApiKey(geminiKeyOwner()).catch(() => null) : personalKey
  const headers = new Headers(base)
  if (key) headers.set('X-Gemini-API-Key', key)
  return headers
}

const readError = async (response: Response, fallback: string) => {
  const body = await response.json().catch(() => null) as { detail?: string } | null
  return body?.detail ?? fallback
}

const expectJson = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    throw new Error(await readError(response, `Error ${response.status}`))
  }
  return response.json() as Promise<T>
}

export async function createSubtitleJob(file: File, language: string, signal?: AbortSignal) {
  const body = new FormData()
  const timeout = AbortSignal.timeout(120_000)
  body.append('video', file)
  if (language !== 'auto') body.append('language', language)
  return expectJson<SubtitleJob>(await appFetch(`${apiBase}/jobs`, {
    method: 'POST',
    headers: await geminiHeaders(),
    redirect: 'error',
    body,
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  }))
}

export async function getSubtitleJob(jobId: string) {
  return expectJson<SubtitleJob>(await appFetch(`${apiBase}/jobs/${jobId}`, {
    headers: aiHeaders(), signal: AbortSignal.timeout(12_000),
  }))
}

export async function generatePresentationScript(
  file: File,
  form: PresentationForm,
  options: { phrases: string[]; signal: AbortSignal; onStage: (message: string) => void },
) {
  const { phrases, signal, onStage } = options
  const body = new FormData()
  body.append('video', file)
  body.append('presentation_type', form.presentationType)
  body.append('product', form.product)
  body.append('highlights', form.highlights)
  body.append('audience', form.audience)
  body.append('cta', form.cta)
  body.append('language', form.language)
  body.append('collection_items', form.collectionItems ?? '')
  body.append('phrases_json', JSON.stringify(phrases))

  const endpoint = `${apiBase}/presentation/script-jobs`
  const headers = aiHeaders()
  onStage('Subiendo video…')
  let job: PresentationScriptJob
  const uploadTimeout = AbortSignal.timeout(120_000)
  try {
    job = await expectJson<PresentationScriptJob>(await appFetch(endpoint, {
      method: 'POST', headers: await geminiHeaders(undefined, headers), redirect: 'error', body, signal: AbortSignal.any([signal, uploadTimeout]),
    }))
  } catch (error) {
    if (uploadTimeout.aborted) throw new Error('La subida del video tardó demasiado. Puedes reintentar con una copia más liviana.')
    throw error
  }

  const statusUrl = `${endpoint}/${encodeURIComponent(job.id)}`
  const deadline = performance.now() + 170_000
  try {
    while (job.status !== 'ready') {
      signal.throwIfAborted()
      if (job.status === 'error' || job.status === 'cancelled') throw new Error(job.error ?? job.message)
      if (performance.now() >= deadline) throw new Error(`Se agotó el tiempo. Última etapa: ${job.message}`)
      onStage(job.message)
      await new Promise((resolve) => window.setTimeout(resolve, 1200))
      job = await expectJson<PresentationScriptJob>(await appFetch(statusUrl, {
        headers, cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
      }))
    }
    if (!job.result) throw new Error('El análisis terminó sin devolver un guion.')
    return job.result
  } catch (error) {
    if (job.status !== 'error' && job.status !== 'cancelled' && job.status !== 'ready') {
      void appFetch(statusUrl, { method: 'DELETE', headers, signal: AbortSignal.timeout(8000) }).catch(() => undefined)
    }
    throw error
  }
}

export async function getPresentationVoices(forceRefresh = false) {
  const personalKey = await loadGeminiApiKey(geminiKeyOwner()).catch(() => null)
  if (personalKey) {
    return expectJson<GeminiVoiceCatalog>(await appFetch(`${apiBase}/presentation/voices`, {
      headers: await geminiHeaders(personalKey), redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(25_000),
    }))
  }
  let stale: GeminiVoiceCatalog | null = null

  try {
    const raw = localStorage.getItem(VOICE_CATALOG_CACHE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as {
        expiresAt?: number
        catalog?: GeminiVoiceCatalog
      }

      if (parsed.catalog?.voices?.length) {
        stale = parsed.catalog
        if (!forceRefresh && Number(parsed.expiresAt) > Date.now()) {
          return { ...parsed.catalog, cached: true }
        }
      }
    }
  } catch {
    // Ignore malformed/restricted browser storage.
  }

  try {
    const catalog = await expectJson<GeminiVoiceCatalog>(await appFetch(`${apiBase}/presentation/voices`, {
      headers: aiHeaders(), signal: AbortSignal.timeout(25_000),
    }))

    try {
      localStorage.setItem(VOICE_CATALOG_CACHE_KEY, JSON.stringify({
        expiresAt: Date.now() + VOICE_CATALOG_TTL_MS,
        catalog,
      }))
    } catch {
      // The server cache still protects the Gemini API if local storage is unavailable.
    }

    return catalog
  } catch (error) {
    if (stale) return { ...stale, cached: true }
    throw error
  }
}

export async function mixPresentationAudioFallback(
  originalAudio: Blob,
  generatedVoice: Blob,
  duration: number,
  originalAudioGain: number,
) {
  const body = new FormData()
  body.append('original_audio', new File([originalAudio], 'original.m4a', {
    type: originalAudio.type || 'audio/mp4',
  }))
  body.append('generated_voice', new File([generatedVoice], 'voice.wav', {
    type: generatedVoice.type || 'audio/wav',
  }))
  body.append('duration', String(duration))
  body.append('original_gain', String(originalAudioGain))

  const response = await appFetch(`${apiBase}/presentation/mix-audio`, {
    method: 'POST',
    headers: aiHeaders(),
    body,
  })

  if (!response.ok) {
    throw new Error(await readError(response, 'No se pudo mezclar el audio en el servidor.'))
  }

  return response.blob()
}

export async function generatePresentationVoice(
  script: string,
  voice: string,
  styleId: VoiceStyleId,
  language: string,
  signal?: AbortSignal,
) {
  const timeout = AbortSignal.timeout(105_000)
  const headers = await geminiHeaders()
  headers.set('Content-Type', 'application/json')
  const response = await appFetch(`${apiBase}/presentation/tts`, {
    method: 'POST',
    headers,
    redirect: 'error',
    body: JSON.stringify({ script, voice, styleId, language }),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })

  if (!response.ok) {
    throw new Error(await readError(response, 'No se pudo generar la voz.'))
  }

  return {
    blob: await response.blob(),
    model: response.headers.get('X-AI-Model'),
  }
}

export async function getAiLogs() {
  const sessionId = getAiSessionId()
  return expectJson<AiLogResponse>(await appFetch(`${apiBase}/ai/logs/${encodeURIComponent(sessionId)}`, {
    headers: aiHeaders(),
  }))
}

export async function clearAiLogs() {
  const sessionId = getAiSessionId()
  return expectJson<{ ok: boolean }>(await appFetch(`${apiBase}/ai/logs/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
    headers: aiHeaders(),
  }))
}
