import { exportPresets } from '../../config/exportPresets'
import { useStudioStore } from '../../store/studioStore'
export function FormatSelector() { const { format, setFormat } = useStudioStore(); return <section className="panel"><h2>Formato</h2><div className="format-list">{Object.entries(exportPresets).map(([id, preset]) => <button key={id} className={format === id ? 'format selected' : 'format'} onClick={() => setFormat(id as typeof format)}><span>{preset.label}</span><small>{preset.width} × {preset.height}</small></button>)}</div></section> }
