import { useRef, useState, type DragEvent } from 'react'
import { createDefaultCamera, createDefaultLabel, isCompleteCollectionItem, isValidCollectionSize } from '../../config/advancedDirectors'
import { collectionTransitionDefinitions, garmentMotionDefinitions, placementFacing } from '../../config/garmentMotions'
import { useStudioStore } from '../../store/studioStore'
import type { CampaignMode, CollectionAssetRole, CollectionItem, PrintPlacement, VariantAsset } from '../../types/studio'
import { collectionMediaKey, removePreparedMedia, storePreparedMedia } from '../../utils/mediaStorage'
import { prepareVideoAsset } from '../../utils/mediaProcessor'
import { ArrowLeft, ArrowRight, ArrowUp, Blend, ChevronDown, ChevronUp, Grid2X2, GripVertical, ImagePlus, Images, Orbit, Plus, Repeat2, RotateCcw, RotateCw, Search, Split, Trash2, Zap, ZoomIn } from '../icons'
import { IconButton, InspectorSection, MasterDetailLayout, ResponsiveOptionGrid, SegmentedControl } from '../ui'
import { VariantsPanel } from './VariantsPanel'
import { buildPresentationGroups } from '../../utils/presentationPlanner'

const placements: { id: PrintPlacement; label: string }[] = [
  { id: 'frontCenter', label: 'Frente' }, { id: 'backCenter', label: 'Espalda' }, { id: 'frontChest', label: 'Pecho' },
  { id: 'leftSleeve', label: 'Manga izquierda' }, { id: 'rightSleeve', label: 'Manga derecha' },
]
const transitionIcons = { fade: Blend, slideLeft: ArrowLeft, slideRight: ArrowRight, slideUp: ArrowUp, zoom: ZoomIn }
const motionIcons = { turntableRight: RotateCw, turntableLeft: RotateCcw, whipCompanion: Zap, heroArc: Orbit, detailPush: Search, companionReveal: Repeat2 }
const newId = () => globalThis.crypto?.randomUUID?.() ?? `collection-${Date.now()}-${Math.random().toString(16).slice(2)}`
const cleanName = (name: string) => name.replace(/\.[^.]+$/, '')
const emptyAsset = (): VariantAsset => ({ url: null, name: null, width: 0, height: 0 })
const emptyZone = () => ({ x: 0, y: 0, z: 0, width: 1, height: 1, rotation: null })
const emptyPrint = (placement: PrintPlacement, scale: number) => ({ url: null, name: null, scale, x: 0, y: 0, rotation: 0, integration: 78, placement })

