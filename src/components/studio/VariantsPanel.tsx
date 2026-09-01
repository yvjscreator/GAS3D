import { useRef, useState } from 'react'
import { createDefaultCamera, createDefaultLabel } from '../../config/advancedDirectors'
import { useStudioStore } from '../../store/studioStore'
import { printPlacements, type DesignAssetRole, type DesignCombination, type PrintPlacement, type VariantAssetRole } from '../../types/studio'
import { createMediaRevisionKey, storePreparedMedia, variantMediaKey } from '../../utils/mediaStorage'
import { prepareVideoAsset } from '../../utils/mediaProcessor'
import { Check, ChevronDown, ChevronUp, Copy, ImagePlus, Plus, Trash2 } from '../icons'
import { IconButton, MasterDetailLayout } from '../ui'
import { PrintZoneInspector } from './PrintZoneInspector'

const placementLabels: Record<PrintPlacement, string> = { frontCenter: 'Frente', backCenter: 'Espalda', frontChest: 'Pecho', leftSleeve: 'Manga izquierda', rightSleeve: 'Manga derecha' }
const placementRotation: Record<PrintPlacement, number> = { frontCenter: 0, frontChest: 0, backCenter: Math.PI, leftSleeve: Math.PI / 2, rightSleeve: -Math.PI / 2 }
const emptyPrints = () => Object.fromEntries(printPlacements.map((placement) => [placement, { url: null, name: null, scale: 1, x: 0, y: 0, rotation: 0, integration: 78, placement }])) as DesignCombination['printSettings']
const emptyZones = () => Object.fromEntries(printPlacements.map((placement) => [placement, { x: 0, y: 0, z: 0, width: 1, height: 1, rotation: null }])) as DesignCombination['zoneAdjustments']
const newId = () => globalThis.crypto?.randomUUID?.() ?? `combination-${Date.now()}-${Math.random().toString(16).slice(2)}`

