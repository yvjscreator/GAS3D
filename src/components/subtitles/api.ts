import type { SubtitleExportOptions, SubtitleJob } from './types'

const apiBase = '/api/subtitles'

const expectJson = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null
    throw new Error(body?.detail ?? `Error ${response.status}`)
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

export async function exportSubtitleVideo(jobId: string, options: SubtitleExportOptions) {
  const response = await fetch(`${apiBase}/jobs/${jobId}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null
    throw new Error(body?.detail ?? 'No se pudo exportar el video.')
  }
  return response.blob()
}
