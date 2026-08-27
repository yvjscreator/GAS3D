import { useStudioStore } from '../../store/studioStore'
import type { PrintAlignment, PrintPlacement } from '../../types/studio'
import { printSizePresetsCm, printZoneBaseSizesCm } from '../../config/printZoneSizes'
import { createVariantPrints, garmentVariantPresets, getGarmentVariantPreset, hasVariantLibrary } from '../../config/garmentVariants'

const placementLabels: Record<PrintPlacement, string> = {
  frontCenter: 'Frente', frontChest: 'Pecho', backCenter: 'Espalda', leftSleeve: 'Manga izq.', rightSleeve: 'Manga der.',
}
const alignmentButtons: { value: PrintAlignment; label: string }[] = [
  { value: 'topLeft', label: 'Superior izquierda' }, { value: 'topCenter', label: 'Superior centro' }, { value: 'topRight', label: 'Superior derecha' },
  { value: 'middleLeft', label: 'Centro izquierda' }, { value: 'center', label: 'Centrar' }, { value: 'middleRight', label: 'Centro derecha' },
  { value: 'bottomLeft', label: 'Inferior izquierda' }, { value: 'bottomCenter', label: 'Inferior centro' }, { value: 'bottomRight', label: 'Inferior derecha' },
]

export function DesignPanel() {
  const { prints, activePrintPlacement, setActivePrintPlacement, setPrint, setTargetRotation, printZoneAdjustments, setPrintZoneAdjustment, resetPrintZoneAdjustment, variantPrintSettings, variantZoneAdjustments, setVariantPrint, setVariantZoneAdjustment, resetVariantZoneAdjustment, editorMode, setEditorMode, alignPrint, variantAssets, activeVariantId, setActiveVariantId } = useStudioStore()
  const variantMode = hasVariantLibrary(variantAssets)
  const activePreset = getGarmentVariantPreset(activeVariantId)
  const activeVariantNumber = garmentVariantPresets.findIndex((preset) => preset.id === activeVariantId) + 1
  const visiblePlacements = variantMode ? [activePreset.largePlacement, activePreset.smallPlacement] : Object.keys(placementLabels) as PrintPlacement[]
  const configuredPrints = variantMode ? variantPrintSettings[activeVariantId] : prints
  const configuredZones = variantMode ? variantZoneAdjustments[activeVariantId] : printZoneAdjustments
  const variantPrints = variantMode ? createVariantPrints(configuredPrints, variantAssets, activeVariantId) : null
  const print = variantPrints?.find((item) => item.placement === activePrintPlacement) ?? configuredPrints[activePrintPlacement]
  const zoneAdjustment = configuredZones[activePrintPlacement]
  const updatePrint = (value: Partial<typeof print>) => variantMode ? setVariantPrint(activeVariantId, activePrintPlacement, value) : setPrint(activePrintPlacement, value)
  const updateZone = (value: Partial<typeof zoneAdjustment>) => variantMode ? setVariantZoneAdjustment(activeVariantId, activePrintPlacement, value) : setPrintZoneAdjustment(activePrintPlacement, value)
  const resetZone = () => variantMode ? resetVariantZoneAdjustment(activeVariantId, activePrintPlacement) : resetPrintZoneAdjustment(activePrintPlacement)
  const baseSizeCm = printZoneBaseSizesCm[activePrintPlacement]
  const widthCm = zoneAdjustment.width * baseSizeCm.width
  const heightCm = zoneAdjustment.height * baseSizeCm.height
  const zoneFactor = (valueCm: number, baseCm: number) => Math.min(1.8, Math.max(0.3, valueCm / baseCm))
  const selectPlacement = (placement: PrintPlacement) => {
    setActivePrintPlacement(placement)
    setTargetRotation(placement === 'backCenter' ? Math.PI : placement === 'leftSleeve' ? Math.PI / 2 : placement === 'rightSleeve' ? -Math.PI / 2 : 0)
  }
  const selectVariant = (variant: typeof garmentVariantPresets[number]) => {
    setActiveVariantId(variant.id); selectPlacement(variant.largePlacement)
  }
  const slider = (label: string, key: 'scale' | 'x' | 'y' | 'rotation' | 'integration', min: number, max: number, step = 0.01) => <label className="range-row">{label}<output>{key === 'scale' ? `${print[key].toFixed(2)}×` : key === 'integration' ? `${print[key]}%` : print[key].toFixed(1)}</output><input type="range" min={min} max={max} step={step} value={print[key]} onChange={(e) => updatePrint({ [key]: Number(e.target.value) })} /></label>
  return <section className="panel"><h2>Diseño</h2>
    {variantMode && <><div className="adjust-variant-switcher"><span>Variantes</span>{garmentVariantPresets.map((variant, index) => <button key={variant.id} className={variant.id === activeVariantId ? 'active' : ''} title={variant.label} onClick={() => selectVariant(variant)}>{index + 1}</button>)}</div><p className="variant-config-note">Ajustando <b>[{activeVariantNumber}]</b><strong>{activePreset.label}</strong></p></>}
    <div className="print-zone-grid">{visiblePlacements.map((placement) => <button key={placement} className={activePrintPlacement === placement ? 'print-zone active' : 'print-zone'} onClick={() => selectPlacement(placement)}><span>{placementLabels[placement]}</span><i className={activePrintPlacement === placement ? 'selected' : ''} /></button>)}</div>
    <div className="zone-edit-actions"><button className={editorMode === 'design' ? 'zone-edit active' : 'zone-edit'} onClick={() => setEditorMode('design')}>Editar diseño</button><button className={editorMode === 'zone' ? 'zone-edit active' : 'zone-edit'} onClick={() => setEditorMode('zone')}>⌗ Configurar zona</button>{editorMode === 'zone' && <button className="text-button" onClick={resetZone}>Restablecer zona</button>}</div>
    {editorMode === 'zone' && <><p className="drag-hint">Arrastra el área para moverla; mantén Shift para bloquear X o Y. Usa sus esquinas para cambiar los límites.</p><div className="cm-size-grid"><label>Ancho<input type="number" min={baseSizeCm.width * 0.3} max={baseSizeCm.width * 1.8} step="0.5" value={Number(widthCm.toFixed(1))} onChange={(e) => updateZone({ width: zoneFactor(Number(e.target.value), baseSizeCm.width) })} /><span>cm</span></label><label>Alto<input type="number" min={baseSizeCm.height * 0.3} max={baseSizeCm.height * 1.8} step="0.5" value={Number(heightCm.toFixed(1))} onChange={(e) => updateZone({ height: zoneFactor(Number(e.target.value), baseSizeCm.height) })} /><span>cm</span></label></div><div className="cm-presets">{printSizePresetsCm.map((preset) => <button key={preset.label} onClick={() => updateZone({ width: zoneFactor(preset.width, baseSizeCm.width), height: zoneFactor(preset.height, baseSizeCm.height) })}>{preset.label} cm</button>)}</div><label className="range-row">Ancho de zona<output>{widthCm.toFixed(1)} cm</output><input type="range" min="0.3" max="1.8" step="0.01" value={zoneAdjustment.width} onChange={(e) => updateZone({ width: Number(e.target.value) })} /></label><label className="range-row">Alto de zona<output>{heightCm.toFixed(1)} cm</output><input type="range" min="0.3" max="1.8" step="0.01" value={zoneAdjustment.height} onChange={(e) => updateZone({ height: Number(e.target.value) })} /></label></>}
    {print.url ? <div className="upload-preview"><img src={print.url} alt="Arte asignado" /><div><strong>{print.name}</strong><span className="variant-source">Asignado desde Artes</span></div></div> : <p className="muted variant-unused">Esta zona no tiene un arte asignado. Gestiona los archivos desde “Variantes”.</p>}
    {(editorMode === 'zone' || print.url) && <div className="alignment-control"><span>{editorMode === 'zone' ? 'Alinear zona sobre la prenda' : 'Alinear diseño dentro de la zona'}</span><div className="alignment-grid">{alignmentButtons.map((item) => <button key={item.value} title={item.label} aria-label={item.label} onClick={() => alignPrint(activePrintPlacement, item.value, editorMode)}><i /></button>)}</div></div>}
    {print.url && <p className="drag-hint">Arrastra el diseño para moverlo. Usa los círculos de las esquinas para cambiar su tamaño.</p>}
    {slider('Tamaño', 'scale', 0.2, 2.5)}{slider('Horizontal', 'x', -0.8, 0.8)}{slider('Vertical', 'y', -0.9, 0.9)}{slider('Rotación', 'rotation', -180, 180, 1)}{slider('Integración con tela', 'integration', 35, 100, 1)}
    <button className="secondary small" onClick={() => updatePrint({ scale: 1, x: 0, y: 0, rotation: 0 })}>Restablecer posición</button>
  </section>
}
