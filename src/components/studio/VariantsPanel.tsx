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
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<{ name: string; mainPlacement: PrintPlacement; companionPlacement: PrintPlacement; focusRole: 'main' | 'companion' }>({ name: '', mainPlacement: 'frontCenter', companionPlacement: 'backCenter', focusRole: 'main' })
  const studio = useStudioStore()
  const ready = Boolean(studio.variantAssets.large.name && studio.variantAssets.small.name)
  const choose = async (files?: FileList | null) => {
    if (!files || files.length !== 2) { setError('Selecciona exactamente dos imágenes.'); return }
    const candidates = Array.from(files)
    if (candidates.some((file) => !['image/png', 'image/webp'].includes(file.type))) { setError('Ambas imágenes deben ser PNG o WebP.'); return }
    try {
      const inspected = await Promise.all(candidates.map(async (file) => ({ file, prepared: await prepareVideoAsset(file, { profile: studio.assetQualityProfile, alphaMode: studio.alphaPipelineMode }) })))
      inspected.sort((a, b) => b.prepared.metadata.originalWidth * b.prepared.metadata.originalHeight - a.prepared.metadata.originalWidth * a.prepared.metadata.originalHeight)
      const assignments: [VariantAssetRole, typeof inspected[number]][] = [['large', inspected[0]], ['small', inspected[1]]]
      await Promise.all(assignments.map(async ([role, item]) => {
        const current = studio.variantAssets[role]
        if (current.url) URL.revokeObjectURL(current.url)
        if (current.thumbnailUrl) URL.revokeObjectURL(current.thumbnailUrl)
        await storePreparedMedia(variantMediaKey(role), item.prepared.renderBlob, item.prepared.thumbnailBlob, item.prepared.metadata, item.file)
        studio.setVariantAsset(role, { url: URL.createObjectURL(item.prepared.renderBlob), thumbnailUrl: URL.createObjectURL(item.prepared.thumbnailBlob), name: item.file.name, width: item.prepared.metadata.proxyWidth, height: item.prepared.metadata.proxyHeight, originalWidth: item.prepared.metadata.originalWidth, originalHeight: item.prepared.metadata.originalHeight, originalBytes: item.prepared.metadata.originalBytes, renderBytes: item.prepared.metadata.renderBytes, profile: item.prepared.metadata.profile })
      }))
      setError(null)
    } catch { setError('No se pudieron procesar las imágenes.') }
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
  const create = () => {
    if (draft.mainPlacement === draft.companionPlacement) { setError('Principal y Companion deben usar ubicaciones diferentes.'); return }
    const name = draft.name.trim() || automaticName(draft.mainPlacement, draft.companionPlacement)
    studio.addDesignCombination({ id: crypto.randomUUID(), name, enabled: true, order: studio.designCombinations.length, mainPlacement: draft.mainPlacement, companionPlacement: draft.companionPlacement, focusRole: draft.focusRole, garmentColor: studio.garmentColor, printSettings: emptyPrints(), zoneAdjustments: emptyZones(), camera: createDefaultCamera(), label: createDefaultLabel(name) })
    setCreating(false); setDraft({ name: '', mainPlacement: 'frontCenter', companionPlacement: 'backCenter', focusRole: 'main' }); setError(null)
  }
  return <section className="panel variants-panel"><h2>Diseño único</h2>
    <input ref={input} hidden multiple type="file" accept="image/png,image/webp" onChange={(event) => { void choose(event.target.files); event.target.value = '' }} />
    <p className="muted">Carga Principal y Companion una sola vez; las combinaciones reutilizan ambas artes.</p>
    <button className="upload-button" onClick={() => input.current?.click()}><ImagePlus size={14} /> {ready ? 'Reemplazar las dos artes' : 'Cargar Principal + Companion'}</button>
    {(studio.variantAssets.large.name || studio.variantAssets.small.name) && <div className="variant-assets">{(['large', 'small'] as VariantAssetRole[]).map((role) => <div key={role} className="variant-asset">{(studio.variantAssets[role].thumbnailUrl || studio.variantAssets[role].url) && <img src={(studio.variantAssets[role].thumbnailUrl || studio.variantAssets[role].url)!} alt="" />}<span><b>{role === 'large' ? 'Principal' : 'Companion'}</b><small>{studio.variantAssets[role].width} × {studio.variantAssets[role].height}</small></span></div>)}</div>}
    <div className="combination-heading"><strong>Combinaciones a mostrar</strong><button onClick={() => setCreating(true)}><Plus size={13} /> Crear combinación</button></div>
    <div className="combination-list">{studio.designCombinations.map((combination, index) => <article key={combination.id} className={`${studio.activeDesignCombinationId === combination.id ? 'active ' : ''}${combination.enabled ? '' : 'disabled'}`} onClick={() => select(combination)}>
      <label className="combination-enabled" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={combination.enabled} onChange={() => studio.updateDesignCombination(combination.id, { enabled: !combination.enabled })} /><Check size={12} /></label>
      <span><strong>{combination.name}</strong><small>{placementLabels[combination.mainPlacement]} · {placementLabels[combination.companionPlacement]}</small></span>
      <div><IconButton icon={ChevronUp} label="Subir combinación" disabled={index === 0} onClick={(event) => { event.stopPropagation(); studio.moveDesignCombination(combination.id, -1) }} /><IconButton icon={ChevronDown} label="Bajar combinación" disabled={index === studio.designCombinations.length - 1} onClick={(event) => { event.stopPropagation(); studio.moveDesignCombination(combination.id, 1) }} /><IconButton icon={Copy} label="Duplicar combinación" onClick={(event) => { event.stopPropagation(); studio.duplicateDesignCombination(combination.id) }} />{!combination.presetId && <IconButton icon={Trash2} label="Eliminar combinación" onClick={(event) => { event.stopPropagation(); studio.removeDesignCombination(combination.id) }} />}</div>
    </article>)}</div>
    {creating && <div className="combination-editor"><header><Edit3 size={15} /><strong>Nueva combinación</strong></header><label>Nombre<input value={draft.name} placeholder={automaticName(draft.mainPlacement, draft.companionPlacement)} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label><div className="layer-inline"><label>Principal<select value={draft.mainPlacement} onChange={(event) => setDraft((current) => ({ ...current, mainPlacement: event.target.value as PrintPlacement }))}>{printPlacements.map((placement) => <option key={placement} value={placement}>{placementLabels[placement]}</option>)}</select></label><label>Companion<select value={draft.companionPlacement} onChange={(event) => setDraft((current) => ({ ...current, companionPlacement: event.target.value as PrintPlacement }))}>{printPlacements.map((placement) => <option key={placement} value={placement}>{placementLabels[placement]}</option>)}</select></label></div><label>Foco inicial<select value={draft.focusRole} onChange={(event) => setDraft((current) => ({ ...current, focusRole: event.target.value as 'main' | 'companion' }))}><option value="main">Principal</option><option value="companion">Companion</option></select></label><footer><button onClick={() => setCreating(false)}>Cancelar</button><button className="primary-icon-button" onClick={create}><Plus size={13} /> Crear</button></footer></div>}
    {ready && <button className="text-button" onClick={clear}><Trash2 size={12} /> Vaciar biblioteca</button>}
    {error && <p className="error">{error}</p>}
  </section>
}
