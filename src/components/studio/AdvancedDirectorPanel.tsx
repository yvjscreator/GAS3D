import { directorDefinitions } from '../../config/advancedDirectors'
import { garmentVariantPresets } from '../../config/garmentVariants'
import { useStudioStore } from '../../store/studioStore'
import type { CameraViewSettings, LayerTransition, VariantCameraPreset } from '../../types/studio'
import { Aperture, Frame, Grid2X2, Rotate3D, Save } from '../icons'

const alignmentPoints: [number, number][] = [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]
const transitions: { id: LayerTransition; label: string }[] = [{ id: 'none', label: 'Sin transición' }, { id: 'fade', label: 'Fundido' }, { id: 'slideLeft', label: 'Desde izquierda' }, { id: 'slideRight', label: 'Desde derecha' }, { id: 'slideUp', label: 'Desde abajo' }, { id: 'zoom', label: 'Zoom suave' }]

export function AdvancedDirectorPanel({ framing, draft, onBeginFraming, onCancelFraming, onSaveFraming, onDraftFov, onDraftComposition }: {
  framing: boolean
  draft: VariantCameraPreset
  onBeginFraming: () => void
  onCancelFraming: () => void
  onSaveFraming: (view?: CameraViewSettings) => void
  onDraftFov: (value: number) => void
  onDraftComposition: (value: [number, number]) => void
}) {
  const studio = useStudioStore(); const project = studio.advancedProjects[studio.activeDirectorId]
  const collectionMode = studio.campaignMode === 'collection'
  const collectionItem = studio.collectionItems.find((item) => item.id === studio.activeCollectionItemId) ?? studio.collectionItems[0] ?? null
  const label = collectionMode ? collectionItem?.label : project.labels[studio.activeVariantId]
  const updateLabel = (value: Partial<NonNullable<typeof label>>) => {
    if (collectionMode && collectionItem) studio.updateCollectionItem(collectionItem.id, { label: { ...collectionItem.label, ...value } })
    else studio.updateVariantLabel(studio.activeVariantId, value)
  }
  return <div className="panel advanced-director-panel">
    <div className="advanced-section-title"><Rotate3D size={14} /><span>Tipo de director</span></div>
    {collectionMode ? <div className="collection-director-card"><Grid2X2 size={16} /><span><strong>Colección automática</strong><small>Cada grupo se presenta en cuadrícula y luego sus diseños giran uno por uno.</small></span></div> : <div className="director-type-grid">{directorDefinitions.map((definition) => <button key={definition.id} className={studio.activeDirectorId === definition.id ? 'active' : ''} onClick={() => studio.setActiveDirectorId(definition.id)}>
      {definition.id === 'grid2x2' ? <Grid2X2 size={15} /> : <Aperture size={15} />}<span><strong>{definition.name}</strong><small>{definition.description}</small></span>
    </button>)}</div>}
    <div className="advanced-section-title"><Frame size={14} /><span>{collectionMode ? 'Encuadre por diseño' : 'Encuadre por variante'}</span></div>
    <div className="advanced-variant-tabs">{collectionMode ? studio.collectionItems.map((item, index) => <button key={item.id} className={studio.activeCollectionItemId === item.id ? 'active' : ''} onClick={() => studio.setActiveCollectionItemId(item.id)}>{index + 1}</button>) : garmentVariantPresets.map((variant, index) => <button key={variant.id} className={studio.activeVariantId === variant.id ? 'active' : ''} onClick={() => studio.setActiveVariantId(variant.id)}>{index + 1}</button>)}</div>
    <p className="advanced-current-variant">{collectionMode ? collectionItem?.name ?? 'Agrega un diseño a la colección' : garmentVariantPresets.find((variant) => variant.id === studio.activeVariantId)?.label}</p>
    <div className="framing-actions">
      {!framing ? <button className="primary-icon-button" disabled={collectionMode && !collectionItem} onClick={onBeginFraming}><Frame size={14} /> Modo encuadre</button> : <><button className="save-framing" onClick={() => onSaveFraming()}><Save size={14} /> Guardar</button><button onClick={onCancelFraming}>Cancelar</button></>}
    </div>
    <label className="range-row">Campo de visión<output>{draft.fov.toFixed(0)}°</output><input type="range" min="22" max="55" value={draft.fov} onChange={(event) => onDraftFov(Number(event.target.value))} /></label>
    <div className="composition-control"><span>Posición en el cuadro</span><div className="composition-grid">{alignmentPoints.map(([x, y]) => <button key={`${x}-${y}`} className={draft.composition[0] === x && draft.composition[1] === y ? 'active' : ''} onClick={() => onDraftComposition([x, y])} aria-label={`Encuadre ${x}, ${y}`}><i /></button>)}</div></div>
    {label && <><div className="advanced-section-title label-title"><span>Etiqueta diferenciadora</span></div>
    <label className="layer-field">Texto<textarea value={label.text} onChange={(event) => updateLabel({ text: event.target.value })} /></label>
    <label className="select-row">Fuente<select value={label.fontFamily} onChange={(event) => updateLabel({ fontFamily: event.target.value })}><option value="Manrope">Manrope</option><option value="DM Mono">DM Mono</option><option value="Arial">Arial</option><option value="Georgia">Georgia</option></select></label>
    <div className="layer-inline"><label>Color<input type="color" value={label.color} onChange={(event) => updateLabel({ color: event.target.value })} /></label><label>Fondo<input type="color" value={label.backgroundColor} onChange={(event) => updateLabel({ backgroundColor: event.target.value })} /></label></div>
    <div className="layer-inline"><label>Borde<input type="color" value={label.borderColor} onChange={(event) => updateLabel({ borderColor: event.target.value })} /></label><label>Radio px<input type="number" min="0" max="40" value={label.borderRadius} onChange={(event) => updateLabel({ borderRadius: Number(event.target.value) })} /></label></div>
    <div className="layer-inline"><label>Tamaño %<input type="number" min="1" max="10" step=".1" value={label.fontSize} onChange={(event) => updateLabel({ fontSize: Number(event.target.value) })} /></label><label>Opacidad %<input type="number" min="0" max="100" value={label.backgroundOpacity} onChange={(event) => updateLabel({ backgroundOpacity: Number(event.target.value) })} /></label></div>
    <div className="layer-inline"><label>X %<input type="number" min="0" max="100" value={label.x} onChange={(event) => updateLabel({ x: Number(event.target.value) })} /></label><label>Y %<input type="number" min="0" max="100" value={label.y} onChange={(event) => updateLabel({ y: Number(event.target.value) })} /></label></div>
    <div className="layer-inline"><label>Entrada<select value={label.enter} onChange={(event) => updateLabel({ enter: event.target.value as LayerTransition })}>{transitions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label>Salida<select value={label.exit} onChange={(event) => updateLabel({ exit: event.target.value as LayerTransition })}>{transitions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label></div></>}
  </div>
}
