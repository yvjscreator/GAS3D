import { Settings2 } from '../icons'
import { ExportPanel } from './ExportPanel'
import { FormatSelector } from './FormatSelector'
import { RenderLabPanel } from './RenderLabPanel'

export function SettingsPanel({ onTaskChange }: { onTaskChange?: (message: string | null) => void }) {
  return <div className="settings-workspace">
    <header className="settings-heading"><Settings2 size={16} /><span><strong>Configuración</strong><small>Lienzo, salida y opciones técnicas persistentes.</small></span></header>
    <FormatSelector />
    <ExportPanel />
    <RenderLabPanel onTaskChange={onTaskChange} />
  </div>
}
