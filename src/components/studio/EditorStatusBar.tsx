import type { RecordingStatus, StudioMode } from '../../types/studio'
import { StatusBar, StatusItem } from '../ui'

const timecode = (seconds: number) => {
  const safe = Math.max(0, seconds); const minutes = Math.floor(safe / 60); const remainder = safe - minutes * 60
  return `${String(minutes).padStart(2, '0')}:${remainder.toFixed(1).padStart(4, '0')}`
}

type Props = {
  mode: StudioMode
  campaign: string
  selection: string
  activity: string
  currentTime: number
  duration: number
  playing: boolean
  recordingStatus: RecordingStatus
  recordingMessage: string | null
  shot?: string | null
  output: string
}

export function EditorStatusBar({ mode, campaign, selection, activity, currentTime, duration, playing, recordingStatus, recordingMessage, shot, output }: Props) {
  const tone = recordingStatus === 'recording' ? 'recording' : recordingStatus === 'error' ? 'error' : playing ? 'playing' : recordingStatus === 'ready' ? 'ready' : 'neutral'
  const preparing = recordingStatus === 'recording' && Boolean(recordingMessage?.toLowerCase().includes('prepar'))
  const state = preparing ? 'Preparando' : recordingStatus === 'recording' ? 'Grabando' : recordingStatus === 'error' ? 'Error' : playing ? 'Reproduciendo' : recordingStatus === 'ready' ? 'Listo' : 'Preparado'
  const detail = recordingMessage ?? shot ?? activity
  return <StatusBar tone={tone} className="editor-status-bar">
    <StatusItem value={mode === 'advanced' ? 'Avanzado' : 'Básico'} strong />
    <StatusItem value={campaign} />
    <StatusItem value={selection} />
    <StatusItem value={detail} grow />
    <StatusItem value={`${timecode(currentTime)} / ${timecode(duration)}`} />
    <StatusItem value={state} strong />
    <StatusItem value={output} />
  </StatusBar>
}
