import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useStudioStore } from '../../store/studioStore'
import type { TimelineClip, TimelineTrack } from '../../types/studio'
import { ChevronDown, ChevronUp, Eye, EyeOff, Lock, Pause, Play, Scissors, SkipBack, Unlock, ZoomIn, ZoomOut } from '../icons'
import { beatTimes } from '../../utils/beatSync'

const LABEL_WIDTH = 168
const snap = (value: number, projectDuration: number, playhead: number, clips: TimelineClip[], beats: number[]) => {
  const targets = [0, projectDuration, playhead, ...beats, ...clips.flatMap((item) => [item.start, item.start + item.duration])]
  const tenth = Math.round(value * 10) / 10
  const target = targets.find((item) => Math.abs(item - value) <= .08)
  return Math.max(0, target ?? tenth)
}

type AdvancedTimelineProps = {
  playing: boolean
  onTogglePlay: () => void
  onSeek: (time: number) => void
  embedded?: boolean
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
}

export function AdvancedTimeline({ playing, onTogglePlay, onSeek, embedded = false, collapsed: controlledCollapsed, onCollapsedChange }: AdvancedTimelineProps) {
  const studio = useStudioStore(); const project = studio.advancedProjects[studio.activeDirectorId]
  const [internalCollapsed, setInternalCollapsed] = useState(false); const [height, setHeight] = useState(270)
  const collapsed = controlledCollapsed ?? internalCollapsed
  const scroll = useRef<HTMLDivElement>(null); const pixelsPerSecond = 46 * project.zoom; const timelineWidth = Math.max(760, project.duration * pixelsPerSecond + 80)
  const allClips = project.tracks.flatMap((track) => track.clips)
  const rhythmBeats = beatTimes(studio.beatSync, project.duration)
  const selected = project.tracks.flatMap((track) => track.clips.map((clip) => ({ track, clip }))).find((item) => item.clip.id === project.selectedClipId)
  const beginClipDrag = (event: ReactPointerEvent, track: TimelineTrack, item: TimelineClip, mode: 'move' | 'trimLeft' | 'trimRight' | 'fadeIn' | 'fadeOut') => {
    if (track.locked) return
    event.preventDefault(); event.stopPropagation(); studio.selectTimelineClip(item.id)
    const startX = event.clientX; const original = { ...item }
    const move = (moveEvent: PointerEvent) => {
      const delta = (moveEvent.clientX - startX) / pixelsPerSecond
      if (mode === 'move') studio.updateTimelineClip(track.id, item.id, { start: snap(original.start + delta, project.duration, project.playhead, allClips.filter((clip) => clip.id !== item.id), rhythmBeats) })
      if (mode === 'trimLeft') {
        const nextStart = Math.min(original.start + original.duration - .1, snap(original.start + delta, project.duration, project.playhead, allClips, rhythmBeats))
        const change = nextStart - original.start; studio.updateTimelineClip(track.id, item.id, { start: nextStart, duration: original.duration - change, sourceStart: original.sourceStart + change })
      }
      if (mode === 'trimRight') studio.updateTimelineClip(track.id, item.id, { duration: Math.max(.1, snap(original.start + original.duration + delta, project.duration, project.playhead, allClips, rhythmBeats) - original.start) })
      if (mode === 'fadeIn') studio.updateTimelineClip(track.id, item.id, { fadeIn: Math.max(0, Math.min(original.duration / 2, original.fadeIn + delta)) })
      if (mode === 'fadeOut') studio.updateTimelineClip(track.id, item.id, { fadeOut: Math.max(0, Math.min(original.duration / 2, original.fadeOut - delta)) })
    }
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop)
  }
  const seekFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!scroll.current) return
    const bounds = scroll.current.getBoundingClientRect(); const time = (event.clientX - bounds.left + scroll.current.scrollLeft - LABEL_WIDTH) / pixelsPerSecond
    onSeek(Math.min(project.duration, Math.max(0, Math.round(time * 10) / 10)))
  }
  const resizeDock = (event: ReactPointerEvent) => {
    event.preventDefault(); const startY = event.clientY; const startHeight = height
    const move = (moveEvent: PointerEvent) => setHeight(Math.min(520, Math.max(185, startHeight + startY - moveEvent.clientY)))
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop)
  }
  const toggleCollapsed = () => {
    const next = !collapsed
    if (onCollapsedChange) onCollapsedChange(next)
    else setInternalCollapsed(next)
  }
  return <section className={`advanced-timeline${embedded ? ' embedded' : ''}${collapsed ? ' collapsed' : ''}`} style={embedded ? undefined : { height: collapsed ? 42 : height }}>
    {!embedded && !collapsed && <button className="timeline-resizer" onPointerDown={resizeDock} aria-label="Redimensionar línea de tiempo" />}
    <div className="timeline-toolbar">
      <button onClick={toggleCollapsed} aria-label={collapsed ? 'Abrir timeline' : 'Contraer timeline'} title={`${collapsed ? 'Abrir' : 'Contraer'} timeline · T`}>{collapsed ? <><ChevronUp size={13} /> Timeline</> : <ChevronDown size={13} />}</button>
      <button onClick={() => onSeek(0)} aria-label="Volver al inicio"><SkipBack size={14} /></button>
      <button className="timeline-play" onClick={onTogglePlay} aria-label={playing ? 'Pausar' : 'Reproducir'}>{playing ? <Pause size={14} /> : <Play size={14} />}</button>
      <strong>{project.playhead.toFixed(1)}s <span>/ {project.duration.toFixed(1)}s</span></strong>
      <div className="timeline-spacer" />
      {selected && <button onClick={() => studio.splitTimelineClip(selected.track.id, selected.clip.id, project.playhead)} title="Dividir en el playhead"><Scissors size={14} /> Dividir</button>}
      <button onClick={() => studio.setAdvancedZoom(project.zoom - .25)} aria-label="Alejar timeline"><ZoomOut size={14} /></button><output>{Math.round(project.zoom * 100)}%</output><button onClick={() => studio.setAdvancedZoom(project.zoom + .25)} aria-label="Acercar timeline"><ZoomIn size={14} /></button>
    </div>
    {!collapsed && <div ref={scroll} className="timeline-scroll">
      <div className="timeline-content" style={{ width: LABEL_WIDTH + timelineWidth }}>
        <div className="timeline-ruler-label">PISTAS</div><div className="timeline-ruler" style={{ width: timelineWidth }} onPointerDown={seekFromPointer}>{Array.from({ length: Math.ceil(project.duration) + 1 }, (_, second) => <i key={second} style={{ left: second * pixelsPerSecond }}><span>{second}s</span></i>)}{rhythmBeats.map((beat, index) => <b key={`beat-${beat}`} className={index % 4 === 0 ? 'timeline-beat downbeat' : 'timeline-beat'} style={{ left: beat * pixelsPerSecond }} />)}</div>
        {project.tracks.map((track) => <div key={track.id} className={track.hidden ? 'timeline-track hidden' : 'timeline-track'}>
          <div className="timeline-track-label"><span><strong>{track.name}</strong><small>{track.type}</small></span><button onClick={() => studio.moveTimelineTrack(track.id, -1)} aria-label="Subir pista"><ChevronUp size={12} /></button><button onClick={() => studio.moveTimelineTrack(track.id, 1)} aria-label="Bajar pista"><ChevronDown size={12} /></button><button onClick={() => studio.toggleTimelineTrack(track.id, 'hidden')} aria-label={track.hidden ? 'Mostrar pista' : 'Ocultar pista'}>{track.hidden ? <EyeOff size={12} /> : <Eye size={12} />}</button><button onClick={() => studio.toggleTimelineTrack(track.id, 'locked')} aria-label={track.locked ? 'Desbloquear pista' : 'Bloquear pista'}>{track.locked ? <Lock size={12} /> : <Unlock size={12} />}</button></div>
          <div className="timeline-lane" style={{ width: timelineWidth }} onPointerDown={seekFromPointer}>{track.clips.map((item) => <div key={item.id} className={project.selectedClipId === item.id ? `timeline-clip selected ${item.type}` : `timeline-clip ${item.type}`} style={{ left: item.start * pixelsPerSecond, width: Math.max(8, item.duration * pixelsPerSecond) }} onPointerDown={(event) => beginClipDrag(event, track, item, 'move')} title={`${item.name} · ${item.duration.toFixed(1)}s`}>
            {!track.locked && <><button className="clip-trim left" onPointerDown={(event) => beginClipDrag(event, track, item, 'trimLeft')} /><button className="clip-trim right" onPointerDown={(event) => beginClipDrag(event, track, item, 'trimRight')} /><button className="clip-fade left" style={{ left: item.fadeIn * pixelsPerSecond }} onPointerDown={(event) => beginClipDrag(event, track, item, 'fadeIn')} /><button className="clip-fade right" style={{ right: item.fadeOut * pixelsPerSecond }} onPointerDown={(event) => beginClipDrag(event, track, item, 'fadeOut')} /></>}
            <span>{item.name}</span><small>{item.duration.toFixed(1)}s</small>
          </div>)}</div>
        </div>)}
        <div className="timeline-playhead" style={{ left: LABEL_WIDTH + project.playhead * pixelsPerSecond }}><i /></div>
      </div>
    </div>}
  </section>
}
