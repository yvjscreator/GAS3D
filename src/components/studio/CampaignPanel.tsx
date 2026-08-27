import { useState, type ChangeEvent, type DragEvent } from 'react'
import { createDefaultCamera, createDefaultLabel, isCompleteCollectionItem, isValidCollectionSize } from '../../config/advancedDirectors'
import { collectionTransitionDefinitions, garmentMotionDefinitions, placementFacing } from '../../config/garmentMotions'
import { useStudioStore } from '../../store/studioStore'
import type { CollectionAssetRole, CollectionItem, PrintPlacement, VariantAsset } from '../../types/studio'
import { collectionMediaKey, removeMedia, storeMedia } from '../../utils/mediaStorage'
import { ChevronDown, ChevronUp, GripVertical, Images, Plus, Trash2 } from '../icons'
import { VariantsPanel } from './VariantsPanel'

const placements: { id: PrintPlacement; label: string }[] = [
  { id: 'frontCenter', label: 'Frente' }, { id: 'backCenter', label: 'Espalda' }, { id: 'frontChest', label: 'Pecho' },
  { id: 'leftSleeve', label: 'Manga izquierda' }, { id: 'rightSleeve', label: 'Manga derecha' },
]
const newId = () => globalThis.crypto?.randomUUID?.() ?? `collection-${Date.now()}-${Math.random().toString(16).slice(2)}`
const cleanName = (name: string) => name.replace(/\.[^.]+$/, '')
const emptyAsset = (): VariantAsset => ({ url: null, name: null, width: 0, height: 0 })
const emptyZone = () => ({ x: 0, y: 0, z: 0, width: 1, height: 1, rotation: null })
const emptyPrint = (placement: PrintPlacement, scale: number) => ({ url: null, name: null, scale, x: 0, y: 0, rotation: 0, integration: 78, placement })