export function VariantsPanel() {
  const input = useRef<HTMLInputElement>(null); const pairInput = useRef<HTMLInputElement>(null); const pendingRole = useRef<VariantAssetRole>('large')
  const [error, setError] = useState<string | null>(null)
  const studio = useStudioStore()
  const active = studio.designCombinations.find((item) => item.id === studio.activeDesignCombinationId) ?? studio.designCombinations[0] ?? null
  const selectedRole: DesignAssetRole = active && studio.activePrintPlacement === active.companionPlacement ? 'companion' : 'main'
  const selectedAssetRole: VariantAssetRole = selectedRole === 'main' ? 'large' : 'small'
  const selectedPlacement = active ? selectedRole === 'main' ? active.mainPlacement : active.companionPlacement : studio.activePrintPlacement
  const selectedAsset = studio.variantAssets[selectedAssetRole]
  const selectedPrint = active ? active.printSettings[selectedPlacement] : null
  const selectedZone = active ? active.zoneAdjustments[selectedPlacement] : null
  const ready = Boolean(studio.variantAssets.large.name && studio.variantAssets.small.name)

  const selectRole = (role: VariantAssetRole) => {
    if (!active) return
    const placement = role === 'large' ? active.mainPlacement : active.companionPlacement
    studio.setActivePrintPlacement(placement); studio.setTargetRotation(placementRotation[placement])
  }
  const selectCombination = (combination: DesignCombination) => {
    studio.setActiveDesignCombinationId(combination.id)
    const placement = combination.focusRole === 'main' ? combination.mainPlacement : combination.companionPlacement
    studio.setTargetRotation(placementRotation[placement])
  }
  const storeAsset = async (role: VariantAssetRole, file: File) => {
    const prepared = await prepareVideoAsset(file, { profile: studio.assetQualityProfile, alphaMode: studio.alphaPipelineMode })
    const storageKey = createMediaRevisionKey(variantMediaKey(role))
    await storePreparedMedia(storageKey, prepared.renderBlob, prepared.thumbnailBlob, prepared.metadata, file)
    studio.setVariantAsset(role, { url: URL.createObjectURL(prepared.renderBlob), thumbnailUrl: URL.createObjectURL(prepared.thumbnailBlob), storageKey, name: file.name, width: prepared.metadata.proxyWidth, height: prepared.metadata.proxyHeight, originalWidth: prepared.metadata.originalWidth, originalHeight: prepared.metadata.originalHeight, originalBytes: prepared.metadata.originalBytes, renderBytes: prepared.metadata.renderBytes, profile: prepared.metadata.profile })
  }
  const chooseOne = async (role: VariantAssetRole, file?: File) => {
    if (!file) return
    if (!['image/png', 'image/webp'].includes(file.type)) { setError('La imagen debe ser PNG o WebP.'); return }
    try { await storeAsset(role, file); selectRole(role); setError(null) } catch { setError('No se pudo procesar la imagen.') }
  }
  const choosePair = async (files?: FileList | null) => {
    if (!files || files.length !== 2) { setError('Selecciona exactamente dos imágenes: primero Principal y luego Companion.'); return }
    const [main, companion] = Array.from(files)
    if ([main, companion].some((file) => !['image/png', 'image/webp'].includes(file.type))) { setError('Ambas imágenes deben ser PNG o WebP.'); return }
    try { await storeAsset('large', main); await storeAsset('small', companion); selectRole('large'); setError(null) } catch { setError('No se pudieron procesar las imágenes.') }
  }
  const clear = () => (['large', 'small'] as VariantAssetRole[]).forEach((role) => {
    studio.setVariantAsset(role, { url: null, thumbnailUrl: null, storageKey: undefined, name: null, width: 0, height: 0 })
  })
  const addCombination = () => {
    const mainPlacement: PrintPlacement = 'frontCenter'; const companionPlacement: PrintPlacement = 'backCenter'
    const name = `Variante ${studio.designCombinations.length + 1}`
    studio.addDesignCombination({ id: newId(), name, enabled: true, order: studio.designCombinations.length, mainPlacement, companionPlacement, focusRole: 'main', garmentColor: studio.garmentColor, printSettings: emptyPrints(), zoneAdjustments: emptyZones(), camera: createDefaultCamera(), label: createDefaultLabel(name) })
    studio.setActivePrintPlacement(mainPlacement); studio.setTargetRotation(placementRotation[mainPlacement]); setError(null)
  }
  const updateName = (name: string) => {
    if (!active) return
    studio.updateDesignCombination(active.id, { name, label: active.label.text === active.name ? { ...active.label, text: name } : active.label })
  }
  const updatePlacement = (role: DesignAssetRole, placement: PrintPlacement) => {
    if (!active) return
    const previousPlacement = role === 'main' ? active.mainPlacement : active.companionPlacement
    const occupied = role === 'main' ? active.companionPlacement : active.mainPlacement
    if (placement === occupied) { setError('Principal y Companion deben usar ubicaciones diferentes.'); return }
    const printSettings = { ...active.printSettings, [placement]: { ...active.printSettings[previousPlacement], placement } }
    const zoneAdjustments = { ...active.zoneAdjustments, [placement]: { ...active.zoneAdjustments[previousPlacement] } }
    studio.updateDesignCombination(active.id, role === 'main' ? { mainPlacement: placement, printSettings, zoneAdjustments } : { companionPlacement: placement, printSettings, zoneAdjustments })
    studio.setActivePrintPlacement(placement); studio.setTargetRotation(placementRotation[placement]); setError(null)
  }
  const updatePrint = (value: Partial<NonNullable<typeof selectedPrint>>) => {
    if (!active || !selectedPrint) return
    studio.updateDesignCombination(active.id, { printSettings: { ...active.printSettings, [selectedPlacement]: { ...selectedPrint, ...value, placement: selectedPlacement } } })
  }
  const updateZone = (value: Partial<NonNullable<typeof selectedZone>>) => {
    if (!active || !selectedZone) return
    studio.updateDesignCombination(active.id, { zoneAdjustments: { ...active.zoneAdjustments, [selectedPlacement]: { ...selectedZone, ...value } } })
  }

  return <section className="panel variants-panel"><h2>Diseño único</h2>
    <input ref={input} hidden type="file" accept="image/png,image/webp" onChange={(event) => { void chooseOne(pendingRole.current, event.target.files?.[0]); event.target.value = '' }} /><input ref={pairInput} hidden multiple type="file" accept="image/png,image/webp" onChange={(event) => { void choosePair(event.target.files); event.target.value = '' }} />
    <MasterDetailLayout className="single-design-workspace" master={<div className="single-design-master">
      <div className="collection-pane-title"><span>Artes y variantes</span><b>{studio.designCombinations.length}</b></div>
      <p className="muted single-design-help">Clic selecciona P/C; doble clic carga o reemplaza. Todas las variantes reutilizan estas dos artes.</p>
      <div className="variant-assets variant-asset-slots">{(['large', 'small'] as VariantAssetRole[]).map((role) => { const asset = studio.variantAssets[role]; return <button key={role} className={`variant-asset${selectedAssetRole === role ? ' active' : ''}`} onClick={() => selectRole(role)} onDoubleClick={() => { pendingRole.current = role; input.current?.click() }} title="Clic: seleccionar · doble clic: cargar o reemplazar">{(asset.thumbnailUrl || asset.url) ? <img src={(asset.thumbnailUrl || asset.url)!} alt="" /> : <ImagePlus size={18} />}<span><b>{role === 'large' ? 'P · Principal' : 'C · Companion'}</b><small>{asset.name ?? 'Sin arte cargada'}</small>{asset.width > 0 && <small>{asset.width} × {asset.height}</small>}</span></button> })}</div>
      <button className="text-button pair-upload-shortcut" onClick={() => pairInput.current?.click()}><ImagePlus size={13} /> Cargar par en orden P → C</button>
      <div className="combination-heading"><strong>Variantes</strong><button onClick={addCombination}><Plus size={13} /> Crear</button></div>
      <div className="combination-list single-variant-list">{studio.designCombinations.map((combination, index) => <article key={combination.id} className={`${studio.activeDesignCombinationId === combination.id ? 'active ' : ''}${combination.enabled ? '' : 'disabled'}`} onClick={() => selectCombination(combination)}>
        <label className="combination-enabled" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={combination.enabled} onChange={() => studio.updateDesignCombination(combination.id, { enabled: !combination.enabled })} /><Check size={12} /></label>
        <span><strong>{combination.name}</strong><small>{placementLabels[combination.mainPlacement]} · {placementLabels[combination.companionPlacement]}</small></span>
        <div><IconButton icon={ChevronUp} label="Subir variante" disabled={index === 0} onClick={(event) => { event.stopPropagation(); studio.moveDesignCombination(combination.id, -1) }} /><IconButton icon={ChevronDown} label="Bajar variante" disabled={index === studio.designCombinations.length - 1} onClick={(event) => { event.stopPropagation(); studio.moveDesignCombination(combination.id, 1) }} /><IconButton icon={Copy} label="Duplicar variante" onClick={(event) => { event.stopPropagation(); studio.duplicateDesignCombination(combination.id) }} />{!combination.presetId && <IconButton icon={Trash2} label="Eliminar variante" onClick={(event) => { event.stopPropagation(); studio.removeDesignCombination(combination.id) }} />}</div>
      </article>)}</div>
      {ready && <button className="text-button clear-variant-library" onClick={clear}><Trash2 size={12} /> Vaciar biblioteca</button>}
      {error && <p className="error">{error}</p>}
    </div>} detail={active && selectedPrint && selectedZone ? <div className="single-variant-inspector">
      <div className="collection-pane-title"><span>Configuración de variante</span><strong>{active.name}</strong></div>
      <div className="single-variant-fields"><label className="layer-field variant-name-field">Nombre<input value={active.name} onChange={(event) => updateName(event.target.value)} /></label><label className="select-row">Foco inicial<select value={active.focusRole} onChange={(event) => studio.updateDesignCombination(active.id, { focusRole: event.target.value as DesignAssetRole })}><option value="main">Principal</option><option value="companion">Companion</option></select></label><label className="collection-color-field">Color de la remera<input type="color" value={active.garmentColor} onChange={(event) => studio.updateDesignCombination(active.id, { garmentColor: event.target.value })} /></label></div>
      <label className="select-row selected-placement-field">Ubicación del {selectedRole === 'main' ? 'Principal' : 'Companion'}<select value={selectedPlacement} onChange={(event) => updatePlacement(selectedRole, event.target.value as PrintPlacement)}>{printPlacements.filter((placement) => placement !== (selectedRole === 'main' ? active.companionPlacement : active.mainPlacement)).map((placement) => <option key={placement} value={placement}>{placementLabels[placement]}</option>)}</select></label>
      <PrintZoneInspector placement={selectedPlacement} print={{ ...selectedPrint, url: selectedAsset.url, name: selectedAsset.name }} zoneAdjustment={selectedZone} editorMode={studio.editorMode} onEditorModeChange={studio.setEditorMode} onUpdatePrint={updatePrint} onUpdateZone={updateZone} onAlign={(alignment, target) => studio.alignPrint(selectedPlacement, alignment, target)} />
    </div> : <div className="collection-inspector-empty"><ImagePlus size={28} /><strong>Crea una variante</strong><span>Su configuración aparecerá aquí.</span></div>} />
  </section>
}
