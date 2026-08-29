import { useRef, useState } from 'react'
import { createDefaultCamera, createDefaultLabel } from '../../config/advancedDirectors'
import { useStudioStore } from '../../store/studioStore'
import { printPlacements, type DesignCombination, type PrintPlacement, type VariantAssetRole } from '../../types/studio'
import { removePreparedMedia, storePreparedMedia, variantMediaKey } from '../../utils/mediaStorage'
import { prepareVideoAsset } from '../../utils/mediaProcessor'
import { Check, ChevronDown, ChevronUp, Copy, Edit3, ImagePlus, Plus, Trash2 } from '../icons'
import { IconButton } from '../ui'

const placementLabels: Record<PrintPlacement, string> = { frontCenter: 'Frente', backCenter: 'Espalda', frontChest: 'Pecho', leftSleeve: 'Manga izquierda', rightSleeve: 'Manga derecha' }
const emptyPrints = () => Object.fromEntries(printPlacements.map((placement) => [placement, { url: null, name: null, scale: 1, x: 0, y: 0, rotation: 0, integration: 78, placement }])) as DesignCombination['printSettings']
const emptyZones = () => Object.fromEntries(printPlacements.map((placement) => [placement, { x: 0, y: 0, z: 0, width: 1, height: 1, rotation: null }])) as DesignCombination['zoneAdjustments']
const automaticName = (main: PrintPlacement, companion: PrintPlacement) => `Principal ${placementLabels[main].toLowerCase()} + Companion ${placementLabels[companion].toLowerCase()}`

