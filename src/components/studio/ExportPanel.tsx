import { exportQualities, getExportResolution } from '../../config/exportPresets'
import { useStudioStore } from '../../store/studioStore'

export function ExportPanel() {
  const studio = useStudioStore()
  const recordingBusy = ['preparing', 'preloading', 'warming', 'ready', 'recording', 'finalizing'].includes(studio.recordingStatus)
  const hasAudio = Boolean(studio.music.url || (studio.background.type === 'video' && studio.background.url && studio.background.videoAudioEnabled))
  const resolution = getExportResolution(studio.format, studio.exportQuality)
  const scenes = studio.advancedProjects[studio.activeDirectorId].presentationPlan?.scenes ?? []
  const shotCount = scenes.length; const participantCount = new Set(scenes.flatMap((scene) => scene.itemIds)).size
  return <section className="panel export-panel"><h2>Exportación</h2>
    <p className="muted">WebM · {hasAudio ? 'audio mezclado' : 'sin audio'}</p>
    <p className="presentation-export"><strong>Plan de presentación</strong><span>{shotCount} tomas · {participantCount} {participantCount === 1 ? 'participante' : 'participantes'} · {studio.advancedProjects[studio.activeDirectorId].duration.toFixed(1)}s</span></p>
    <div className="quality-options">{Object.entries(exportQualities).map(([id, quality]) => <button key={id} disabled={recordingBusy} className={studio.exportQuality === id ? 'quality-option active' : 'quality-option'} onClick={() => studio.setExportQuality(id as typeof studio.exportQuality)}><strong>{quality.label}</strong><small>{quality.detail}</small></button>)}</div>
    <label className="select-row">Fotogramas por segundo<select value={studio.exportFps} disabled={recordingBusy} onChange={(event) => studio.setExportFps(Number(event.target.value) as typeof studio.exportFps)}>{[24, 30, 60].map((fps) => <option key={fps} value={fps}>{fps} FPS</option>)}</select></label>
    <p className="export-resolution">Salida real <strong>{resolution.width} × {resolution.height}</strong></p>
    {studio.exportQuality === '4k' && <p className="export-warning">4K exige más GPU y puede tardar en preparar el canvas.</p>}
    <p className="export-header-note">Grabar ejecuta precarga, decodificación y calentamiento de GPU antes de capturar el primer frame.</p>
  </section>
}
