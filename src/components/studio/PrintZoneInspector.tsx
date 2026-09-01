import { printSizePresetsCm, printZoneBaseSizesCm } from '../../config/printZoneSizes'
import type { EditorMode, PrintAlignment, PrintPlacement, PrintSettings, PrintZoneAdjustment } from '../../types/studio'
import { Frame, Image, RotateCcw } from '../icons'

const alignmentButtons: { value: PrintAlignment; label: string }[] = [
  { value: 'topLeft', label: 'Superior izquierda' }, { value: 'topCenter', label: 'Superior centro' }, { value: 'topRight', label: 'Superior derecha' },
  { value: 'middleLeft', label: 'Centro izquierda' }, { value: 'center', label: 'Centrar' }, { value: 'middleRight', label: 'Centro derecha' },
  { value: 'bottomLeft', label: 'Inferior izquierda' }, { value: 'bottomCenter', label: 'Inferior centro' }, { value: 'bottomRight', label: 'Inferior derecha' },
]

type Props = {
  placement: PrintPlacement
  print: PrintSettings
  zoneAdjustment: PrintZoneAdjustment
  editorMode: EditorMode
  onEditorModeChange: (mode: EditorMode) => void
  onUpdatePrint: (value: Partial<PrintSettings>) => void
  onUpdateZone: (value: Partial<PrintZoneAdjustment>) => void
  onAlign: (alignment: PrintAlignment, target: EditorMode) => void
}

export function PrintZoneInspector({ placement, print, zoneAdjustment, editorMode, onEditorModeChange, onUpdatePrint, onUpdateZone, onAlign }: Props) {
  const baseSizeCm = printZoneBaseSizesCm[placement]
  const widthCm = zoneAdjustment.width * baseSizeCm.width
  const heightCm = zoneAdjustment.height * baseSizeCm.height
  const zoneFactor = (valueCm: number, baseCm: number) => Math.min(1.8, Math.max(0.3, valueCm / baseCm))
  const resetZone = () => onUpdateZone({ x: 0, y: 0, z: 0, width: 1, height: 1, rotation: null })
  const resetPrint = () => onUpdatePrint({ scale: 1, x: 0, y: 0, rotation: 0, integration: 78 })
  const sizeSlider = <label className="range-row wide">Tamaño<output>{print.scale.toFixed(2)}×</output><input type="range" min=".2" max="2.5" step=".01" value={print.scale} onChange={(event) => onUpdatePrint({ scale: Number(event.target.value) })} /></label>

  return <div className="print-zone-inspector">
    <div className="zone-edit-actions"><button className={editorMode === 'design' ? 'zone-edit active' : 'zone-edit'} onClick={() => onEditorModeChange('design')}><Image size={14} /> Mover diseño</button><button className={editorMode === 'zone' ? 'zone-edit active' : 'zone-edit'} onClick={() => onEditorModeChange('zone')}><Frame size={14} /> Configurar zona</button>{editorMode === 'zone' && <button className="text-button" onClick={resetZone}><RotateCcw size={12} /> Restablecer zona</button>}</div>
    {editorMode === 'zone' && <section className="zone-configuration-controls"><p className="drag-hint">Arrastra el área para moverla; mantén Shift para bloquear X o Y.</p><div className="cm-size-grid"><label>Ancho<input type="number" min={baseSizeCm.width * .3} max={baseSizeCm.width * 1.8} step=".5" value={Number(widthCm.toFixed(1))} onChange={(event) => onUpdateZone({ width: zoneFactor(Number(event.target.value), baseSizeCm.width) })} /><span>cm</span></label><label>Alto<input type="number" min={baseSizeCm.height * .3} max={baseSizeCm.height * 1.8} step=".5" value={Number(heightCm.toFixed(1))} onChange={(event) => onUpdateZone({ height: zoneFactor(Number(event.target.value), baseSizeCm.height) })} /><span>cm</span></label></div><div className="cm-presets">{printSizePresetsCm.map((preset) => <button key={preset.label} onClick={() => onUpdateZone({ width: zoneFactor(preset.width, baseSizeCm.width), height: zoneFactor(preset.height, baseSizeCm.height) })}>{preset.label} cm</button>)}</div></section>}
    {(editorMode === 'zone' || print.url) && <div className="alignment-control"><span>{editorMode === 'zone' ? 'Alinear zona sobre la prenda' : 'Alinear diseño dentro de la zona'}</span><div className="alignment-grid">{alignmentButtons.map((item) => <button key={item.value} title={item.label} aria-label={item.label} onClick={() => onAlign(item.value, editorMode)}><i /></button>)}</div></div>}
    <div className="design-adjustment-grid">{sizeSlider}</div>
    <button className="secondary small" onClick={resetPrint}><RotateCcw size={13} /> Restablecer diseño</button>
  </div>
}
