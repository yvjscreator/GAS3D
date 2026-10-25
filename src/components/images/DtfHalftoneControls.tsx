import { useEffect, useRef } from 'react'
import { Check, Layers3, RotateCcw, Scan, ShieldCheck, Square, Waves } from 'lucide-react'
import { SelectableCard } from '../ui/primitives'
import { DEFAULT_ALPHA_SETTINGS, optimizeImageAlpha, type AlphaOptimizationSettings, type DtfPattern } from './alphaOptimization'

const patterns = [
  { id: 'stochastic', name: 'Orgánico', detail: 'Distribución irregular' },
  { id: 'dots', name: 'Puntos', detail: 'Puntos redondos' },
  { id: 'lines', name: 'Líneas', detail: 'Trazo continuo' },
  { id: 'ordered', name: 'Ordenado', detail: 'Retícula clásica' },
] satisfies { id: DtfPattern; name: string; detail: string }[]

const modes = [
  { id: 'halftone', name: 'Protegido', icon: ShieldCheck, detail: 'Trama las transparencias y refuerza los contornos de contraste.' },
  { id: 'aggressive', name: 'Completo', icon: Waves, detail: 'Trama todas las transparencias, sin reforzar los detalles.' },
  { id: 'solid', name: 'Sólido', icon: Square, detail: 'Convierte la transparencia con un umbral del 50%.' },
  { id: 'preserve', name: 'Conservar alfa', icon: Layers3, detail: 'Mantiene las semitransparencias para un RIP compatible.' },
] as const

function PatternSwatch({ pattern, pitch, angle }: { pattern: DtfPattern; pitch: number; angle: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const context = ref.current?.getContext('2d')
    if (!context) return
    const image = context.createImageData(240, 64)
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
      image.data.set([199, 234, 228, Math.round(35 + x / (image.width - 1) * 185)], (y * image.width + x) * 4)
    }
    optimizeImageAlpha(image, { method: 'dtf', dtfMode: 'aggressive', cleanupPercent: 0, cellPixels: pitch * 2, pattern, angle })
    context.putImageData(image, 0, 0)
  }, [pattern, pitch, angle])
  return <canvas ref={ref} width={240} height={64} aria-hidden="true" />
}

export function DtfHalftoneControls({ settings, disabled, canInspect, onInspect, onChange }: {
  settings: AlphaOptimizationSettings
  disabled: boolean
  canInspect: boolean
  onInspect: () => void
  onChange: (change: Partial<AlphaOptimizationSettings>) => void
}) {
  const pattern = settings.pattern ?? 'stochastic'
  const angle = settings.angle ?? 45
  const isHalftone = settings.dtfMode === 'halftone' || settings.dtfMode === 'aggressive'
  const mode = modes.find((option) => option.id === settings.dtfMode) ?? modes[0]
  return <div className="images-halftone-panel">
    <div className="images-halftone-heading">
      <strong>Acabado DTF</strong>
      <button type="button" className="images-halftone-reset" disabled={disabled}
        aria-label="Restablecer acabado DTF" title="Restablecer acabado DTF"
        onClick={() => onChange({ ...DEFAULT_ALPHA_SETTINGS, method: 'dtf' })}><RotateCcw size={15} /></button>
    </div>
    <div className="images-halftone-modes" role="group" aria-label="Tratamiento de transparencia DTF">
      {modes.map(({ id, name, icon: Icon }) => <SelectableCard key={id} selected={settings.dtfMode === id}
        disabled={disabled} onClick={() => onChange({ dtfMode: id })}><Icon size={16} /><span>{name}</span></SelectableCard>)}
    </div>
    <p className="images-halftone-mode-detail">{mode.detail}</p>
    {isHalftone && <>
      <div className="images-halftone-label"><strong>Textura</strong><span>Muestra ampliada</span></div>
      <div className="images-halftone-patterns" role="group" aria-label="Patrón de trama DTF">
        {patterns.map(({ id, name, detail }) => <SelectableCard key={id} selected={pattern === id} disabled={disabled}
          title={detail} onClick={() => onChange({ pattern: id })}>
          <PatternSwatch pattern={id} pitch={settings.cellPixels} angle={angle} />
          <span><strong>{name}</strong>{pattern === id && <Check size={14} aria-hidden="true" />}</span>
        </SelectableCard>)}
      </div>
      <div className="images-halftone-label"><strong>Escala de la trama</strong><span>{settings.cellPixels} px originales</span></div>
      <div className="images-halftone-segments" role="group" aria-label="Tamaño de punto de trama DTF">
        {([['Fina', 8], ['Media', 12], ['Gruesa', 16]] as const).map(([name, size]) => <button key={size} type="button"
          disabled={disabled} aria-pressed={settings.cellPixels === size} onClick={() => onChange({ cellPixels: size })}>{name}</button>)}
      </div>
      {(pattern === 'dots' || pattern === 'lines') && <label className="images-halftone-angle">
        <span>Ángulo</span>
        <input type="range" aria-label="Ángulo de trama" min={0} max={90} step={5} value={angle} disabled={disabled}
          onChange={(event) => onChange({ angle: Number(event.currentTarget.value) })} />
        <output>{angle}°</output>
      </label>}
      <div className="images-halftone-adjustments">
        {settings.dtfMode === 'halftone' && <label>
          <span>Proteger detalles <output>{settings.detailProtection ?? 85}%</output></span>
          <input type="range" min={0} max={100} step={5} value={settings.detailProtection ?? 85} disabled={disabled}
            onChange={(event) => onChange({ detailProtection: Number(event.currentTarget.value) })} />
        </label>}
        <label>
          <span>Limpiar restos <output>{settings.cleanupPercent}%</output></span>
          <input type="range" min={0} max={30} step={1} value={settings.cleanupPercent} disabled={disabled}
            onChange={(event) => onChange({ cleanupPercent: Number(event.currentTarget.value) })} />
        </label>
      </div>
      <button type="button" className="images-halftone-inspect" disabled={disabled || !canInspect} onClick={onInspect}>
        <Scan size={16} />Ver trama a tamaño real<span>1:1</span>
      </button>
      <details className="images-halftone-help">
        <summary>Cómo evaluar la trama</summary>
        <p>La vista general filtra los puntos pequeños. Usa 1:1 para revisar los píxeles originales.
          La escala indica la separación del patrón; en Orgánico, el tamaño de grano es menor.
          Los sólidos y sus colores se conservan. Valida el tamaño mínimo imprimible con tu taller.</p>
      </details>
    </>}
  </div>
}
