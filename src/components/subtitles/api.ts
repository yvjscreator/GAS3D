import type {
  AiLogResponse,
  GeminiVoiceCatalog,
  PresentationForm,
  PresentationScript,
  SubtitleJob,
  VoiceStyleId,
} from './types'

const apiRoot = (import.meta.env.VITE_SUBTITLE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''
const apiBase = `${apiRoot}/api/subtitles`
const AI_SESSION_KEY = 'gas3d.ai.session.v1'
const VOICE_CATALOG_CACHE_KEY = 'gas3d.ai.voice-catalog.v1'
const VOICE_CATALOG_TTL_MS = 24 * 60 * 60 * 1000

export const getAiSessionId = () => {
  try {
    const existing = localStorage.getItem(AI_SESSION_KEY)
    if (existing) return existing
    const created = crypto.randomUUID()
    localStorage.setItem(AI_SESSION_KEY, created)
    return created
  } catch {
    return crypto.randomUUID()
  }
}

const aiHeaders = () => ({
  'X-AI-Session-ID': getAiSessionId(),
})

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

export async function createSubtitleJob(file: File, language: string) {
  const body = new FormData()
  body.append('video', file)
  if (language !== 'auto') body.append('language', language)
  return expectJson<SubtitleJob>(await fetch(`${apiBase}/jobs`, {
    method: 'POST',
    headers: aiHeaders(),
    body,
  }))
}

export async function getSubtitleJob(jobId: string) {
  return expectJson<SubtitleJob>(await fetch(`${apiBase}/jobs/${jobId}`, {
    headers: aiHeaders(),
  }))
}

export async function generatePresentationScript(file: File, form: PresentationForm) {
  const body = new FormData()
  body.append('video', file)
  body.append('presentation_type', form.presentationType)
  body.append('product', form.product)
  body.append('highlights', form.highlights)
  body.append('audience', form.audience)
  body.append('cta', form.cta)
  body.append('language', form.language)

  return expectJson<PresentationScript>(await fetch(`${apiBase}/presentation/script`, {
    method: 'POST',
    headers: aiHeaders(),
    body,
  }))
}

export async function getPresentationVoices(forceRefresh = false) {
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
    const catalog = await expectJson<GeminiVoiceCatalog>(await fetch(`${apiBase}/presentation/voices`, {
      headers: aiHeaders(),
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
) {
  const body = new FormData()
  body.append('original_audio', new File([originalAudio], 'original.m4a', {
    type: originalAudio.type || 'audio/mp4',
  }))
  body.append('generated_voice', new File([generatedVoice], 'voice.wav', {
    type: generatedVoice.type || 'audio/wav',
  }))
  body.append('duration', String(duration))

  const response = await fetch(`${apiBase}/presentation/mix-audio`, {
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
) {
  const response = await fetch(`${apiBase}/presentation/tts`, {
    method: 'POST',
    headers: {
      ...aiHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ script, voice, styleId, language }),
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
  return expectJson<AiLogResponse>(await fetch(`${apiBase}/ai/logs/${encodeURIComponent(sessionId)}`, {
    headers: aiHeaders(),
  }))
}

export async function clearAiLogs() {
  const sessionId = getAiSessionId()
  return expectJson<{ ok: boolean }>(await fetch(`${apiBase}/ai/logs/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
    headers: aiHeaders(),
  }))
}