export function VariantsPanel() {
  const input = useRef<HTMLInputElement>(null); const pairInput = useRef<HTMLInputElement>(null); const pendingRole = useRef<VariantAssetRole>('large')
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null); const [creating, setCreating] = useState(false); const [activeRole, setActiveRole] = useState<VariantAssetRole>('large')
  const [draft, setDraft] = useState<{ name: string; mainPlacement: PrintPlacement; companionPlacement: PrintPlacement; focusRole: 'main' | 'companion' }>({ name: '', mainPlacement: 'frontCenter', companionPlacement: 'backCenter', focusRole: 'main' })
  const studio = useStudioStore()
  const ready = Boolean(studio.variantAssets.large.name && studio.variantAssets.small.name)
  const selectRole = (role: VariantAssetRole) => {
    setActiveRole(role)
    const combination = useStudioStore.getState().designCombinations.find((item) => item.id === useStudioStore.getState().activeDesignCombinationId)
    if (!combination) return
    const placement = role === 'large' ? combination.mainPlacement : combination.companionPlacement
    studio.setActivePrintPlacement(placement); studio.setTargetRotation(placement === 'backCenter' ? Math.PI : placement === 'leftSleeve' ? Math.PI / 2 : placement === 'rightSleeve' ? -Math.PI / 2 : 0)
  }
  const storeAsset = async (role: VariantAssetRole, file: File) => {
    const prepared = await prepareVideoAsset(file, { profile: studio.assetQualityProfile, alphaMode: studio.alphaPipelineMode })
    const current = useStudioStore.getState().variantAssets[role]
    if (current.url) URL.revokeObjectURL(current.url)
    if (current.thumbnailUrl) URL.revokeObjectURL(current.thumbnailUrl)
    await storePreparedMedia(variantMediaKey(role), prepared.renderBlob, prepared.thumbnailBlob, prepared.metadata, file)
    studio.setVariantAsset(role, { url: URL.createObjectURL(prepared.renderBlob), thumbnailUrl: URL.createObjectURL(prepared.thumbnailBlob), name: file.name, width: prepared.metadata.proxyWidth, height: prepared.metadata.proxyHeight, originalWidth: prepared.metadata.originalWidth, originalHeight: prepared.metadata.originalHeight, originalBytes: prepared.metadata.originalBytes, renderBytes: prepared.metadata.renderBytes, profile: prepared.metadata.profile })
  }
  const chooseOne = async (role: VariantAssetRole, file?: File) => {
    if (!file) return
    if (!['image/png', 'image/webp'].includes(file.type)) { setError('La imagen debe ser PNG o WebP.'); return }
    try {
      await storeAsset(role, file); selectRole(role); setError(null)
    } catch { setError('No se pudo procesar la imagen.') }
  }
  const choosePair = async (files?: FileList | null) => {
    if (!files || files.length !== 2) { setError('Selecciona exactamente dos imágenes: primero Principal y luego Companion.'); return }
    const [main, companion] = Array.from(files)
    if ([main, companion].some((file) => !['image/png', 'image/webp'].includes(file.type))) { setError('Ambas imágenes deben ser PNG o WebP.'); return }
    try { await storeAsset('large', main); await storeAsset('small', companion); setError(null) } catch { setError('No se pudieron procesar las imágenes.') }
  }
  const clear = () => (['large', 'small'] as VariantAssetRole[]).forEach((role) => {
    const asset = studio.variantAssets[role]; if (asset.url) URL.revokeObjectURL(asset.url); if (asset.thumbnailUrl) URL.revokeObjectURL(asset.thumbnailUrl)
    void removePreparedMedia(variantMediaKey(role)); studio.setVariantAsset(role, { url: null, thumbnailUrl: null, name: null, width: 0, height: 0 })
  })
  const select = (combination: DesignCombination) => {
    studio.setActiveDesignCombinationId(combination.id)
    const placement = combination.focusRole === 'main' ? combination.mainPlacement : combination.companionPlacement
    studio.setActivePrintPlacement(placement); studio.setTargetRotation(placement === 'backCenter' ? Math.PI : placement === 'leftSleeve' ? Math.PI / 2 : placement === 'rightSleeve' ? -Math.PI / 2 : 0)
  }
  const openCreate = () => { setEditingId(null); setCreating(true); setDraft({ name: '', mainPlacement: 'frontCenter', companionPlacement: 'backCenter', focusRole: 'main' }) }
  const openEdit = (combination: DesignCombination) => { setEditingId(combination.id); setCreating(true); setDraft({ name: combination.name, mainPlacement: combination.mainPlacement, companionPlacement: combination.companionPlacement, focusRole: combination.focusRole }) }
  const save = () => {
    if (draft.mainPlacement === draft.companionPlacement) { setError('Principal y Companion deben usar ubicaciones diferentes.'); return }
    const name = draft.name.trim() || automaticName(draft.mainPlacement, draft.companionPlacement)
    if (editingId) {
      const current = studio.designCombinations.find((item) => item.id === editingId)
      if (!current) return
      studio.updateDesignCombination(editingId, { name, mainPlacement: draft.mainPlacement, companionPlacement: draft.companionPlacement, focusRole: draft.focusRole, printSettings: { ...current.printSettings, [draft.mainPlacement]: { ...current.printSettings[draft.mainPlacement], placement: draft.mainPlacement }, [draft.companionPlacement]: { ...current.printSettings[draft.companionPlacement], placement: draft.companionPlacement } }, label: { ...current.label, text: current.label.text === current.name ? name : current.label.text } })
    } else studio.addDesignCombination({ id: crypto.randomUUID(), name, enabled: true, order: studio.designCombinations.length, mainPlacement: draft.mainPlacement, companionPlacement: draft.companionPlacement, focusRole: draft.focusRole, garmentColor: studio.garmentColor, printSettings: emptyPrints(), zoneAdjustments: emptyZones(), camera: createDefaultCamera(), label: createDefaultLabel(name) })
    setCreating(false); setEditingId(null); setDraft({ name: '', mainPlacement: 'frontCenter', companionPlacement: 'backCenter', focusRole: 'main' }); setError(null)
  }
  return <section className="panel variants-panel"><h2>Diseño único</h2>
    <input ref={input} hidden type="file" accept="image/png,image/webp" onChange={(event) => { void chooseOne(pendingRole.current, event.target.files?.[0]); event.target.value = '' }} /><input ref={pairInput} hidden multiple type="file" accept="image/png,image/webp" onChange={(event) => { void choosePair(event.target.files); event.target.value = '' }} />
    <p className="muted">Clic selecciona P/C; doble clic carga o reemplaza esa arte. Las combinaciones reutilizan ambas.</p>
    <div className="variant-assets variant-asset-slots">{(['large', 'small'] as VariantAssetRole[]).map((role) => { const asset = studio.variantAssets[role]; return <button key={role} className={`variant-asset${activeRole === role ? ' active' : ''}`} onClick={() => selectRole(role)} onDoubleClick={() => { pendingRole.current = role; input.current?.click() }} title="Clic: seleccionar · doble clic: cargar o reemplazar">{(asset.thumbnailUrl || asset.url) ? <img src={(asset.thumbnailUrl || asset.url)!} alt="" /> : <ImagePlus size={18} />}<span><b>{role === 'large' ? 'P · Principal' : 'C · Companion'}</b><small>{asset.name ?? 'Sin arte cargada'}</small>{asset.width > 0 && <small>{asset.width} × {asset.height}</small>}</span></button> })}</div>
    <button className="text-button pair-upload-shortcut" onClick={() => pairInput.current?.click()}><ImagePlus size={13} /> Atajo: cargar par en orden P → C</button>
    <div className="combination-heading"><strong>Combinaciones a mostrar</strong><button onClick={openCreate}><Plus size={13} /> Crear combinación</button></div>
    <div className="combination-list">{studio.designCombinations.map((combination, index) => <article key={combination.id} className={`${studio.activeDesignCombinationId === combination.id ? 'active ' : ''}${combination.enabled ? '' : 'disabled'}`} onClick={() => select(combination)}>
      <label className="combination-enabled" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={combination.enabled} onChange={() => studio.updateDesignCombination(combination.id, { enabled: !combination.enabled })} /><Check size={12} /></label>
      <span><strong>{combination.name}</strong><small>{placementLabels[combination.mainPlacement]} · {placementLabels[combination.companionPlacement]}</small></span>
      <div><IconButton icon={Edit3} label="Editar combinación" onClick={(event) => { event.stopPropagation(); openEdit(combination) }} /><IconButton icon={ChevronUp} label="Subir combinación" disabled={index === 0} onClick={(event) => { event.stopPropagation(); studio.moveDesignCombination(combination.id, -1) }} /><IconButton icon={ChevronDown} label="Bajar combinación" disabled={index === studio.designCombinations.length - 1} onClick={(event) => { event.stopPropagation(); studio.moveDesignCombination(combination.id, 1) }} /><IconButton icon={Copy} label="Duplicar combinación" onClick={(event) => { event.stopPropagation(); studio.duplicateDesignCombination(combination.id) }} />{!combination.presetId && <IconButton icon={Trash2} label="Eliminar combinación" onClick={(event) => { event.stopPropagation(); studio.removeDesignCombination(combination.id) }} />}</div>
    </article>)}</div>
    {creating && <div className="combination-editor"><header><Edit3 size={15} /><strong>{editingId ? 'Editar combinación' : 'Nueva combinación'}</strong></header><label>Nombre<input value={draft.name} placeholder={automaticName(draft.mainPlacement, draft.companionPlacement)} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label><div className="layer-inline"><label>Principal<select value={draft.mainPlacement} onChange={(event) => { const mainPlacement = event.target.value as PrintPlacement; setDraft((current) => ({ ...current, mainPlacement, companionPlacement: current.companionPlacement === mainPlacement ? printPlacements.find((placement) => placement !== mainPlacement)! : current.companionPlacement })) }}>{printPlacements.filter((placement) => placement !== draft.companionPlacement).map((placement) => <option key={placement} value={placement}>{placementLabels[placement]}</option>)}</select></label><label>Companion<select value={draft.companionPlacement} onChange={(event) => setDraft((current) => ({ ...current, companionPlacement: event.target.value as PrintPlacement }))}>{printPlacements.filter((placement) => placement !== draft.mainPlacement).map((placement) => <option key={placement} value={placement}>{placementLabels[placement]}</option>)}</select></label></div><label>Foco inicial<select value={draft.focusRole} onChange={(event) => setDraft((current) => ({ ...current, focusRole: event.target.value as 'main' | 'companion' }))}><option value="main">Principal</option><option value="companion">Companion</option></select></label><footer><button onClick={() => { setCreating(false); setEditingId(null) }}>Cancelar</button><button className="primary-icon-button" onClick={save}>{editingId ? <Check size={13} /> : <Plus size={13} />} {editingId ? 'Guardar' : 'Crear'}</button></footer></div>}
    {ready && <button className="text-button" onClick={clear}><Trash2 size={12} /> Vaciar biblioteca</button>}
    {error && <p className="error">{error}</p>}
  </section>
}
