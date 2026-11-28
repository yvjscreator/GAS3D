import { useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { clipSeconds } from './narration'
import type { NarrationBlock, NarrationClip } from './types'

type Properties = {
  blocks: NarrationBlock[]
  clips: Record<string, NarrationClip>
  duration: number
  time: number
  selectedId: string | null
  disabled: boolean
  conflicts: Set<string>
  onSelect: (id: string) => void
  onMove: (id: string, time: number) => void
  onSeek: (time: number) => void
  onEdit: () => void
}

export function NarrationTimeline({ blocks, clips, duration, time, selectedId, disabled, conflicts, onSelect, onMove, onSeek, onEdit }: Properties) {
  const track = useRef<HTMLDivElement>(null)
  const gesture = useRef<{ id: string; x: number; start: number; width: number; moved: boolean } | null>(null)
  const [draft, setDraft] = useState<{ id: string; start: number } | null>(null)
  const limit = (value: number) => Math.max(0, Math.min(duration, Math.round(value * 100) / 100))
  const startAt = (event: PointerEvent<HTMLButtonElement>, block: NarrationBlock) => {
    if (disabled || event.button !== 0 || !track.current) return
    gesture.current = { id: block.id, x: event.clientX, start: block.start, width: track.current.clientWidth, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
    onSelect(block.id)
  }
  const moveTo = (event: PointerEvent<HTMLButtonElement>) => {
    const active = gesture.current
    if (!active || active.width === 0) return
    const delta = event.clientX - active.x
    if (!active.moved && Math.abs(delta) < 4) return
    active.moved = true
    setDraft({ id: active.id, start: limit(active.start + delta * duration / active.width) })
  }
  const end = (event: PointerEvent<HTMLButtonElement>, cancelled = false) => {
    const active = gesture.current
    gesture.current = null
    setDraft(null)
    if (!active || cancelled) return
    if (active.moved && active.width > 0) {
      const start = limit(active.start + (event.clientX - active.x) * duration / active.width)
      onMove(active.id, start)
      onSeek(start)
    } else onSeek(active.start)
  }
  const selected = blocks.find((block) => block.id === selectedId)
  if (duration <= 0 || !blocks.length) return null

  return <section className="subtitle-narration-timeline" aria-label="Línea de tiempo de narración">
    <div className="subtitle-narration-timeline-header">
      <strong>Narración</strong>
      <span>{time.toFixed(2)} s / {duration.toFixed(2)} s</span>
    </div>
    <div className="subtitle-narration-track" ref={track}>
      {blocks.map((block, index) => {
        const start = draft?.id === block.id ? draft.start : block.start
        const length = clipSeconds(clips[block.id]) || Math.max(0.25, (block.sceneEnd ?? (start + 0.7)) - (block.sceneStart ?? start))
        const left = Math.min(100, start / duration * 100)
        return <button
          key={block.id}
          type="button"
          className={`subtitle-narration-clip${selectedId === block.id ? ' active' : ''}${conflicts.has(block.id) ? ' conflict' : ''}`}
          style={{ left: `${left}%`, width: `${Math.max(0, Math.min(100 - left, length / duration * 100))}%` }}
          aria-label={`Bloque ${index + 1}, ${block.label || block.text}, ${start.toFixed(2)} segundos`}
          aria-pressed={selectedId === block.id}
          title={`${block.label || block.text} · ${start.toFixed(2)} s`}
          onPointerDown={(event) => startAt(event, block)}
          onPointerMove={moveTo}
          onPointerUp={end}
          onPointerCancel={(event) => end(event, true)}
          onLostPointerCapture={(event) => end(event, true)}
          onClick={(event) => {
            if (event.detail === 0) { onSelect(block.id); onSeek(block.start) }
          }}
          onKeyDown={(event) => {
            if (disabled || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
            event.preventDefault()
            const next = limit(block.start + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 1 : 0.1))
            onSelect(block.id)
            onMove(block.id, next)
            onSeek(next)
          }}
        >{index + 1}. {block.label || block.text}</button>
      })}
      <i aria-hidden="true" className="subtitle-narration-playhead" style={{ left: `${Math.min(100, time / duration * 100)}%` }} />
    </div>
    {selected && <div className="subtitle-narration-selection">
      <label>Inicio (s)<input key={`${selected.id}:${selected.start}`} aria-label="Inicio del bloque en segundos" type="number" min="0" max={duration} step="0.01" defaultValue={selected.start.toFixed(2)} disabled={disabled} onBlur={(event) => {
        const next = event.currentTarget.valueAsNumber
        if (!Number.isFinite(next)) { event.currentTarget.value = selected.start.toFixed(2); return }
        const position = limit(next)
        if (position !== selected.start) { onMove(selected.id, position); onSeek(position) }
      }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} /></label>
      <button type="button" onClick={onEdit}>Editar frase</button>
    </div>}
  </section>
}