export function CampaignPanel() {
  const studio = useStudioStore(); const [error, setError] = useState<string | null>(null); const [draggingId, setDraggingId] = useState<string | null>(null)
  const uploadInput = useRef<HTMLInputElement>(null); const pendingUpload = useRef<{ item: CollectionItem; role: CollectionAssetRole } | null>(null)
  const active = studio.collectionItems.find((item) => item.id === studio.activeCollectionItemId) ?? null
  const completeItems = studio.collectionItems.filter(isCompleteCollectionItem); const validSize = isValidCollectionSize(completeItems.length); const presentationGroups = buildPresentationGroups(completeItems)
  const selectItem = (item: CollectionItem, role: CollectionAssetRole = 'main') => {
    const placement = role === 'main' ? item.placement : item.companionPlacement
    studio.setActiveCollectionItemId(item.id); studio.setActiveCollectionAssetRole(role); studio.setActivePrintPlacement(placement); studio.setTargetRotation(placementFacing[placement])
  }
  const addPair = () => {
    const id = newId(); const name = `Diseño ${studio.collectionItems.length + 1}`
    const item: CollectionItem = {
      id, name, asset: emptyAsset(), garmentColor: studio.garmentColor, placement: 'frontCenter', print: emptyPrint('frontCenter', 1), zoneAdjustment: emptyZone(),
      companionAsset: emptyAsset(), companionPlacement: 'leftSleeve', companionPrint: emptyPrint('leftSleeve', .72), companionZoneAdjustment: emptyZone(),
      camera: createDefaultCamera(), label: createDefaultLabel(name),
    }
    studio.addCollectionItem(item); studio.setActiveCollectionAssetRole('main'); studio.setActivePrintPlacement('frontCenter'); studio.setTargetRotation(0); setError(null)
  }
  const uploadAsset = async (item: CollectionItem, role: CollectionAssetRole, file?: File) => {
    if (!file) return
    if (!['image/png', 'image/webp'].includes(file.type)) { setError('Cada estampado debe ser PNG o WebP con transparencia.'); return }
    try {
      const prepared = await prepareVideoAsset(file)
      const url = URL.createObjectURL(prepared.renderBlob); const thumbnailUrl = URL.createObjectURL(prepared.thumbnailBlob)
      const asset = { url, thumbnailUrl, name: file.name, width: prepared.metadata.proxyWidth, height: prepared.metadata.proxyHeight, originalWidth: prepared.metadata.originalWidth, originalHeight: prepared.metadata.originalHeight, originalBytes: prepared.metadata.originalBytes, renderBytes: prepared.metadata.renderBytes, profile: prepared.metadata.profile }
      if (role === 'main') {
        if (item.asset.url) URL.revokeObjectURL(item.asset.url)
        if (item.asset.thumbnailUrl) URL.revokeObjectURL(item.asset.thumbnailUrl)
        const automaticName = item.asset.name ? item.name : cleanName(file.name)
        studio.updateCollectionItem(item.id, { asset, print: { ...item.print, url, name: file.name }, name: automaticName, label: { ...item.label, text: automaticName } })
      } else {
        if (item.companionAsset.url) URL.revokeObjectURL(item.companionAsset.url)
        if (item.companionAsset.thumbnailUrl) URL.revokeObjectURL(item.companionAsset.thumbnailUrl)
        studio.updateCollectionItem(item.id, { companionAsset: asset, companionPrint: { ...item.companionPrint, url, name: file.name } })
      }
      selectItem(item, role); setError(null)
      await storePreparedMedia(collectionMediaKey(item.id, role), prepared.renderBlob, prepared.thumbnailBlob, prepared.metadata)
    } catch { setError(`No se pudo procesar ${file.name}.`) }
  }
  const requestUpload = (item: CollectionItem, role: CollectionAssetRole) => { selectItem(item, role); pendingUpload.current = { item, role }; uploadInput.current?.click() }
  const removeItem = (item: CollectionItem) => {
    if (item.asset.url) URL.revokeObjectURL(item.asset.url); if (item.companionAsset.url) URL.revokeObjectURL(item.companionAsset.url)
    if (item.asset.thumbnailUrl) URL.revokeObjectURL(item.asset.thumbnailUrl); if (item.companionAsset.thumbnailUrl) URL.revokeObjectURL(item.companionAsset.thumbnailUrl)
    void removePreparedMedia(collectionMediaKey(item.id, 'main')); void removePreparedMedia(collectionMediaKey(item.id, 'companion')); studio.removeCollectionItem(item.id)
  }
  const dropOn = (event: DragEvent, targetId: string) => { event.preventDefault(); if (draggingId) studio.reorderCollectionItem(draggingId, targetId); setDraggingId(null) }
  const role = studio.activeCollectionAssetRole
  const activePrint = active ? role === 'main' ? active.print : active.companionPrint : null
  const activePlacement = active ? role === 'main' ? active.placement : active.companionPlacement : null
  const activeAsset = active ? role === 'main' ? active.asset : active.companionAsset : null
  const updatePrint = (value: Partial<NonNullable<typeof activePrint>>) => { if (!active || !activePrint) return; studio.updateCollectionItem(active.id, role === 'main' ? { print: { ...active.print, ...value } } : { companionPrint: { ...active.companionPrint, ...value } }) }
  const updatePlacement = (placement: PrintPlacement) => {
    if (!active) return
    if (role === 'main') studio.updateCollectionItem(active.id, { placement, print: { ...active.print, placement } })
    else studio.updateCollectionItem(active.id, { companionPlacement: placement, companionPrint: { ...active.companionPrint, placement } })
    studio.setActivePrintPlacement(placement); studio.setTargetRotation(placementFacing[placement])
  }
  return <section className="panel campaign-panel"><h2>Tipo de campaña</h2>
    <SegmentedControl label="Tipo de campaña" value={studio.campaignMode} onChange={(value: CampaignMode) => studio.setCampaignMode(value)} options={[{ value: 'variants', label: 'Variantes', icon: Split }, { value: 'collection', label: 'Colección', icon: Images }]} />
    {studio.campaignMode === 'variants' ? <div className="campaign-variants"><VariantsPanel /></div> : <>
      <input ref={uploadInput} hidden type="file" accept="image/png,image/webp" onChange={(event) => { const target = pendingUpload.current; if (target) void uploadAsset(target.item, target.role, event.target.files?.[0]); pendingUpload.current = null; event.currentTarget.value = '' }} />
      <div className="collection-toolbar"><div className={validSize ? 'collection-summary valid' : 'collection-summary'}><span>{completeItems.length} pares completos</span><strong>{presentationGroups.length} {presentationGroups.length === 1 ? 'grupo' : 'grupos'} · {presentationGroups.map((group) => group.length).join(' + ') || '—'}</strong></div><button className="upload-button collection-add" onClick={addPair}><Plus size={14} /> Agregar par</button></div>
      <p className={validSize ? 'collection-rule valid' : 'collection-rule'}>{validSize ? 'Colección lista para previsualizar y grabar.' : 'Completa al menos 2 pares para construir la presentación.'}</p>
      {error && <p className="error">{error}</p>}
      <MasterDetailLayout className="collection-workspace" master={<>
        <div className="collection-pane-title"><span>Colección</span><b>{studio.collectionItems.length}</b></div>
        {!studio.collectionItems.length && <p className="collection-empty">Agrega prendas y carga un estampado principal junto con su companion.</p>}
        <div className="collection-list">{studio.collectionItems.map((item, index) => <article key={item.id} draggable onDragStart={() => setDraggingId(item.id)} onDragEnd={() => setDraggingId(null)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropOn(event, item.id)} className={item.id === studio.activeCollectionItemId ? 'collection-card active' : 'collection-card'} onClick={() => selectItem(item)}>
          <GripVertical size={14} /><span className="collection-index">{index + 1}</span><span className="collection-pair-thumbs"><button className={item.asset.name ? 'ready' : ''} onClick={(event) => { event.stopPropagation(); requestUpload(item, 'main') }} aria-label={item.asset.name ? 'Reemplazar estampado principal' : 'Cargar estampado principal'}>{item.asset.url ? <img src={item.asset.thumbnailUrl || item.asset.url} alt="" /> : <ImagePlus size={14} />}<b>P</b></button><button className={item.companionAsset.name ? 'ready' : ''} onClick={(event) => { event.stopPropagation(); requestUpload(item, 'companion') }} aria-label={item.companionAsset.name ? 'Reemplazar companion' : 'Cargar companion'}>{item.companionAsset.url ? <img src={item.companionAsset.thumbnailUrl || item.companionAsset.url} alt="" /> : <ImagePlus size={14} />}<b>C</b></button></span><span className="collection-card-copy"><strong>{item.name}</strong><small>{isCompleteCollectionItem(item) ? `Grupo ${presentationGroups.findIndex((group) => group.some((candidate) => candidate.id === item.id)) + 1} · Par completo` : 'Falta completar el par'}</small></span><span className="collection-card-actions"><IconButton icon={ChevronUp} label="Subir diseño" onClick={(event) => { event.stopPropagation(); studio.moveCollectionItem(item.id, -1) }} /><IconButton icon={ChevronDown} label="Bajar diseño" onClick={(event) => { event.stopPropagation(); studio.moveCollectionItem(item.id, 1) }} /><IconButton icon={Trash2} label="Eliminar diseño" className="danger" onClick={(event) => { event.stopPropagation(); removeItem(item) }} /></span>
        </article>)}</div>
      </>} detail={active && activePrint && activePlacement && activeAsset ? <div className="collection-inspector">
        <div className="collection-pane-title"><span>Diseño seleccionado</span><strong>{active.name}</strong></div>
        <SegmentedControl label="Arte del par" value={role} onChange={(value: CollectionAssetRole) => selectItem(active, value)} options={[{ value: 'main', label: 'Principal', icon: ImagePlus }, { value: 'companion', label: 'Companion', icon: Grid2X2 }]} />
        <button className={`collection-upload-slot ${role}`} onClick={() => requestUpload(active, role)}>{activeAsset.url ? <img src={activeAsset.thumbnailUrl || activeAsset.url} alt="" /> : <ImagePlus size={24} />}<span><strong>{activeAsset.name ?? (role === 'main' ? 'Cargar estampado principal' : 'Cargar companion')}</strong><small>PNG o WebP transparente · clic para {activeAsset.name ? 'reemplazar' : 'cargar'}</small></span></button>
        <SegmentedControl label="Modo de edición" value={studio.editorMode} onChange={studio.setEditorMode} options={[{ value: 'design', label: 'Mover diseño', icon: ImagePlus }, { value: 'zone', label: 'Configurar zona', icon: Grid2X2 }]} />
        <div className="collection-inspector-fields"><label className="layer-field collection-name-field">Nombre del producto<input value={active.name} onChange={(event) => studio.updateCollectionItem(active.id, { name: event.target.value, label: { ...active.label, text: event.target.value } })} /></label><label className="select-row">Zona de esta arte<select value={activePlacement} onChange={(event) => updatePlacement(event.target.value as PrintPlacement)}>{placements.map((placement) => <option key={placement.id} value={placement.id} disabled={role === 'main' ? placement.id === active.companionPlacement : placement.id === active.placement}>{placement.label}</option>)}</select></label><label className="collection-color-field">Color de la remera<input type="color" value={active.garmentColor} onChange={(event) => studio.updateCollectionItem(active.id, { garmentColor: event.target.value })} /></label></div>
        <label className="range-row collection-scale-field">Tamaño<output>{activePrint.scale.toFixed(2)}×</output><input type="range" min=".2" max="2.5" step=".01" value={activePrint.scale} onChange={(event) => updatePrint({ scale: Number(event.target.value) })} /></label><div className="layer-inline"><label>Horizontal<input type="number" step=".01" value={activePrint.x} onChange={(event) => updatePrint({ x: Number(event.target.value) })} /></label><label>Vertical<input type="number" step=".01" value={activePrint.y} onChange={(event) => updatePrint({ y: Number(event.target.value) })} /></label></div>
      </div> : <div className="collection-inspector-empty"><Images size={28} /><strong>Selecciona una prenda</strong><span>Su configuración aparecerá aquí.</span></div>} />
      <div className="collection-director-options"><InspectorSection title="Transiciones entre tomas"><p>Selecciona cuáles puede utilizar el montaje final.</p><ResponsiveOptionGrid minWidth={150}>{collectionTransitionDefinitions.map((transition) => { const Icon = transitionIcons[transition.id]; return <label key={transition.id} className="collection-option-card"><input type="checkbox" checked={studio.collectionTransitionIds.includes(transition.id)} onChange={() => studio.toggleCollectionTransition(transition.id)} /><Icon size={17} /><span><strong>{transition.name}</strong><small>{transition.description}</small></span></label> })}</ResponsiveOptionGrid>{!studio.collectionTransitionIds.length && <em>El director utilizará cortes limpios.</em>}</InspectorSection>
      <InspectorSection title="Movimientos 3D"><p>El director alternará solamente los estilos seleccionados.</p><ResponsiveOptionGrid minWidth={175}>{garmentMotionDefinitions.map((motion) => { const Icon = motionIcons[motion.id]; return <label key={motion.id} className="collection-option-card"><input type="checkbox" checked={studio.collectionMotionIds.includes(motion.id)} onChange={() => studio.toggleCollectionMotion(motion.id)} /><Icon size={17} /><span><strong>{motion.name}</strong><small>{motion.description}</small></span></label> })}</ResponsiveOptionGrid>{!studio.collectionMotionIds.length && <em>Se utilizará el turntable derecho como respaldo.</em>}</InspectorSection></div>
    </>}
  </section>
}
