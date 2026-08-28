import { useRef, useState } from 'react'
import { useStudioStore } from '../../store/studioStore'
import type { LayerTiming, LayerTransition, StageOverlayLayer } from '../../types/studio'
import { musicMediaKey, overlayMediaKey, removeMedia, removePreparedMedia, storeMedia, storePreparedMedia } from '../../utils/mediaStorage'
import { prepareVideoAsset } from '../../utils/mediaProcessor'
import { ChevronDown, ChevronUp, EllipsisVertical, Image as ImageIcon, Layers3, Lock, Music2, Plus, RefreshCw, Type, X } from '../icons'

const transitionLabels: Record<LayerTransition, string> = {
  none: 'Sin transición', fade: 'Fundido', slideLeft: 'Desde la izquierda', slideRight: 'Desde la derecha', slideUp: 'Desde abajo', zoom: 'Zoom suave',
}
const transitions = Object.keys(transitionLabels) as LayerTransition[]
const newId = () => globalThis.crypto?.randomUUID?.() ?? `layer-${Date.now()}-${Math.random().toString(16).slice(2)}`
const defaultTiming = (duration: number): LayerTiming => ({ start: 0, duration, enter: 'fade', exit: 'fade' })

export function LayersDrawer({ embedded = false, onRequestClose }: { embedded?: boolean; onRequestClose?: () => void }) {
  const studio = useStudioStore(); const input = useRef<HTMLInputElement>(null); const musicInput = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false); const [optionsOpen, setOptionsOpen] = useState(true); const [error, setError] = useState<string | null>(null)
  const selectedOverlay = studio.overlayLayers.find((layer) => layer.id === studio.selectedLayerId)
  const selectedMusic = studio.selectedLayerId === 'music' && Boolean(studio.music.url)
  const selectedSystem = studio.selectedLayerId === 'background' || studio.selectedLayerId === 'garment' ? studio.selectedLayerId : null
  const selectedTiming = selectedSystem ? studio.systemLayerTimings[selectedSystem] : selectedOverlay?.timing
  const selectImage = async (file?: File) => {
    if (!file) return
    if (!['image/png', 'image/webp'].includes(file.type)) { setError('Carga un PNG o WebP con transparencia.'); return }
    const id = newId()
    try {
      const prepared = await prepareVideoAsset(file)
      const url = URL.createObjectURL(prepared.renderBlob)
      const layer: StageOverlayLayer = { id, type: 'image', name: file.name, sourceName: file.name, url, naturalWidth: prepared.metadata.proxyWidth, naturalHeight: prepared.metadata.proxyHeight, x: 50, y: 50, width: 28, rotation: 0, opacity: 100, timing: defaultTiming(studio.duration) }
      studio.addOverlayLayer(layer); setOpen(true); setError(null)
      await storePreparedMedia(overlayMediaKey(id), prepared.renderBlob, prepared.thumbnailBlob, prepared.metadata)
    } catch { setError('No se pudo procesar la imagen.') }
  }
  const addText = () => {
    studio.addOverlayLayer({ id: newId(), type: 'text', name: 'Texto', text: 'Tu texto', color: '#ffffff', fontSize: 5.2, fontWeight: 700, x: 50, y: 18, width: 40, rotation: 0, opacity: 100, timing: defaultTiming(studio.duration) })
    setOpen(true)
  }
  const selectMusic = (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|aac|m4a)$/i.test(file.name)) { setError('Carga un archivo MP3, WAV, AAC u OGG.'); return }
    const url = URL.createObjectURL(file); const probe = new Audio()
    probe.onloadedmetadata = () => {
      const sourceDuration = Number.isFinite(probe.duration) ? probe.duration : studio.duration
      if (studio.music.url) URL.revokeObjectURL(studio.music.url)
      studio.setMusic({ url, name: file.name, sourceDuration, start: 0, duration: sourceDuration, fadeIn: .5, fadeOut: .8 })
      if (studio.beatSync.source === 'music') studio.setBeatSync({ analyzedAssetName: null, beats: [], confidence: 0 })
      studio.selectLayer('music'); setOpen(true); setError(null); probe.removeAttribute('src')
      void storeMedia(musicMediaKey, file).catch(() => setError('No se pudo guardar la música para la próxima sesión.'))
    }
    probe.onerror = () => { URL.revokeObjectURL(url); setError('No se pudo leer el archivo de audio.') }
    probe.preload = 'metadata'; probe.src = url
  }
  const updateTiming = (value: Partial<LayerTiming>) => {
    if (!selectedTiming) return
    if (selectedSystem) studio.setSystemLayerTiming(selectedSystem, value)
    else if (selectedOverlay) studio.updateOverlayLayer(selectedOverlay.id, { timing: { ...selectedOverlay.timing, ...value } })
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
      <div className="layer-add-actions"><button onClick={() => input.current?.click()}><Plus size={11} /> Imagen</button><button onClick={addText}><Plus size={11} /> Texto</button><button onClick={() => musicInput.current?.click()}>{studio.music.url ? <RefreshCw size={11} /> : <Plus size={11} />} Música</button><input hidden ref={input} type="file" accept="image/png,image/webp" onChange={(event) => { void selectImage(event.target.files?.[0]); event.currentTarget.value = '' }} /><input hidden ref={musicInput} type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/aac,.m4a" onChange={(event) => { selectMusic(event.target.files?.[0]); event.currentTarget.value = '' }} /></div>
      {error && <p className="error layer-error">{error}</p>}
      <div className="layer-list">
        {studio.music.url && <button className={selectedMusic ? 'layer-row active audio-layer-row' : 'layer-row audio-layer-row'} onClick={() => studio.selectLayer('music')}><i><Music2 size={14} /></i><span><strong>{studio.music.name}</strong><small>Música · {studio.music.sourceDuration.toFixed(1)}s</small></span><b><EllipsisVertical size={13} /></b></button>}
        {orderedLayers.map((id) => {
          const layer = studio.overlayLayers.find((item) => item.id === id); const system = id === 'garment'
          if (!layer && !system) return null
          const name = system ? 'Remera 3D' : layer!.name
          const Icon = system ? Layers3 : layer!.type === 'image' ? ImageIcon : Type
          return <button key={id} className={studio.selectedLayerId === id ? 'layer-row active' : 'layer-row'} onClick={() => studio.selectLayer(id)}><i><Icon size={14} /></i><span><strong>{name}</strong><small>{system ? 'Modelo 3D · fija' : layer!.type === 'image' ? 'Imagen transparente' : 'Texto editable'}</small></span><b><EllipsisVertical size={13} /></b></button>
        })}
        <button className={studio.selectedLayerId === 'background' ? 'layer-row active locked' : 'layer-row locked'} onClick={() => studio.selectLayer('background')}><i><ImageIcon size={14} /></i><span><strong>Fondo</strong><small>Obligatorio · no se puede quitar</small></span><b><Lock size={12} /></b></button>
      </div>
      {(selectedSystem || selectedOverlay || selectedMusic) && <div className="layer-options">
        <button className="layer-options-title" onClick={() => setOptionsOpen(!optionsOpen)}><span>Opciones de la capa</span>{optionsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
        {optionsOpen && <div className="layer-options-body">
          {selectedOverlay && <>
            {selectedOverlay.type === 'text' && <><label className="layer-field">Contenido<textarea value={selectedOverlay.text} onChange={(event) => studio.updateOverlayLayer(selectedOverlay.id, { text: event.target.value })} /></label><div className="layer-inline"><label>Color<input type="color" value={selectedOverlay.color} onChange={(event) => studio.updateOverlayLayer(selectedOverlay.id, { color: event.target.value })} /></label><label>Tamaño %<input type="number" min="1" max="18" step="0.1" value={selectedOverlay.fontSize} onChange={(event) => studio.updateOverlayLayer(selectedOverlay.id, { fontSize: Number(event.target.value) })} /></label></div></>}
            <div className="layer-inline"><label>X %<input type="number" min="0" max="100" value={Number(selectedOverlay.x.toFixed(1))} onChange={(event) => studio.updateOverlayLayer(selectedOverlay.id, { x: Number(event.target.value) })} /></label><label>Y %<input type="number" min="0" max="100" value={Number(selectedOverlay.y.toFixed(1))} onChange={(event) => studio.updateOverlayLayer(selectedOverlay.id, { y: Number(event.target.value) })} /></label></div>
            <label className="range-row">Ancho<output>{selectedOverlay.width.toFixed(0)}%</output><input type="range" min="4" max="100" value={selectedOverlay.width} onChange={(event) => studio.updateOverlayLayer(selectedOverlay.id, { width: Number(event.target.value) })} /></label>
            <label className="range-row">Opacidad<output>{selectedOverlay.opacity}%</output><input type="range" min="0" max="100" value={selectedOverlay.opacity} onChange={(event) => studio.updateOverlayLayer(selectedOverlay.id, { opacity: Number(event.target.value) })} /></label>
            <label className="range-row">Rotación<output>{selectedOverlay.rotation}°</output><input type="range" min="-180" max="180" value={selectedOverlay.rotation} onChange={(event) => studio.updateOverlayLayer(selectedOverlay.id, { rotation: Number(event.target.value) })} /></label>
          </>}
          {selectedMusic && <><p className="audio-layer-name"><Music2 size={13} /> {studio.music.name}</p><label className="range-row">Volumen<output>{studio.music.volume}%</output><input type="range" min="0" max="100" value={studio.music.volume} onChange={(event) => studio.setMusic({ volume: Number(event.target.value) })} /></label><div className="layer-inline"><label>Inicio<input type="number" min="0" max={studio.music.sourceDuration} step="0.1" value={studio.music.start} onChange={(event) => studio.setMusic({ start: Number(event.target.value) })} /><span>s</span></label><label>Duración<input type="number" min="0.1" max={studio.music.sourceDuration} step="0.1" value={Number(studio.music.duration.toFixed(1))} onChange={(event) => studio.setMusic({ duration: Number(event.target.value) })} /><span>s</span></label></div><div className="layer-inline"><label>Entrada<input type="number" min="0" max={studio.music.duration} step="0.1" value={studio.music.fadeIn} onChange={(event) => studio.setMusic({ fadeIn: Number(event.target.value) })} /><span>s</span></label><label>Salida<input type="number" min="0" max={studio.music.duration} step="0.1" value={studio.music.fadeOut} onChange={(event) => studio.setMusic({ fadeOut: Number(event.target.value) })} /><span>s</span></label></div><div className="layer-order-actions audio-actions"><button onClick={() => musicInput.current?.click()}>Reemplazar</button><button className="danger" onClick={() => { if (studio.music.url) URL.revokeObjectURL(studio.music.url); void removeMedia(musicMediaKey); studio.setMusic({ url: null, name: null, sourceDuration: 0 }); if (studio.beatSync.source === 'music') studio.setBeatSync({ enabled: false, analyzedAssetName: null, beats: [], confidence: 0 }); studio.selectLayer('garment') }}>Eliminar música</button></div></>}
          {selectedTiming && <><div className="layer-inline"><label>Inicio<input type="number" min="0" max={studio.duration} step="0.1" value={selectedTiming.start} onChange={(event) => updateTiming({ start: Number(event.target.value) })} /><span>s</span></label><label>Duración<input type="number" min="0.1" max={studio.duration} step="0.1" value={selectedTiming.duration} onChange={(event) => updateTiming({ duration: Number(event.target.value) })} /><span>s</span></label></div><div className="layer-inline"><label>Entrada<select value={selectedTiming.enter} onChange={(event) => updateTiming({ enter: event.target.value as LayerTransition })}>{transitions.map((transition) => <option key={transition} value={transition}>{transitionLabels[transition]}</option>)}</select></label><label>Salida<select value={selectedTiming.exit} onChange={(event) => updateTiming({ exit: event.target.value as LayerTransition })}>{transitions.map((transition) => <option key={transition} value={transition}>{transitionLabels[transition]}</option>)}</select></label></div></>}
          {!selectedMusic && <div className="layer-order-actions"><button disabled={selectedSystem === 'background'} onClick={() => studio.moveLayer(studio.selectedLayerId, 1)}>Subir capa</button><button disabled={selectedSystem === 'background'} onClick={() => studio.moveLayer(studio.selectedLayerId, -1)}>Bajar capa</button>{selectedOverlay && <button className="danger" onClick={removeSelected}>Eliminar</button>}</div>}
        </div>}
      </div>}
    </div>}
  </aside>
}
