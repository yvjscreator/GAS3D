import { useRef, useState } from 'react'
import { useStudioStore } from '../../store/studioStore'
import type { PrintPlacement } from '../../types/studio'
import { printSizePresetsCm, printZoneBaseSizesCm } from '../../config/printZoneSizes'
import { printMediaKey, removeMedia, storeMedia } from '../../utils/mediaStorage'

const placementLabels: Record<PrintPlacement, string> = {
  frontCenter: 'Frente', frontChest: 'Pecho', backCenter: 'Espalda', leftSleeve: 'Manga izq.', rightSleeve: 'Manga der.',
}

export function DesignPanel() {
  const input = useRef<HTMLInputElement>(null); const [error, setError] = useState<string | null>(null)
  const { prints, activePrintPlacement, setActivePrintPlacement, setPrint, resetPrint, setTargetRotation, printZoneAdjustments, setPrintZoneAdjustment, resetPrintZoneAdjustment, zoneEditMode, setZoneEditMode } = useStudioStore()
  const print = prints[activePrintPlacement]
  const zoneAdjustment = printZoneAdjustments[activePrintPlacement]
  const baseSizeCm = printZoneBaseSizesCm[activePrintPlacement]
  const widthCm = zoneAdjustment.width * baseSizeCm.width
  const heightCm = zoneAdjustment.height * baseSizeCm.height
  const selectPlacement = (placement: PrintPlacement) => {
    setActivePrintPlacement(placement)
    setTargetRotation(placement === 'backCenter' ? Math.PI : placement === 'leftSleeve' ? Math.PI / 2 : placement === 'rightSleeve' ? -Math.PI / 2 : 0)
  }
  const selectFile = (file?: File) => {
    if (!file) return
    if (!['image/png', 'image/webp'].includes(file.type)) { setError('Carga un PNG o WebP transparente.'); return }
    if (print.url) URL.revokeObjectURL(print.url)
    void storeMedia(printMediaKey(activePrintPlacement), file).catch(() => setError('No se pudo guardar el diseño para la próxima sesión.'))
    setPrint(activePrintPlacement, { url: URL.createObjectURL(file), name: file.name }); setError(null)
  }
  const slider = (label: string, key: 'scale' | 'x' | 'y' | 'rotation' | 'integration', min: number, max: number, step = 0.01) => <label className="range-row">{label}<output>{key === 'scale' ? `${print[key].toFixed(2)}×` : key === 'integration' ? `${print[key]}%` : print[key].toFixed(1)}</output><input type="range" min={min} max={max} step={step} value={print[key]} onChange={(e) => setPrint(activePrintPlacement, { [key]: Number(e.target.value) })} /></label>
  return <section className="panel"><h2>Diseño</h2>
    <input ref={input} hidden type="file" accept="image/png,image/webp" onChange={(e) => selectFile(e.target.files?.[0])} />
    <div className="print-zone-grid">{(Object.keys(placementLabels) as PrintPlacement[]).map((placement) => <button key={placement} className={activePrintPlacement === placement ? 'print-zone active' : 'print-zone'} onClick={() => selectPlacement(placement)}><span>{placementLabels[placement]}</span><i className={prints[placement].url ? 'loaded' : ''} /></button>)}</div>
    <p className="active-zone">Zona activa: <strong>{placementLabels[activePrintPlacement]}</strong></p>
    <div className="zone-edit-actions"><button className={zoneEditMode ? 'zone-edit active' : 'zone-edit'} onClick={() => setZoneEditMode(!zoneEditMode)}>⌗ Configurar zona</button>{zoneEditMode && <button className="text-button" onClick={() => resetPrintZoneAdjustment(activePrintPlacement)}>Restablecer zona</button>}</div>
    {zoneEditMode && <><p className="drag-hint">Arrastra el área para moverla y sus esquinas para cambiar sus límites.</p><div className="cm-size-grid"><label>Ancho<input type="number" min="4" max="60" step="0.5" value={Number(widthCm.toFixed(1))} onChange={(e) => setPrintZoneAdjustment(activePrintPlacement, { width: Number(e.target.value) / baseSizeCm.width })} /><span>cm</span></label><label>Alto<input type="number" min="4" max="70" step="0.5" value={Number(heightCm.toFixed(1))} onChange={(e) => setPrintZoneAdjustment(activePrintPlacement, { height: Number(e.target.value) / baseSizeCm.height })} /><span>cm</span></label></div><div className="cm-presets">{printSizePresetsCm.map((preset) => <button key={preset.label} onClick={() => setPrintZoneAdjustment(activePrintPlacement, { width: preset.width / baseSizeCm.width, height: preset.height / baseSizeCm.height })}>{preset.label} cm</button>)}</div><label className="range-row">Ancho de zona<output>{widthCm.toFixed(1)} cm</output><input type="range" min="0.3" max="1.8" step="0.01" value={zoneAdjustment.width} onChange={(e) => setPrintZoneAdjustment(activePrintPlacement, { width: Number(e.target.value) })} /></label><label className="range-row">Alto de zona<output>{heightCm.toFixed(1)} cm</output><input type="range" min="0.3" max="1.8" step="0.01" value={zoneAdjustment.height} onChange={(e) => setPrintZoneAdjustment(activePrintPlacement, { height: Number(e.target.value) })} /></label></>}
    {print.url ? <div className="upload-preview"><img src={print.url} alt="Diseño cargado" /><div><strong>{print.name}</strong><button className="text-button" onClick={() => { URL.revokeObjectURL(print.url!); void removeMedia(printMediaKey(activePrintPlacement)); resetPrint(activePrintPlacement) }}>Eliminar</button></div></div> : <button className="upload-button" onClick={() => input.current?.click()}>＋ Cargar diseño en {placementLabels[activePrintPlacement]}</button>}
    {print.url && <button className="secondary small" onClick={() => input.current?.click()}>Reemplazar diseño</button>}
    {error && <p className="error">{error}</p>}
    {print.url && <p className="drag-hint">Arrastra el diseño para moverlo. Usa los círculos de las esquinas para cambiar su tamaño.</p>}
    {slider('Tamaño', 'scale', 0.2, 2.5)}{slider('Horizontal', 'x', -0.8, 0.8)}{slider('Vertical', 'y', -0.9, 0.9)}{slider('Rotación', 'rotation', -180, 180, 1)}{slider('Integración con tela', 'integration', 35, 100, 1)}
    <button className="secondary small" onClick={() => setPrint(activePrintPlacement, { scale: 1, x: 0, y: 0, rotation: 0, integration: 78 })}>Restablecer posición</button>
  </section>
}
