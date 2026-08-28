import { useState, type ReactNode } from 'react'
import type { StudioMode } from '../../types/studio'
import { Circle, Layers3, Pause, Play, Redo2, Settings2, Sparkles, Undo2 } from '../icons'
import { IconButton, Popover, SegmentedControl, ToolGroup } from '../ui'

type Props = {
  mode: StudioMode
  onModeChange: (mode: StudioMode) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  renderLayers: (close: () => void) => ReactNode
  layerCount: number
  playing: boolean
  recording: boolean
  previewDisabled: boolean
  recordDisabled: boolean
  onPreview: () => void
  onRecord: () => void
}

export function EditorHeader({ mode, onModeChange, canUndo, canRedo, onUndo, onRedo, renderLayers, layerCount, playing, recording, previewDisabled, recordDisabled, onPreview, onRecord }: Props) {
  const [layersOpen, setLayersOpen] = useState(false)
  return <header className="editor-header">
    <ToolGroup label="Modo del estudio" className="editor-mode-tools"><SegmentedControl compact label="Modo del estudio" value={mode} onChange={onModeChange} options={[{ value: 'basic', label: 'Básico', icon: Settings2 }, { value: 'advanced', label: 'Avanzado', icon: Sparkles }]} /></ToolGroup>
    <ToolGroup label="Edición" className="editor-history-tools">
      <IconButton icon={Undo2} label="Deshacer" shortcut="Ctrl + Z" disabled={!canUndo} onClick={onUndo} />
      <IconButton icon={Redo2} label="Rehacer" shortcut="Ctrl + Shift + Z" disabled={!canRedo} onClick={onRedo} />
      <Popover open={layersOpen} onOpenChange={setLayersOpen} align="center" className="layers-popover" trigger={({ open, toggle }) => <IconButton icon={Layers3} label={open ? 'Cerrar capas' : 'Abrir capas'} text={`Capas${layerCount ? ` ${layerCount}` : ''}`} aria-expanded={open} onClick={toggle} />}>{renderLayers(() => setLayersOpen(false))}</Popover>
    </ToolGroup>
    <ToolGroup label="Reproducción y grabación" className="editor-output-tools">
      <IconButton icon={playing ? Pause : Play} label={playing ? 'Pausar previsualización' : 'Previsualizar video'} text={playing ? 'Pausar' : 'Preview'} tone="primary" disabled={previewDisabled} onClick={onPreview} />
      <IconButton icon={Circle} label={recording ? 'Grabando video' : 'Grabar video'} text={recording ? 'Grabando' : 'Grabar'} tone="record" disabled={recordDisabled} onClick={onRecord} />
    </ToolGroup>
  </header>
}
