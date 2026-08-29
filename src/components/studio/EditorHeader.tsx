import { useState, type ReactNode } from 'react'
import { Circle, Layers3, Pause, Play, Redo2, Settings2, Undo2 } from '../icons'
import { IconButton, Popover, ToolGroup } from '../ui'

type Props = {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  renderLayers: (close: () => void) => ReactNode
  renderSettings: (close: () => void) => ReactNode
  layerCount: number
  playing: boolean
  recording: boolean
  previewDisabled: boolean
  recordDisabled: boolean
  onPreview: () => void
  onRecord: () => void
}

export function EditorHeader({ canUndo, canRedo, onUndo, onRedo, renderLayers, renderSettings, layerCount, playing, recording, previewDisabled, recordDisabled, onPreview, onRecord }: Props) {
  const [layersOpen, setLayersOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  return <header className="editor-header">
    <ToolGroup label="Edición" className="editor-history-tools">
      <IconButton icon={Undo2} label="Deshacer" shortcut="Ctrl + Z" disabled={!canUndo} onClick={onUndo} />
      <IconButton icon={Redo2} label="Rehacer" shortcut="Ctrl + Shift + Z" disabled={!canRedo} onClick={onRedo} />
      <Popover open={layersOpen} onOpenChange={setLayersOpen} align="center" className="layers-popover" trigger={({ open, toggle }) => <IconButton icon={Layers3} label={open ? 'Cerrar capas' : 'Abrir capas'} text={`Capas${layerCount ? ` ${layerCount}` : ''}`} aria-expanded={open} onClick={toggle} />}>{renderLayers(() => setLayersOpen(false))}</Popover>
      <Popover open={settingsOpen} onOpenChange={setSettingsOpen} align="center" className="settings-popover" trigger={({ open, toggle }) => <IconButton icon={Settings2} label={open ? 'Cerrar configuración' : 'Abrir configuración'} text="Configuración" aria-expanded={open} onClick={toggle} />}>{renderSettings(() => setSettingsOpen(false))}</Popover>
    </ToolGroup>
    <ToolGroup label="Reproducción y grabación" className="editor-output-tools">
      <IconButton icon={playing ? Pause : Play} label={playing ? 'Pausar previsualización' : 'Previsualizar video'} text={playing ? 'Pausar' : 'Preview'} tone="primary" disabled={previewDisabled} onClick={onPreview} />
      <IconButton icon={Circle} label={recording ? 'Grabando video' : 'Grabar video'} text={recording ? 'Grabando' : 'Grabar'} tone="record" disabled={recordDisabled} onClick={onRecord} />
    </ToolGroup>
  </header>
}
