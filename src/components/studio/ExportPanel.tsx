import { exportQualities, getExportResolution } from '../../config/exportPresets'
import { buildProfessionalShotSequence } from '../../config/professionalRecording'
import { useStudioStore } from '../../store/studioStore'
import { AlertTriangle, RefreshCw, X } from '../icons'

export function ExportPanel({ onRetry, onForce, onCancel }: { onRetry?: () => void; onForce?: () => void; onCancel?: () => void }) {
  const studio = useStudioStore()
  const recordingBusy = ['preparing', 'preloading', 'warming', 'ready', 'recording', 'finalizing'].includes(studio.recordingStatus)
  const professional = Boolean(studio.variantAssets.large.url && studio.variantAssets.small.url)
  const hasAudio = Boolean(studio.music.url || (studio.background.type === 'video' && studio.background.url && studio.background.videoAudioEnabled))
  const resolution = getExportResolution(studio.format, studio.exportQuality)
  const shotCount = buildProfessionalShotSequence(studio.activeVariantId, studio.enabledShotTypes).length
  return <section className="panel export-panel"><h2>Exportación</h2>
    <p className="muted">WebM · {hasAudio ? 'audio mezclado' : 'sin audio'}</p>
    {professional && <p className="professional-export"><strong>Workflow profesional</strong><span>{shotCount} tomas activas · 4 variantes · {Math.max(studio.duration, 24)}s</span></p>}
    <div className="quality-options">{Object.entries(exportQualities).map(([id, quality]) => <button key={id} disabled={recordingBusy} className={studio.exportQuality === id ? 'quality-option active' : 'quality-option'} onClick={() => studio.setExportQuality(id as typeof studio.exportQuality)}><strong>{quality.label}</strong><small>{quality.detail}</small></button>)}</div>
    <label className="select-row">Fotogramas por segundo<select value={studio.exportFps} disabled={recordingBusy} onChange={(event) => studio.setExportFps(Number(event.target.value) as typeof studio.exportFps)}>{[24, 30, 60].map((fps) => <option key={fps} value={fps}>{fps} FPS</option>)}</select></label>
    <p className="export-resolution">Salida real <strong>{resolution.width} × {resolution.height}</strong></p>
    {studio.exportQuality === '4k' && <p className="export-warning">4K exige más GPU y puede tardar en preparar el canvas.</p>}
    {studio.recordingStatus === 'error' && <div className="preflight-error-actions"><button onClick={onRetry}><RefreshCw size={13} /> Reintentar</button><button className="warning" onClick={onForce}><AlertTriangle size={13} /> Grabar de todas formas</button><button onClick={onCancel}><X size={13} /> Cancelar</button></div>}
    <p className="export-header-note">Grabar ejecuta precarga, decodificación y calentamiento de GPU antes de capturar el primer frame.</p>
  </section>
}
