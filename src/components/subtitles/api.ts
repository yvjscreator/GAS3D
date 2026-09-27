import type {
  PresentationForm,
  PresentationScript,
  SubtitleJob,
  VoiceStyleId,
} from './types'

const apiRoot = (import.meta.env.VITE_SUBTITLE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''
const apiBase = `${apiRoot}/api/subtitles`

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
  return expectJson<SubtitleJob>(await fetch(`${apiBase}/jobs`, { method: 'POST', body }))
}

export async function getSubtitleJob(jobId: string) {
  return expectJson<SubtitleJob>(await fetch(`${apiBase}/jobs/${jobId}`))
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
    body,
  }))
}

export async function generatePresentationVoice(
  script: string,
  voice: string,
  styleId: VoiceStyleId,
  language: string,
) {
  const response = await fetch(`${apiBase}/presentation/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script, voice, styleId, language }),
  })

  if (!response.ok) {
    throw new Error(await readError(response, 'No se pudo generar la voz.'))
  }

  return response.blob()
}
