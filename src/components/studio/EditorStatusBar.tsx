import type { RecordingStatus } from '../../types/studio'
import { StatusBar, StatusItem } from '../ui'

const timecode = (seconds: number) => {
  const safe = Math.max(0, seconds); const minutes = Math.floor(safe / 60); const remainder = safe - minutes * 60
  return `${String(minutes).padStart(2, '0')}:${remainder.toFixed(1).padStart(4, '0')}`
}

type Props = {
  campaign: string
  selection: string
  activity: string
  currentTime: number
  duration: number
  playing: boolean
  recordingStatus: RecordingStatus
  recordingMessage: string | null
  preparedResources?: number
  totalResources?: number
  shot?: string | null
  output: string
}

export function EditorStatusBar({ campaign, selection, activity, currentTime, duration, playing, recordingStatus, recordingMessage, preparedResources = 0, totalResources = 0, shot, output }: Props) {
  const tone = recordingStatus === 'recording' || recordingStatus === 'finalizing' ? 'recording' : recordingStatus === 'error' ? 'error' : playing ? 'playing' : recordingStatus === 'ready' || recordingStatus === 'done' ? 'ready' : 'neutral'
  const state = recordingStatus === 'preparing' ? 'Preparando' : recordingStatus === 'preloading' ? 'Precargando' : recordingStatus === 'warming' ? 'Calentando GPU' : recordingStatus === 'finalizing' ? 'Finalizando' : recordingStatus === 'recording' ? 'Grabando' : recordingStatus === 'error' ? 'Error' : playing ? 'Reproduciendo' : recordingStatus === 'ready' ? 'Listo para grabar' : recordingStatus === 'done' ? 'Completado' : 'Preparado'
  const progress = totalResources > 0 && ['preparing', 'preloading', 'warming', 'ready'].includes(recordingStatus) ? ` · Recursos ${preparedResources}/${totalResources}` : ''
  const detail = `${recordingMessage ?? shot ?? activity}${progress}`
  return <StatusBar tone={tone} className="editor-status-bar">
    <StatusItem value="Director" strong />
    <StatusItem value={campaign} />
    <StatusItem value={selection} />
    <StatusItem value={detail} grow />
    <StatusItem value={`${timecode(currentTime)} / ${timecode(duration)}`} />
    <StatusItem value={state} strong />
    <StatusItem value={output} />
  </StatusBar>
}
