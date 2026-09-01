import { useEffect, useMemo, useState } from 'react'
import { useStudioStore } from '../../store/studioStore'
import type { BeatSyncSource, BeatSyncStyle } from '../../types/studio'
import { analyzeBeatBlob, beatDuration, cueDuration, hasBeatMap } from '../../utils/beatSync'
import { backgroundMediaKey, loadMedia, musicMediaKey } from '../../utils/mediaStorage'
import { AudioLines, RefreshCw } from '../icons'
import { ResponsiveOptionGrid } from '../ui'

const styleLabels: Record<BeatSyncStyle, { name: string; description: string }> = {
  elegant: { name: 'Elegante', description: 'Movimientos largos y suaves entre compases.' },
  dynamic: { name: 'Dinámico', description: 'Giros claros con cambios marcados por el ritmo.' },
  impact: { name: 'Impacto', description: 'Arranques rápidos sobre cada golpe principal.' },
}

export function BeatSyncPanel() {
  const studio = useStudioStore()
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const musicAvailable = Boolean(studio.music.name)
  const backgroundAvailable = studio.background.type === 'video' && Boolean(studio.background.name)
  const source = musicAvailable && !backgroundAvailable ? 'music' : backgroundAvailable && !musicAvailable ? 'background' : studio.beatSync.source
  const sourceName = source === 'music' ? studio.music.name : studio.background.name
  const estimatedDuration = useMemo(() => studio.advancedProjects[studio.activeDirectorId].duration, [studio.activeDirectorId, studio.advancedProjects])
  useEffect(() => { if ((musicAvailable || backgroundAvailable) && studio.beatSync.source !== source) studio.setBeatSync({ source, analyzedAssetName: null, confidence: 0, beats: [] }) }, [backgroundAvailable, musicAvailable, source, studio])

  const selectSource = (source: BeatSyncSource) => {
    studio.setBeatSync({ source, analyzedAssetName: null, confidence: 0, beats: [] })
    setMessage(null)
  }
  const analyze = async () => {
    setAnalyzing(true); setAnalysisProgress(0); setMessage(null)
    try {
      const key = source === 'music' ? musicMediaKey : backgroundMediaKey
      const blob = await loadMedia(key)
      if (!blob || !sourceName) throw new Error('Primero carga el audio que quieres analizar.')
      const result = await analyzeBeatBlob(blob, studio.beatSync.sensitivity, setAnalysisProgress)
      studio.setBeatSync({ ...result, enabled: true, analyzedAssetName: sourceName })
      if (source === 'music' && studio.music.sourceDuration > studio.music.duration) studio.setMusic({ duration: studio.music.sourceDuration })
      setMessage(`Ritmo detectado: ${result.bpm.toFixed(1)} BPM · confianza ${Math.round(result.confidence * 100)}%.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo analizar el ritmo.')
    } finally { setAnalyzing(false); setAnalysisProgress(0) }
  }
  const stale = Boolean(studio.beatSync.analyzedAssetName && studio.beatSync.analyzedAssetName !== sourceName)

  return <section className="panel beat-sync-panel"><h2>Sincronización musical</h2>
    <label className="toggle-row beat-master"><input type="checkbox" checked={studio.beatSync.enabled} onChange={(event) => studio.setBeatSync({ enabled: event.target.checked })} /><span><strong>Animar al ritmo</strong><small>Alinea los cambios de toma y movimientos con el audio analizado.</small></span></label>
    {musicAvailable && backgroundAvailable && <div className="beat-source-tabs" role="group" aria-label="Audio para analizar"><button className={source === 'music' ? 'active' : ''} onClick={() => selectSource('music')}>Música</button><button className={source === 'background' ? 'active' : ''} onClick={() => selectSource('background')}>Audio del fondo</button></div>}
    {!musicAvailable && !backgroundAvailable && <p className="beat-empty">Carga música arriba o selecciona un fondo de video para detectar automáticamente el ritmo.</p>}
    {source === 'background' && backgroundAvailable && !studio.background.videoAudioEnabled && <p className="beat-warning">La animación seguirá este video, pero su audio no se exportará hasta activar “Usar audio del video”.</p>}
    {sourceName && <div className="beat-analysis-card"><AudioLines size={18} /><span><strong>{sourceName}</strong><small>{analyzing && analysisProgress > 0 ? `Leyendo pista del video · ${Math.round(analysisProgress * 100)}%` : studio.beatSync.analyzedAssetName && !stale ? `${studio.beatSync.bpm.toFixed(1)} BPM · ${studio.beatSync.beats.length} golpes` : 'Pendiente de análisis'}</small></span><button disabled={analyzing} onClick={() => void analyze()}>{analyzing ? `Analizando${analysisProgress > 0 ? ` ${Math.round(analysisProgress * 100)}%` : '…'}` : <><RefreshCw size={12} /> Analizar</>}</button></div>}
    {stale && <p className="beat-warning">El archivo cambió. Vuelve a analizarlo para actualizar los golpes.</p>}
    {message && <p className={message.startsWith('Ritmo') ? 'success' : 'error'}>{message}</p>}
    <details className="beat-advanced"><summary>Avanzado</summary><div className="layer-inline beat-numbers"><label>BPM manual<input type="number" min="40" max="240" step=".1" value={studio.beatSync.bpm} onChange={(event) => studio.setBeatSync({ bpm: Math.min(240, Math.max(40, Number(event.target.value))), beats: [], confidence: 0, analyzedAssetName: null })} /></label><label>Primer golpe<input type="number" min="0" max="10" step=".01" value={studio.beatSync.offset} onChange={(event) => studio.setBeatSync({ offset: Math.max(0, Number(event.target.value)), beats: [], analyzedAssetName: null })} /><span>s</span></label></div></details>
    <label className="select-row">Cambio de toma cada<select value={studio.beatSync.barsPerChange} onChange={(event) => studio.setBeatSync({ barsPerChange: Number(event.target.value) as 1 | 2 | 4 | 8 })}>{[1, 2, 4, 8].map((bars) => <option key={bars} value={bars}>{bars} {bars === 1 ? 'compás' : 'compases'}</option>)}</select></label>
    <ResponsiveOptionGrid minWidth={120} className="beat-style-grid">{(Object.keys(styleLabels) as BeatSyncStyle[]).map((style) => <button key={style} className={studio.beatSync.style === style ? 'active' : ''} onClick={() => studio.setBeatSync({ style })}><strong>{styleLabels[style].name}</strong><small>{styleLabels[style].description}</small></button>)}</ResponsiveOptionGrid>
    <label className="range-row">Sensibilidad<output>{studio.beatSync.sensitivity}%</output><input type="range" min="10" max="95" value={studio.beatSync.sensitivity} onChange={(event) => studio.setBeatSync({ sensitivity: Number(event.target.value) })} /></label>
    {studio.campaignMode === 'collection' && <label className="toggle-row beat-stagger"><input type="checkbox" checked={studio.beatSync.stagger} onChange={(event) => studio.setBeatSync({ stagger: event.target.checked })} /><span><strong>Entrada escalonada</strong><small>Cada remera aparece en el siguiente golpe.</small></span></label>}
    {hasBeatMap(studio.beatSync) && <p className="beat-summary"><strong>{studio.beatSync.bpm.toFixed(1)} BPM</strong><span>Golpe cada {beatDuration(studio.beatSync).toFixed(2)}s</span><span>Toma cada {cueDuration(studio.beatSync).toFixed(2)}s</span><span>Video estimado {estimatedDuration.toFixed(1)}s</span></p>}
  </section>
}