export function CampaignPanel() {
  const studio = useStudioStore(); const [error, setError] = useState<string | null>(null); const [draggingId, setDraggingId] = useState<string | null>(null)
  const active = studio.collectionItems.find((item) => item.id === studio.activeCollectionItemId) ?? null
  const completeItems = studio.collectionItems.filter(isCompleteCollectionItem); const validSize = isValidCollectionSize(completeItems.length)
  const addPair = () => {
    const id = newId(); const name = `Diseño ${studio.collectionItems.length + 1}`
    const item: CollectionItem = {
      id, name, asset: emptyAsset(), garmentColor: studio.garmentColor, placement: 'frontCenter', print: emptyPrint('frontCenter', 1), zoneAdjustment: emptyZone(),
      companionAsset: emptyAsset(), companionPlacement: 'leftSleeve', companionPrint: emptyPrint('leftSleeve', .72), companionZoneAdjustment: emptyZone(),
      camera: createDefaultCamera(), label: createDefaultLabel(name),
    }
    studio.addCollectionItem(item); studio.setActiveCollectionAssetRole('main'); studio.setActivePrintPlacement('frontCenter'); studio.setTargetRotation(0); setError(null)
  }
  const uploadAsset = (item: CollectionItem, role: CollectionAssetRole, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file) return
    if (!['image/png', 'image/webp'].includes(file.type)) { setError('Cada estampado debe ser PNG o WebP con transparencia.'); return }
    const url = URL.createObjectURL(file); const image = new window.Image()
    image.onload = () => {
      const asset = { url, name: file.name, width: image.naturalWidth, height: image.naturalHeight }
      if (role === 'main') {
        if (item.asset.url) URL.revokeObjectURL(item.asset.url)
        const automaticName = item.asset.name ? item.name : cleanName(file.name)
        studio.updateCollectionItem(item.id, { asset, print: { ...item.print, url, name: file.name }, name: automaticName, label: { ...item.label, text: automaticName } })
      } else {
        if (item.companionAsset.url) URL.revokeObjectURL(item.companionAsset.url)
        studio.updateCollectionItem(item.id, { companionAsset: asset, companionPrint: { ...item.companionPrint, url, name: file.name } })
      }
      studio.setActiveCollectionItemId(item.id); studio.setActiveCollectionAssetRole(role); setError(null)
      void storeMedia(collectionMediaKey(item.id, role), file).catch(() => setError('No se pudo guardar una de las imágenes del par.'))
    }
    image.onerror = () => { URL.revokeObjectURL(url); setError(`No se pudo leer ${file.name}.`) }; image.src = url
  }
  const selectItem = (item: CollectionItem, role: CollectionAssetRole = 'main') => {
    const placement = role === 'main' ? item.placement : item.companionPlacement
    studio.setActiveCollectionItemId(item.id); studio.setActiveCollectionAssetRole(role); studio.setActivePrintPlacement(placement); studio.setTargetRotation(placementFacing[placement])
  }
  const removeItem = (item: CollectionItem) => {
    if (item.asset.url) URL.revokeObjectURL(item.asset.url); if (item.companionAsset.url) URL.revokeObjectURL(item.companionAsset.url)
    void removeMedia(collectionMediaKey(item.id, 'main')); void removeMedia(collectionMediaKey(item.id, 'companion')); studio.removeCollectionItem(item.id)
  }
  const dropOn = (event: DragEvent, targetId: string) => { event.preventDefault(); if (draggingId) studio.reorderCollectionItem(draggingId, targetId); setDraggingId(null) }
  const role = studio.activeCollectionAssetRole
  const activePrint = active ? role === 'main' ? active.print : active.companionPrint : null
  const activePlacement = active ? role === 'main' ? active.placement : active.companionPlacement : null
  const updatePrint = (value: Partial<NonNullable<typeof activePrint>>) => { if (!active || !activePrint) return; studio.updateCollectionItem(active.id, role === 'main' ? { print: { ...active.print, ...value } } : { companionPrint: { ...active.companionPrint, ...value } }) }
  const updatePlacement = (placement: PrintPlacement) => {
    if (!active) return
    if (role === 'main') studio.updateCollectionItem(active.id, { placement, print: { ...active.print, placement } })
    else studio.updateCollectionItem(active.id, { companionPlacement: placement, companionPrint: { ...active.companionPrint, placement } })
    studio.setActivePrintPlacement(placement); studio.setTargetRotation(placementFacing[placement])
  }
  return <section className="panel campaign-panel"><h2>Tipo de campaña</h2>
    <div className="campaign-mode-selector"><button className={studio.campaignMode === 'variants' ? 'active' : ''} onClick={() => studio.setCampaignMode('variants')}><span>01</span><strong>Variantes de un diseño</strong><small>El flujo actual de zonas y combinaciones.</small></button><button className={studio.campaignMode === 'collection' ? 'active' : ''} onClick={() => studio.setCampaignMode('collection')}><Images size={15} /><strong>Colección de diseños</strong><small>Productos formados por estampado + companion.</small></button></div>
    {studio.campaignMode === 'variants' ? <div className="campaign-variants"><VariantsPanel /></div> : <>
      <div className={validSize ? 'collection-summary valid' : 'collection-summary'}><span>{completeItems.length} pares completos</span><strong>{Math.ceil(completeItems.length / 4)} grupos</strong></div>
      <button className="upload-button collection-add" onClick={addPair}><Plus size={13} /> Agregar par de artes</button>
      <p className={validSize ? 'collection-rule valid' : 'collection-rule'}>{validSize ? 'Colección lista para previsualizar y grabar.' : 'El video requiere 2, 3 o 4 pares; después, 8, 12, 16…'}</p>
      {error && <p className="error">{error}</p>}
      {!studio.collectionItems.length && <p className="collection-empty">Cada remera necesita un estampado principal y un companion icon. Agrega al menos dos pares completos.</p>}
      <div className="collection-list">{studio.collectionItems.map((item, index) => <article key={item.id} draggable onDragStart={() => setDraggingId(item.id)} onDragEnd={() => setDraggingId(null)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropOn(event, item.id)} className={item.id === studio.activeCollectionItemId ? 'collection-card active' : 'collection-card'} onClick={() => selectItem(item)}>
        <GripVertical size={13} /><span className="collection-index">{index + 1}</span><span className="collection-pair-thumbs"><button className={item.asset.name ? 'ready' : ''} onClick={(event) => { event.stopPropagation(); selectItem(item, 'main') }} title="Estampado principal">{item.asset.url ? <img src={item.asset.url} alt="" /> : <b>P</b>}</button><button className={item.companionAsset.name ? 'ready' : ''} onClick={(event) => { event.stopPropagation(); selectItem(item, 'companion') }} title="Companion icon">{item.companionAsset.url ? <img src={item.companionAsset.url} alt="" /> : <b>C</b>}</button></span><span className="collection-card-copy"><strong>{item.name}</strong><small>{isCompleteCollectionItem(item) ? `Grupo ${Math.floor(completeItems.indexOf(item) / 4) + 1} · Par completo` : 'Falta completar el par'}</small></span><span className="collection-card-actions"><button onClick={(event) => { event.stopPropagation(); studio.moveCollectionItem(item.id, -1) }} aria-label="Subir diseño"><ChevronUp size={12} /></button><button onClick={(event) => { event.stopPropagation(); studio.moveCollectionItem(item.id, 1) }} aria-label="Bajar diseño"><ChevronDown size={12} /></button><button className="danger" onClick={(event) => { event.stopPropagation(); removeItem(item) }} aria-label="Eliminar diseño"><Trash2 size={12} /></button></span>
      </article>)}</div>
      {active && activePrint && activePlacement && <div className="collection-item-options"><p>Configuración del par</p><div className="collection-art-tabs"><button className={role === 'main' ? 'active' : ''} onClick={() => selectItem(active, 'main')}>Estampado principal</button><button className={role === 'companion' ? 'active' : ''} onClick={() => selectItem(active, 'companion')}>Companion icon</button></div><label className={role === 'main' ? 'collection-upload-slot main' : 'collection-upload-slot companion'}><input hidden type="file" accept="image/png,image/webp" onChange={(event) => uploadAsset(active, role, event)} /><span>{role === 'main' ? active.asset.name ?? 'Cargar estampado principal' : active.companionAsset.name ?? 'Cargar companion icon'}</span><small>PNG o WebP transparente · clic para reemplazar</small></label><div className="collection-edit-mode"><button className={studio.editorMode === 'design' ? 'active' : ''} onClick={() => studio.setEditorMode('design')}>Mover estampado</button><button className={studio.editorMode === 'zone' ? 'active' : ''} onClick={() => studio.setEditorMode('zone')}>Configurar zona</button></div><label className="layer-field">Nombre del producto<input value={active.name} onChange={(event) => studio.updateCollectionItem(active.id, { name: event.target.value, label: { ...active.label, text: event.target.value } })} /></label><label className="select-row">Zona de esta arte<select value={activePlacement} onChange={(event) => updatePlacement(event.target.value as PrintPlacement)}>{placements.map((placement) => <option key={placement.id} value={placement.id} disabled={role === 'main' ? placement.id === active.companionPlacement : placement.id === active.placement}>{placement.label}</option>)}</select></label><label className="color-picker block"><input type="color" value={active.garmentColor} onChange={(event) => studio.updateCollectionItem(active.id, { garmentColor: event.target.value })} />Color de esta remera</label><label className="range-row">Tamaño<output>{activePrint.scale.toFixed(2)}×</output><input type="range" min=".2" max="2.5" step=".01" value={activePrint.scale} onChange={(event) => updatePrint({ scale: Number(event.target.value) })} /></label><div className="layer-inline"><label>Horizontal<input type="number" step=".01" value={activePrint.x} onChange={(event) => updatePrint({ x: Number(event.target.value) })} /></label><label>Vertical<input type="number" step=".01" value={activePrint.y} onChange={(event) => updatePrint({ y: Number(event.target.value) })} /></label></div></div>}
      <div className="collection-motion-options"><p>Transiciones entre tomas</p><small>Marca cuáles puede utilizar el montaje final.</small>{collectionTransitionDefinitions.map((transition) => <label key={transition.id}><input type="checkbox" checked={studio.collectionTransitionIds.includes(transition.id)} onChange={() => studio.toggleCollectionTransition(transition.id)} /><span><strong>{transition.name}</strong><small>{transition.description}</small></span></label>)}{!studio.collectionTransitionIds.length && <em>Sin efectos: el director utilizará cortes limpios.</em>}</div>
      <div className="collection-motion-options"><p>Movimientos 3D de la remera</p><small>El director alternará solamente los estilos marcados.</small>{garmentMotionDefinitions.map((motion) => <label key={motion.id}><input type="checkbox" checked={studio.collectionMotionIds.includes(motion.id)} onChange={() => studio.toggleCollectionMotion(motion.id)} /><span><strong>{motion.name}</strong><small>{motion.description}</small></span></label>)}{!studio.collectionMotionIds.length && <em>Marca al menos uno; mientras tanto se usará el turntable derecho.</em>}</div>
    </>}
  </section>
}
