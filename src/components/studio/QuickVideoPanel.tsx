import { useStudioStore } from '../../store/studioStore'
import type { QuickCameraMotion, QuickDesignExposure, QuickVideoRhythm, QuickVideoStyle } from '../../types/studio'
import { ChevronRight, Clapperboard, Frame, Image, Images, Music2, Sparkles, Zap } from '../icons'
import { SelectableCard } from '../ui'

type QuickWorkspace = 'designs' | 'scene' | 'audio'

const styles = [
  { id: 'premium', label: 'Premium', eyebrow: '01 / ELEGANCIA', description: 'Exhibición pausada, órbitas suaves y transiciones fluidas.', icon: Sparkles },
  { id: 'editorial', label: 'Editorial', eyebrow: '02 / DETALLE', description: 'Encuadres limpios y acercamientos al estampado.', icon: Frame },
  { id: 'dynamic', label: 'Dynamic', eyebrow: '03 / IMPACTO', description: 'Más energía en las salidas, sin perder lectura del diseño.', icon: Zap },
] as const

export function QuickVideoPanel({ onEditAdvanced, onOpenWorkspace }: {
  onEditAdvanced: () => void
  onOpenWorkspace: (workspace: QuickWorkspace) => void
}) {
  const studio = useStudioStore()
  const settings = studio.quickVideoSettings
  const set = studio.setQuickVideoSettings
  const collectionReady = studio.collectionItems.filter((item) => item.asset.name && item.companionAsset.name).length
  const variantReady = Boolean(studio.variantAssets.large.name && studio.variantAssets.small.name)
  const ready = studio.campaignMode === 'collection' ? collectionReady >= 2 : variantReady
  const backgroundReady = studio.background.type !== 'color' && Boolean(studio.background.name)
  const audioReady = Boolean(studio.music.name || (studio.background.type === 'video' && studio.background.videoAudioEnabled))

  return <div className="quick-video-panel">
    <header className="quick-panel-header">
      <div>
        <div className="quick-eyebrow"><Sparkles size={15} /> DIRECTOR AUTOMÁTICO</div>
        <h2>Tu video, con dirección de marca.</h2>
        <p>Selecciona el estilo y el ritmo. GAS3D prepara una película editable con el tiempo de exhibición que merece cada diseño.</p>
      </div>
      <span className="quick-header-note">3 estilos · 4 controles</span>
    </header>

    <section className="quick-section" aria-labelledby="quick-material-heading">
      <div className="quick-section-heading"><div><span className="quick-step">01</span><strong id="quick-material-heading">Material</strong></div><small>Abre cualquier apartado para cambiarlo</small></div>
      <div className="quick-resource-grid">
        <button type="button" className="quick-resource-card" onClick={() => onOpenWorkspace('designs')}>
          <Images size={19} /><span><strong>Diseños</strong><small>{studio.campaignMode === 'collection' ? collectionReady + ' pares completos' : variantReady ? 'Principal + companion' : 'Completar estampados'}</small></span><ChevronRight size={15} />
        </button>
        <button type="button" className="quick-resource-card" onClick={() => onOpenWorkspace('scene')}>
          <Image size={19} /><span><strong>Escena</strong><small>{backgroundReady ? 'Fondo cargado' : studio.background.type === 'color' ? 'Fondo de color' : 'Seleccionar fondo'}</small></span><ChevronRight size={15} />
        </button>
        <button type="button" className="quick-resource-card" onClick={() => onOpenWorkspace('audio')}>
          <Music2 size={19} /><span><strong>Audio</strong><small>{audioReady ? 'Fuente de audio lista' : 'Sin música seleccionada'}</small></span><ChevronRight size={15} />
        </button>
      </div>
    </section>

    <section className="quick-section" aria-labelledby="quick-style-heading">
      <div className="quick-section-heading"><div><span className="quick-step">02</span><strong id="quick-style-heading">Estilo de campaña</strong></div><small>Elige una dirección creativa</small></div>
      <div className="quick-style-grid" role="group" aria-label="Estilo del video">
        {styles.map(({ id, label, eyebrow, description, icon: Icon }) => (
          <SelectableCard key={id} selected={settings.style === id} onClick={() => set({ style: id as QuickVideoStyle })} className="quick-style-card">
            <span className="quick-style-head"><span className="quick-style-icon"><Icon size={19} /></span><span className="quick-style-index">{eyebrow}</span></span>
            <strong>{label}</strong>
            <small>{description}</small>
          </SelectableCard>
        ))}
      </div>
    </section>

    <section className="quick-section" aria-labelledby="quick-settings-heading">
      <div className="quick-section-heading"><div><span className="quick-step">03</span><strong id="quick-settings-heading">Ajustes de dirección</strong></div><small>El director se encarga del resto</small></div>
      <div className="quick-controls-grid">
        <label className="quick-field"><span>Ritmo</span><select value={settings.rhythm} onChange={(event) => set({ rhythm: event.target.value as QuickVideoRhythm })}><option value="relaxed">Relajado</option><option value="balanced">Equilibrado</option><option value="dynamic">Dinámico</option></select></label>
        <label className="quick-field"><span>Movimiento de cámara</span><select value={settings.cameraMotion} onChange={(event) => set({ cameraMotion: event.target.value as QuickCameraMotion })}><option value="subtle">Sutil</option><option value="medium">Medio</option><option value="strong">Fuerte</option></select></label>
        <label className="quick-field"><span>Tiempo de exhibición</span><select value={settings.designExposure} onChange={(event) => set({ designExposure: event.target.value as QuickDesignExposure })}><option value="longer">Más tiempo</option><option value="normal">Normal</option><option value="faster">Más rápido</option></select></label>
        <label className="quick-field"><span>Duración aproximada</span><select value={settings.targetDuration} onChange={(event) => set({ targetDuration: Number(event.target.value) as 8 | 12 | 15 | 20 })}><option value={8}>≈ 8 segundos</option><option value={12}>≈ 12 segundos</option><option value={15}>≈ 15 segundos</option><option value={20}>≈ 20 segundos</option></select></label>
      </div>
    </section>

    <footer className="quick-finish">
      <div className="quick-finish-status"><Clapperboard size={18} /><span><strong>{ready ? 'Material listo para dirigir' : 'Completa los diseños para continuar'}</strong><small>{ready ? 'Después de crear la película, usa PREVIEW para verla.' : 'Abre Diseños y carga el arte principal y companion.'}</small></span></div>
      <div className="quick-finish-actions">
        <button type="button" className="quick-action-secondary" onClick={onEditAdvanced}>Editor avanzado <ChevronRight size={15} /></button>
        <button type="button" className="quick-action-primary" disabled={!ready} onClick={() => studio.generateQuickVideo()}><Sparkles size={16} /> Crear película</button>
      </div>
    </footer>
  </div>
}
