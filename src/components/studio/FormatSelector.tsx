import { exportPresets, getExportResolution } from '../../config/exportPresets'
import { useStudioStore } from '../../store/studioStore'
import { Frame, Smartphone, Square } from '../icons'
import { ResponsiveOptionGrid } from '../ui'

const formatIcons = { reel: Smartphone, feed: Frame, square: Square }

export function FormatSelector() { const { format, setFormat, exportQuality } = useStudioStore(); return <section className="panel"><h2>Formato</h2><ResponsiveOptionGrid minWidth={120} className="format-list">{Object.entries(exportPresets).map(([id, preset]) => { const resolution = getExportResolution(id as typeof format, exportQuality); const Icon = formatIcons[id as keyof typeof formatIcons]; return <button key={id} className={format === id ? 'format selected' : 'format'} onClick={() => setFormat(id as typeof format)}><Icon size={18} /><span><strong>{preset.label}</strong><small>{resolution.width} × {resolution.height}</small></span></button> })}</ResponsiveOptionGrid></section> }
