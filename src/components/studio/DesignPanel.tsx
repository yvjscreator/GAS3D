import { useStudioStore } from '../../store/studioStore'
import type { PrintAlignment, PrintPlacement } from '../../types/studio'
import { printSizePresetsCm, printZoneBaseSizesCm } from '../../config/printZoneSizes'
import { createCombinationPrints, hasVariantLibrary } from '../../config/garmentVariants'
import { Frame, Image, RotateCcw } from '../icons'

const placementLabels: Record<PrintPlacement, string> = { frontCenter: 'Frente', frontChest: 'Pecho', backCenter: 'Espalda', leftSleeve: 'Manga izq.', rightSleeve: 'Manga der.' }
const alignmentButtons: { value: PrintAlignment; label: string }[] = [
  { value: 'topLeft', label: 'Superior izquierda' }, { value: 'topCenter', label: 'Superior centro' }, { value: 'topRight', label: 'Superior derecha' },
  { value: 'middleLeft', label: 'Centro izquierda' }, { value: 'center', label: 'Centrar' }, { value: 'middleRight', label: 'Centro derecha' },
  { value: 'bottomLeft', label: 'Inferior izquierda' }, { value: 'bottomCenter', label: 'Inferior centro' }, { value: 'bottomRight', label: 'Inferior derecha' },
]

