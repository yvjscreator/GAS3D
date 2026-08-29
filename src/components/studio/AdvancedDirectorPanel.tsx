import { directorShotDefinitions } from '../../config/directorShots'
import { collectionTransitionDefinitions, garmentMotionDefinitions } from '../../config/garmentMotions'
import { useStudioStore } from '../../store/studioStore'
import type { CameraViewSettings, LayerTransition, PresentationMode, VariantCameraPreset } from '../../types/studio'
import { Aperture, ArrowLeft, ArrowRight, ArrowUp, Blend, Eye, EyeOff, Frame, Grid2X2, Orbit, Repeat2, Rotate3D, RotateCcw, RotateCw, Save, Scissors, Search, Sparkles, Split, Zap, ZoomIn } from '../icons'
import { MasterDetailLayout, ResponsiveOptionGrid, SegmentedControl } from '../ui'

const alignmentPoints: [number, number][] = [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]
const transitions: { id: LayerTransition; label: string }[] = [{ id: 'none', label: 'Sin transición' }, { id: 'fade', label: 'Fundido' }, { id: 'slideLeft', label: 'Desde izquierda' }, { id: 'slideRight', label: 'Desde derecha' }, { id: 'slideUp', label: 'Desde abajo' }, { id: 'zoom', label: 'Zoom suave' }]
const shotIcons = { groupShowcase: Grid2X2, itemShowcase: Rotate3D, hero: Sparkles, detailLarge: Search, detailSmall: Aperture }
const transitionIcons = { none: Scissors, fade: Blend, slideLeft: ArrowLeft, slideRight: ArrowRight, slideUp: ArrowUp, zoom: ZoomIn }
const motionIcons = { turntableRight: RotateCw, turntableLeft: RotateCcw, whipCompanion: Zap, heroArc: Orbit, detailPush: Search, companionReveal: Repeat2 }

