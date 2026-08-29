import { useRef, useState } from 'react'
import { useStudioStore } from '../../store/studioStore'
import { musicMediaKey, removeMedia, storeMedia } from '../../utils/mediaStorage'
import { AudioLines, Music2, Plus, RefreshCw, Trash2, Video, Volume2 } from '../icons'
import { BeatSyncPanel } from './BeatSyncPanel'

export function AudioPanel() {
  const studio = useStudioStore()
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const backgroundAudioAvailable = studio.background.type === 'video' && Boolean(studio.background.url)
  const selectMusic = (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|aac|m4a)$/i.test(file.name)) { setError('Carga un archivo MP3, WAV, AAC u OGG.'); return }
    const url = URL.createObjectURL(file)
    const probe = new Audio()
    probe.onloadedmetadata = () => {
      const sourceDuration = Number.isFinite(probe.duration) ? probe.duration : studio.duration
      if (studio.music.url) URL.revokeObjectURL(studio.music.url)
      studio.setMusic({ url, name: file.name, sourceDuration, start: 0, duration: sourceDuration, fadeIn: .5, fadeOut: .8 })
      if (studio.beatSync.source === 'music') studio.setBeatSync({ analyzedAssetName: null, beats: [], confidence: 0 })
      studio.selectLayer('music'); setError(null); probe.removeAttribute('src')
      void storeMedia(musicMediaKey, file).catch(() => setError('No se pudo guardar la música para la próxima sesión.'))
    }
    probe.onerror = () => { URL.revokeObjectURL(url); setError('No se pudo leer el archivo de audio.') }
    probe.preload = 'metadata'; probe.src = url
  }
  const removeMusic = () => {
    if (studio.music.url) URL.revokeObjectURL(studio.music.url)
    void removeMedia(musicMediaKey)
    studio.setMusic({ url: null, name: null, sourceDuration: 0 })
    if (studio.beatSync.source === 'music') studio.setBeatSync({ enabled: false, analyzedAssetName: null, beats: [], confidence: 0 })
    studio.selectLayer('garment')
  }
  return <div className="audio-workspace">
    <section className="panel audio-source-panel"><h2><Music2 size={15} /> Música</h2>
      <input hidden ref={input} type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/aac,.m4a" onChange={(event) => { selectMusic(event.target.files?.[0]); event.currentTarget.value = '' }} />
      {studio.music.url ? <><div className="audio-source-card"><AudioLines size={20} /><span><strong>{studio.music.name}</strong><small>{studio.music.sourceDuration.toFixed(1)} segundos de audio</small></span><button onClick={() => input.current?.click()}><RefreshCw size={13} /> Reemplazar</button></div>
        <label className="range-row">Volumen<output>{studio.music.volume}%</output><input type="range" min="0" max="100" value={studio.music.volume} onChange={(event) => studio.setMusic({ volume: Number(event.target.value) })} /></label>
        <div className="layer-inline"><label>Inicio<input type="number" min="0" max={studio.music.sourceDuration} step="0.1" value={studio.music.start} onChange={(event) => studio.setMusic({ start: Number(event.target.value) })} /><span>s</span></label><label>Duración<input type="number" min="0.1" max={studio.music.sourceDuration} step="0.1" value={Number(studio.music.duration.toFixed(1))} onChange={(event) => studio.setMusic({ duration: Number(event.target.value) })} /><span>s</span></label></div>
        <div className="layer-inline"><label>Fade in<input type="number" min="0" max={studio.music.duration} step="0.1" value={studio.music.fadeIn} onChange={(event) => studio.setMusic({ fadeIn: Number(event.target.value) })} /><span>s</span></label><label>Fade out<input type="number" min="0" max={studio.music.duration} step="0.1" value={studio.music.fadeOut} onChange={(event) => studio.setMusic({ fadeOut: Number(event.target.value) })} /><span>s</span></label></div>
        <button className="danger text-button" onClick={removeMusic}><Trash2 size={13} /> Eliminar música</button></> : <button className="upload-button" onClick={() => input.current?.click()}><Plus size={14} /> Cargar música</button>}
      {error && <p className="error">{error}</p>}
    </section>
    <section className="panel audio-source-panel"><h2><Video size={15} /> Audio del fondo</h2>
      {backgroundAudioAvailable ? <><label className="toggle-row"><input type="checkbox" checked={studio.background.videoAudioEnabled} onChange={(event) => studio.setBackground({ videoAudioEnabled: event.target.checked })} /><span><strong>Usar audio del video</strong><small>Se mezclará en previsualización y exportación.</small></span></label>{studio.background.videoAudioEnabled && <label className="range-row">Volumen del video<output>{studio.background.videoVolume}%</output><input type="range" min="0" max="100" value={studio.background.videoVolume} onChange={(event) => studio.setBackground({ videoVolume: Number(event.target.value) })} /></label>}</> : <div className="audio-empty"><Volume2 size={18} /><span>Selecciona un fondo de video en Escena para habilitar su audio.</span></div>}
    </section>
    <BeatSyncPanel />
  </div>
}