export function DesignPanel() {
  const studio = useStudioStore()
  const combination = studio.designCombinations.find((item) => item.id === studio.activeDesignCombinationId) ?? studio.designCombinations[0]
  const variantMode = hasVariantLibrary(studio.variantAssets) && Boolean(combination)
  const visiblePlacements = combination ? [combination.mainPlacement, combination.companionPlacement] : Object.keys(placementLabels) as PrintPlacement[]
  const configuredPrints = combination?.printSettings ?? studio.prints
  const configuredZones = combination?.zoneAdjustments ?? studio.printZoneAdjustments
  const assignedPrints = combination ? createCombinationPrints(combination, studio.variantAssets) : null
  const activePlacement = visiblePlacements.includes(studio.activePrintPlacement) ? studio.activePrintPlacement : visiblePlacements[0]
  const print = assignedPrints?.find((item) => item.placement === activePlacement) ?? configuredPrints[activePlacement]
  const zoneAdjustment = configuredZones[activePlacement]
  const updatePrint = (value: Partial<typeof print>) => combination ? studio.updateDesignCombination(combination.id, { printSettings: { ...combination.printSettings, [activePlacement]: { ...combination.printSettings[activePlacement], ...value } } }) : studio.setPrint(activePlacement, value)
  const updateZone = (value: Partial<typeof zoneAdjustment>) => combination ? studio.updateDesignCombination(combination.id, { zoneAdjustments: { ...combination.zoneAdjustments, [activePlacement]: { ...combination.zoneAdjustments[activePlacement], ...value } } }) : studio.setPrintZoneAdjustment(activePlacement, value)
  const resetZone = () => updateZone({ x: 0, y: 0, z: 0, width: 1, height: 1, rotation: null })
  const baseSizeCm = printZoneBaseSizesCm[activePlacement]
  const widthCm = zoneAdjustment.width * baseSizeCm.width; const heightCm = zoneAdjustment.height * baseSizeCm.height
  const zoneFactor = (valueCm: number, baseCm: number) => Math.min(1.8, Math.max(0.3, valueCm / baseCm))
  const selectPlacement = (placement: PrintPlacement) => { studio.setActivePrintPlacement(placement); studio.setTargetRotation(placement === 'backCenter' ? Math.PI : placement === 'leftSleeve' ? Math.PI / 2 : placement === 'rightSleeve' ? -Math.PI / 2 : 0) }
  const slider = (label: string, key: 'scale' | 'x' | 'y' | 'rotation' | 'integration', min: number, max: number, step = .01, wide = false) => <label className={wide ? 'range-row wide' : 'range-row'}>{label}<output>{key === 'scale' ? `${print[key].toFixed(2)}×` : key === 'integration' ? `${print[key]}%` : print[key].toFixed(1)}</output><input type="range" min={min} max={max} step={step} value={print[key]} onChange={(event) => updatePrint({ [key]: Number(event.target.value) })} /></label>
  if (!combination && variantMode) return null
  return <section className="panel design-combination-inspector"><h2>Ajustar combinación</h2>
    {combination && <div className="combination-selected"><span><strong>{combination.name}</strong><small>Principal y Companion comparten las artes, pero conservan ajustes propios.</small></span><label>Color de la prenda<input type="color" value={combination.garmentColor} onChange={(event) => studio.updateDesignCombination(combination.id, { garmentColor: event.target.value })} /></label></div>}
    <div className="print-zone-grid">{visiblePlacements.map((placement) => <button key={placement} className={activePlacement === placement ? 'print-zone active' : 'print-zone'} onClick={() => selectPlacement(placement)}><span>{placementLabels[placement]}{combination && <small>{placement === combination.mainPlacement ? 'Principal' : 'Companion'}</small>}</span><i className={activePlacement === placement ? 'selected' : ''} /></button>)}</div>
    <div className="zone-edit-actions"><button className={studio.editorMode === 'design' ? 'zone-edit active' : 'zone-edit'} onClick={() => studio.setEditorMode('design')}><Image size={14} /> Editar diseño</button><button className={studio.editorMode === 'zone' ? 'zone-edit active' : 'zone-edit'} onClick={() => studio.setEditorMode('zone')}><Frame size={14} /> Configurar zona</button>{studio.editorMode === 'zone' && <button className="text-button" onClick={resetZone}><RotateCcw size={12} /> Restablecer zona</button>}</div>
    {studio.editorMode === 'zone' && <><p className="drag-hint">Arrastra el área para moverla; mantén Shift para bloquear X o Y.</p><div className="cm-size-grid"><label>Ancho<input type="number" min={baseSizeCm.width * .3} max={baseSizeCm.width * 1.8} step=".5" value={Number(widthCm.toFixed(1))} onChange={(event) => updateZone({ width: zoneFactor(Number(event.target.value), baseSizeCm.width) })} /><span>cm</span></label><label>Alto<input type="number" min={baseSizeCm.height * .3} max={baseSizeCm.height * 1.8} step=".5" value={Number(heightCm.toFixed(1))} onChange={(event) => updateZone({ height: zoneFactor(Number(event.target.value), baseSizeCm.height) })} /><span>cm</span></label></div><div className="cm-presets">{printSizePresetsCm.map((preset) => <button key={preset.label} onClick={() => updateZone({ width: zoneFactor(preset.width, baseSizeCm.width), height: zoneFactor(preset.height, baseSizeCm.height) })}>{preset.label} cm</button>)}</div></>}
    {print.url ? <div className="upload-preview"><img src={print.url} alt="Arte asignado" /><div><strong>{print.name}</strong><span className="variant-source">Asignado desde Artes</span></div></div> : <p className="muted variant-unused">Carga Principal y Companion para editar esta combinación.</p>}
    {(studio.editorMode === 'zone' || print.url) && <div className="alignment-control"><span>{studio.editorMode === 'zone' ? 'Alinear zona sobre la prenda' : 'Alinear diseño dentro de la zona'}</span><div className="alignment-grid">{alignmentButtons.map((item) => <button key={item.value} title={item.label} aria-label={item.label} onClick={() => studio.alignPrint(activePlacement, item.value, studio.editorMode)}><i /></button>)}</div></div>}
    <div className="design-adjustment-grid">{slider('Tamaño', 'scale', .2, 2.5, .01, true)}{slider('Horizontal', 'x', -.8, .8)}{slider('Vertical', 'y', -.9, .9)}{slider('Rotación', 'rotation', -180, 180, 1)}{slider('Integración con tela', 'integration', 35, 100, 1)}</div>
    <button className="secondary small" onClick={() => updatePrint({ scale: 1, x: 0, y: 0, rotation: 0 })}><RotateCcw size={13} /> Restablecer posición</button>
  </section>
}