export function AdvancedDirectorPanel({ framing, draft, onBeginFraming, onCancelFraming, onSaveFraming, onResetFraming, onDraftFov, onDraftComposition }: {
  framing: boolean
  draft: VariantCameraPreset
  onBeginFraming: () => void
  onCancelFraming: () => void
  onSaveFraming: (view?: CameraViewSettings) => void
  onResetFraming: () => void
  onDraftFov: (value: number) => void
  onDraftComposition: (value: [number, number]) => void
}) {
  const studio = useStudioStore()
  const collectionMode = studio.campaignMode === 'collection'
  const collectionItem = studio.collectionItems.find((item) => item.id === studio.activeCollectionItemId) ?? studio.collectionItems[0] ?? null
  const designCombination = studio.designCombinations.find((item) => item.id === studio.activeDesignCombinationId) ?? studio.designCombinations[0]
  const label = collectionMode ? collectionItem?.label : designCombination?.label
  const updateLabel = (value: Partial<NonNullable<typeof label>>) => {
    if (collectionMode && collectionItem) studio.updateCollectionItem(collectionItem.id, { label: { ...collectionItem.label, ...value } })
    else if (designCombination) studio.updateDesignCombination(designCombination.id, { label: { ...designCombination.label, ...value } })
  }
  const directionMaster = <div className="direction-master"><div className="advanced-section-title"><Rotate3D size={14} /><span>Tipo de director</span></div>
    <SegmentedControl label="Modo de presentación" value={studio.presentationMode} onChange={(value: PresentationMode) => studio.setPresentationMode(value)} options={[{ value: 'grouped', label: 'Agrupado', icon: Grid2X2 }, { value: 'sequential', label: 'Secuencial', icon: Split }, { value: 'mixed', label: 'Mixto', icon: Repeat2 }]} />
    <div className="collection-director-card"><Grid2X2 size={16} /><span><strong>Planificador automático</strong><small>{studio.presentationMode === 'grouped' ? `Presenta ${collectionMode ? 'diseños' : 'variantes'} en grupos equilibrados de hasta cuatro prendas.` : studio.presentationMode === 'sequential' ? `Presenta cada ${collectionMode ? 'diseño' : 'variante'} individualmente y en orden.` : 'Combina la presentación agrupada con tomas individuales.'}</small></span></div>
    <div className="advanced-section-title"><Aperture size={14} /><span>Tomas incluidas</span></div>
    <ResponsiveOptionGrid minWidth={170} className="director-shot-grid">{directorShotDefinitions.map((shot) => { const Icon = shotIcons[shot.id]; return <label key={shot.id} className="collection-option-card"><input type="checkbox" checked={studio.enabledShotTypes.includes(shot.id)} onChange={() => studio.toggleShotType(shot.id)} /><Icon size={16} /><span><strong>{shot.name}</strong><small>{shot.description}</small></span></label> })}</ResponsiveOptionGrid>
    {!studio.enabledShotTypes.length && <p className="advanced-current-variant">Activa al menos una toma para construir la película.</p>}
    <div className="advanced-section-title"><Rotate3D size={14} /><span>Movimientos disponibles</span></div>
    <ResponsiveOptionGrid minWidth={170}>{garmentMotionDefinitions.map((motion) => { const Icon = motionIcons[motion.id]; return <label key={motion.id} className="collection-option-card"><input type="checkbox" checked={studio.collectionMotionIds.includes(motion.id)} onChange={() => studio.toggleCollectionMotion(motion.id)} /><Icon size={16} /><span><strong>{motion.name}</strong><small>{motion.description}</small></span></label> })}</ResponsiveOptionGrid>
    <div className="advanced-section-title"><Blend size={14} /><span>Transiciones disponibles</span></div>
    <ResponsiveOptionGrid minWidth={170}>{([{ id: 'none' as const, name: 'Corte limpio', description: 'Cambio directo, preciso y sin efecto.' }, ...collectionTransitionDefinitions]).map((transition) => { const Icon = transitionIcons[transition.id]; return <label key={transition.id} className="collection-option-card"><input type="checkbox" checked={studio.collectionTransitionIds.includes(transition.id)} onChange={() => studio.toggleCollectionTransition(transition.id)} /><Icon size={16} /><span><strong>{transition.name}</strong><small>{transition.description}</small></span></label> })}</ResponsiveOptionGrid>
    <div className="advanced-section-title"><Frame size={14} /><span>{collectionMode ? 'Diseños' : 'Combinaciones'}</span></div>
    <div className="advanced-variant-tabs">{collectionMode ? studio.collectionItems.map((item, index) => <button key={item.id} className={studio.activeCollectionItemId === item.id ? 'active' : ''} onClick={() => studio.setActiveCollectionItemId(item.id)}>{index + 1}</button>) : studio.designCombinations.map((combination, index) => <button key={combination.id} className={studio.activeDesignCombinationId === combination.id ? 'active' : ''} onClick={() => studio.setActiveDesignCombinationId(combination.id)} disabled={!combination.enabled}>{index + 1}</button>)}</div>
    <p className="advanced-current-variant">{collectionMode ? collectionItem?.name ?? 'Agrega un diseño a la colección' : designCombination?.name ?? 'Crea una combinación de estampados'}</p></div>
  const directionInspector = <div className="direction-inspector"><div className="advanced-section-title"><Frame size={14} /><span>{collectionMode ? 'Encuadre por diseño' : 'Encuadre por combinación'}</span></div>
    <div className="framing-actions">
      {!framing ? <><button className="primary-icon-button" disabled={collectionMode && !collectionItem} onClick={onBeginFraming}><Frame size={14} /> Modo encuadre</button><button disabled={collectionMode && !collectionItem} onClick={onResetFraming} title="Volver al encuadre predeterminado"><RotateCcw size={14} /> Restablecer</button></> : <><button className="save-framing" onClick={() => onSaveFraming()}><Save size={14} /> Guardar</button><button onClick={onCancelFraming}>Cancelar</button></>}
    </div>
    <label className="range-row">Campo de visión<output>{draft.fov.toFixed(0)}°</output><input type="range" min="22" max="55" value={draft.fov} onChange={(event) => onDraftFov(Number(event.target.value))} /></label>
    <div className="composition-control"><span>Posición en el cuadro</span><div className="composition-grid">{alignmentPoints.map(([x, y]) => <button key={`${x}-${y}`} className={draft.composition[0] === x && draft.composition[1] === y ? 'active' : ''} onClick={() => onDraftComposition([x, y])} aria-label={`Encuadre ${x}, ${y}`}><i /></button>)}</div></div>
    {label && <><div className="advanced-section-title label-title"><span>Etiqueta diferenciadora</span><label className="inline-switch"><input type="checkbox" checked={label.enabled} onChange={(event) => updateLabel({ enabled: event.target.checked })} />{label.enabled ? <Eye size={13} /> : <EyeOff size={13} />} Mostrar</label></div>
    <div className="label-batch-actions"><button onClick={() => collectionMode ? studio.collectionItems.forEach((item) => studio.updateCollectionItem(item.id, { label: { ...item.label, enabled: true } })) : studio.designCombinations.forEach((item) => studio.updateDesignCombination(item.id, { label: { ...item.label, enabled: true } }))}><Eye size={13} /> Activar todas</button><button onClick={() => collectionMode ? studio.collectionItems.forEach((item) => studio.updateCollectionItem(item.id, { label: { ...item.label, enabled: false } })) : studio.designCombinations.forEach((item) => studio.updateDesignCombination(item.id, { label: { ...item.label, enabled: false } }))}><EyeOff size={13} /> Desactivar todas</button></div>
    {label.enabled && <>
    <label className="layer-field">Texto<textarea value={label.text} onChange={(event) => updateLabel({ text: event.target.value })} /></label>
    <label className="select-row">Fuente<select value={label.fontFamily} onChange={(event) => updateLabel({ fontFamily: event.target.value })}><option value="Manrope">Manrope</option><option value="DM Mono">DM Mono</option><option value="Arial">Arial</option><option value="Georgia">Georgia</option></select></label>
    <div className="layer-inline"><label>Color<input type="color" value={label.color} onChange={(event) => updateLabel({ color: event.target.value })} /></label><label className="inline-switch"><input type="checkbox" checked={label.backgroundEnabled} onChange={(event) => updateLabel({ backgroundEnabled: event.target.checked })} /> Fondo</label></div>
    {label.backgroundEnabled && <div className="layer-inline"><label>Color del fondo<input type="color" value={label.backgroundColor} onChange={(event) => updateLabel({ backgroundColor: event.target.value })} /></label><label>Opacidad %<input type="number" min="0" max="100" value={label.backgroundOpacity} onChange={(event) => updateLabel({ backgroundOpacity: Number(event.target.value) })} /></label></div>}
    <div className="layer-inline"><label className="inline-switch"><input type="checkbox" checked={label.borderEnabled} onChange={(event) => updateLabel({ borderEnabled: event.target.checked })} /> Borde</label><label>Radio px<input type="number" min="0" max="40" value={label.borderRadius} onChange={(event) => updateLabel({ borderRadius: Number(event.target.value) })} /></label></div>
    {label.borderEnabled && <div className="layer-inline"><label>Color del borde<input type="color" value={label.borderColor} onChange={(event) => updateLabel({ borderColor: event.target.value })} /></label><label>Grosor px<input type="number" min="0" max="8" step=".5" value={label.borderWidth} onChange={(event) => updateLabel({ borderWidth: Number(event.target.value) })} /></label></div>}
    <label className="layer-field">Tamaño %<input type="number" min="1" max="10" step=".1" value={label.fontSize} onChange={(event) => updateLabel({ fontSize: Number(event.target.value) })} /></label>
    <div className="layer-inline"><label>X %<input type="number" min="0" max="100" value={label.x} onChange={(event) => updateLabel({ x: Number(event.target.value) })} /></label><label>Y %<input type="number" min="0" max="100" value={label.y} onChange={(event) => updateLabel({ y: Number(event.target.value) })} /></label></div>
    <div className="layer-inline"><label>Entrada<select value={label.enter} onChange={(event) => updateLabel({ enter: event.target.value as LayerTransition })}>{transitions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label>Salida<select value={label.exit} onChange={(event) => updateLabel({ exit: event.target.value as LayerTransition })}>{transitions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label></div>
    <div className="label-effect-toggles"><label className="inline-switch"><input type="checkbox" checked={label.shadowEnabled} onChange={(event) => updateLabel({ shadowEnabled: event.target.checked })} /> Sombra</label><label className="inline-switch"><input type="checkbox" checked={label.backdropBlurEnabled} disabled={!label.backgroundEnabled} onChange={(event) => updateLabel({ backdropBlurEnabled: event.target.checked })} /> Desenfoque de fondo</label></div></>}</>}</div>
  return <div className="panel advanced-director-panel"><MasterDetailLayout className="director-workspace" master={directionMaster} detail={directionInspector} /></div>
}
