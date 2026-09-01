import { useRef, useState } from 'react'
import { useStudioStore } from '../../store/studioStore'
import type { LayerTiming, StageOverlayLayer } from '../../types/studio'
import { overlayMediaKey, removePreparedMedia, storePreparedMedia } from '../../utils/mediaStorage'
import { prepareVideoAsset } from '../../utils/mediaProcessor'
import { ChevronDown, ChevronUp, EllipsisVertical, Image as ImageIcon, Layers3, Lock, Plus, Type, X } from '../icons'

const newId = () => globalThis.crypto?.randomUUID?.() ?? `layer-${Date.now()}-${Math.random().toString(16).slice(2)}`
const defaultTiming = (duration: number): LayerTiming => ({ start: 0, duration, enter: 'fade', exit: 'fade' })

export function LayersDrawer({ embedded = false, onRequestClose }: { embedded?: boolean; onRequestClose?: () => void }) {
  const studio = useStudioStore(); const input = useRef<HTMLInputElement>(null)
  const projectDuration = studio.advancedProjects[studio.activeDirectorId].duration
  const [open, setOpen] = useState(false); const [optionsOpen, setOptionsOpen] = useState(true); const [error, setError] = useState<string | null>(null)
  const selectedOverlay = studio.overlayLayers.find((layer) => layer.id === studio.selectedLayerId)
  const selectedSystem = studio.selectedLayerId === 'background' || studio.selectedLayerId === 'garment' ? studio.selectedLayerId : null
  const selectImage = async (file?: File) => {
    if (!file) return
    if (!['image/png', 'image/webp'].includes(file.type)) { setError('Carga un PNG o WebP con transparencia.'); return }
    const id = newId()
    try {
      const prepared = await prepareVideoAsset(file, { profile: studio.assetQualityProfile, alphaMode: studio.alphaPipelineMode })
      const url = URL.createObjectURL(prepared.renderBlob)
      const layer: StageOverlayLayer = { id, type: 'image', name: file.name, sourceName: file.name, url, naturalWidth: prepared.metadata.proxyWidth, naturalHeight: prepared.metadata.proxyHeight, x: 50, y: 50, width: 28, rotation: 0, opacity: 100, timing: defaultTiming(projectDuration) }
      studio.addOverlayLayer(layer); setOpen(true); setError(null)
      await storePreparedMedia(overlayMediaKey(id), prepared.renderBlob, prepared.thumbnailBlob, prepared.metadata, file)
    } catch { setError('No se pudo procesar la imagen.') }
  }
  const addText = () => {
    studio.addOverlayLayer({ id: newId(), type: 'text', name: 'Texto', text: 'Tu texto', color: '#ffffff', fontSize: 5.2, fontWeight: 700, x: 50, y: 18, width: 40, rotation: 0, opacity: 100, timing: defaultTiming(projectDuration) })
    setOpen(true)
  }
  const removeSelected = () => {
    if (!selectedOverlay) return
    if (selectedOverlay.type === 'image' && selectedOverlay.url) URL.revokeObjectURL(selectedOverlay.url)
    void removePreparedMedia(overlayMediaKey(selectedOverlay.id)); studio.removeOverlayLayer(selectedOverlay.id)
  }
  const orderedLayers = [...studio.layerOrder].reverse()
  const visible = embedded || open
  return <aside className={`${visible ? 'layers-drawer open' : 'layers-drawer'}${embedded ? ' embedded' : ''}`}>
    {!embedded && <button className="layers-toggle" onClick={() => setOpen(!open)}><Layers3 size={15} />{open ? 'Cerrar capas' : 'Capas'}</button>}
    {visible && <div className="layers-content">
      <div className="layers-heading"><div><span>Composición</span><strong>Capas del anuncio</strong></div><button onClick={() => { setOpen(false); onRequestClose?.() }} aria-label="Cerrar capas"><X size={16} /></button></div>
      <div className="layer-add-actions"><button onClick={() => input.current?.click()}><Plus size={11} /> Imagen</button><button onClick={addText}><Plus size={11} /> Texto</button><input hidden ref={input} type="file" accept="image/png,image/webp" onChange={(event) => { void selectImage(event.target.files?.[0]); event.currentTarget.value = '' }} /></div>
      {error && <p className="error layer-error">{error}</p>}
      <div className="layer-list">
        {orderedLayers.map((id) => {
          const layer = studio.overlayLayers.find((item) => item.id === id); const system = id === 'garment'
          if (!layer && !system) return null
          const name = system ? 'Remera 3D' : layer!.name
          const Icon = system ? Layers3 : layer!.type === 'image' ? ImageIcon : Type
          return <button key={id} className={studio.selectedLayerId === id ? 'layer-row active' : 'layer-row'} onClick={() => studio.selectLayer(id)}><i><Icon size={14} /></i><span><strong>{name}</strong><small>{system ? 'Modelo 3D · fija' : layer!.type === 'image' ? 'Imagen transparente' : 'Texto editable'}</small></span><b><EllipsisVertical size={13} /></b></button>
        })}
        <button className={studio.selectedLayerId === 'background' ? 'layer-row active locked' : 'layer-row locked'} onClick={() => studio.selectLayer('background')}><i><ImageIcon size={14} /></i><span><strong>Fondo</strong><small>Obligatorio · no se puede quitar</small></span><b><Lock size={12} /></b></button>
      </div>
      {(selectedSystem || selectedOverlay) && <div className="layer-options">
        <button className="layer-options-title" onClick={() => setOptionsOpen(!optionsOpen)}><span>Opciones de la capa</span>{optionsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
        {optionsOpen && <div className="layer-options-body">
          {selectedOverlay && <>
            {selectedOverlay.type === 'text' && <><label className="layer-field">Contenido<textarea value={selectedOverlay.text} onChange={(event) => studio.updateOverlayLayer(selectedOverlay.id, { text: event.target.value })} /></label><div className="layer-inline"><label>Color<input type="color" value={selectedOverlay.color} onChange={(event) => studio.updateOverlayLayer(selectedOverlay.id, { color: event.target.value })} /></label><label>Tamaño %<input type="number" min="1" max="18" step="0.1" value={selectedOverlay.fontSize} onChange={(event) => studio.updateOverlayLayer(selectedOverlay.id, { fontSize: Number(event.target.value) })} /></label></div></>}
            <div className="layer-inline"><label>X %<input type="number" min="0" max="100" value={Number(selectedOverlay.x.toFixed(1))} onChange={(event) => studio.updateOverlayLayer(selectedOverlay.id, { x: Number(event.target.value) })} /></label><label>Y %<input type="number" min="0" max="100" value={Number(selectedOverlay.y.toFixed(1))} onChange={(event) => studio.updateOverlayLayer(selectedOverlay.id, { y: Number(event.target.value) })} /></label></div>
            <label className="range-row">Ancho<output>{selectedOverlay.width.toFixed(0)}%</output><input type="range" min="4" max="100" value={selectedOverlay.width} onChange={(event) => studio.updateOverlayLayer(selectedOverlay.id, { width: Number(event.target.value) })} /></label>
            <label className="range-row">Opacidad<output>{selectedOverlay.opacity}%</output><input type="range" min="0" max="100" value={selectedOverlay.opacity} onChange={(event) => studio.updateOverlayLayer(selectedOverlay.id, { opacity: Number(event.target.value) })} /></label>
            <label className="range-row">Rotación<output>{selectedOverlay.rotation}°</output><input type="range" min="-180" max="180" value={selectedOverlay.rotation} onChange={(event) => studio.updateOverlayLayer(selectedOverlay.id, { rotation: Number(event.target.value) })} /></label>
          </>}
          <p className="layer-timeline-hint">El inicio, la duración, los recortes y los fades se editan en la línea de tiempo.</p>
          <div className="layer-order-actions"><button disabled={selectedSystem === 'background'} onClick={() => studio.moveLayer(studio.selectedLayerId, 1)}>Subir capa</button><button disabled={selectedSystem === 'background'} onClick={() => studio.moveLayer(studio.selectedLayerId, -1)}>Bajar capa</button>{selectedOverlay && <button className="danger" onClick={removeSelected}>Eliminar</button>}</div>
        </div>}
      </div>}
    </div>}
  </aside>
}
