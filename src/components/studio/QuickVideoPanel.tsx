import { useStudioStore } from '../../store/studioStore'
import type { QuickCameraMotion, QuickDesignExposure, QuickVideoRhythm, QuickVideoStyle } from '../../types/studio'
import { Clapperboard, Sparkles } from '../icons'

const styles: { id: QuickVideoStyle; label: string; description: string }[] = [
  { id: 'premium', label: 'Premium', description: 'Más tiempo para leer la prenda, movimientos elegantes y transiciones conectadas.' },
  { id: 'editorial', label: 'Editorial', description: 'Limpio, sobrio y centrado en composición y detalle.' },
  { id: 'dynamic', label: 'Dynamic', description: 'Más energía en las salidas sin sacrificar el tiempo de exhibición.' },
]

export function QuickVideoPanel({ onEditAdvanced }: { onEditAdvanced: () => void }) {
  const studio = useStudioStore()
  const settings = studio.quickVideoSettings
  const set = studio.setQuickVideoSettings
  const collectionReady = studio.collectionItems.filter((item) => item.asset.name && item.companionAsset.name).length
  const variantReady = Boolean(studio.variantAssets.large.name && studio.variantAssets.small.name)
  const ready = studio.campaignMode === 'collection' ? collectionReady >= 2 : variantReady

  return <section className="panel quick-video-panel">
    <div className="advanced-section-title"><Sparkles size={15} /><span>Video rápido</span></div>
    <p className="muted">Elige una dirección creativa y GAS3D construye la misma película editable del modo avanzado.</p>

    <div className="advanced-section-title"><span>Estilo</span></div>
    <div className="collection-option-grid">{styles.map((item) => <button key={item.id} type="button" className={settings.style === item.id ? 'collection-option-card active' : 'collection-option-card'} onClick={() => set({ style: item.id })}><span><strong>{item.label}</strong><small>{item.description}</small></span></button>)}</div>

    <label className="select-row">Ritmo<select value={settings.rhythm} onChange={(event) => set({ rhythm: event.target.value as QuickVideoRhythm })}><option value="relaxed">Relajado</option><option value="balanced">Equilibrado</option><option value="dynamic">Dinámico</option></select></label>
    <label className="select-row">Movimiento de cámara<select value={settings.cameraMotion} onChange={(event) => set({ cameraMotion: event.target.value as QuickCameraMotion })}><option value="subtle">Sutil</option><option value="medium">Medio</option><option value="strong">Fuerte</option></select></label>
    <label className="select-row">Tiempo para ver el diseño<select value={settings.designExposure} onChange={(event) => set({ designExposure: event.target.value as QuickDesignExposure })}><option value="longer">Más tiempo</option><option value="normal">Normal</option><option value="faster">Más rápido</option></select></label>
    <label className="select-row">Duración objetivo<select value={settings.targetDuration} onChange={(event) => set({ targetDuration: Number(event.target.value) as 8 | 12 | 15 | 20 })}><option value={8}>≈ 8 s</option><option value={12}>≈ 12 s</option><option value={15}>≈ 15 s</option><option value={20}>≈ 20 s</option></select></label>

    <div className="collection-director-card"><Clapperboard size={16} /><span><strong>{ready ? 'Material listo para dirigir' : 'Falta completar el material'}</strong><small>{studio.campaignMode === 'collection' ? collectionReady + ' pares completos disponibles.' : variantReady ? 'Diseño principal + companion disponibles.' : 'Carga diseño principal y companion.'}</small></span></div>

    <button className="primary-icon-button" disabled={!ready} onClick={() => studio.generateQuickVideo()}><Sparkles size={14} /> Crear película</button>
    <button type="button" onClick={onEditAdvanced}>Editar en modo avanzado</button>
  </section>
}
