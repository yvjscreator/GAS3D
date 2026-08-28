import { useRef, useState } from 'react'
import { useStudioStore } from '../../store/studioStore'
import { backgroundMediaKey, removePreparedMedia, storeMedia, storePreparedMedia } from '../../utils/mediaStorage'
import { prepareVideoAsset } from '../../utils/mediaProcessor'
import { Pause, Play } from '../icons'
export function BackgroundPanel() {
  const { background, setBackground, beatSync, setBeatSync } = useStudioStore(); const input = useRef<HTMLInputElement>(null); const [error, setError] = useState<string | null>(null)
  const choose = async (file?: File) => {
    if (!file) return
    const isVideo = background.type === 'video'
    if (!(isVideo ? file.type.startsWith('video/') : file.type.startsWith('image/'))) { setError(isVideo ? 'Carga MP4 o WebM.' : 'Carga JPG, PNG o WebP.'); return }
    try {
      let renderBlob: Blob = file
      if (isVideo) { await removePreparedMedia(backgroundMediaKey); await storeMedia(backgroundMediaKey, file) }
      else {
        const prepared = await prepareVideoAsset(file, { profile: useStudioStore.getState().assetQualityProfile, alphaMode: useStudioStore.getState().alphaPipelineMode, mimeType: file.type === 'image/jpeg' ? 'image/webp' : undefined })
        renderBlob = prepared.renderBlob
        await storePreparedMedia(backgroundMediaKey, prepared.renderBlob, prepared.thumbnailBlob, prepared.metadata)
      }
      if (background.url) URL.revokeObjectURL(background.url)
      setBackground({ url: URL.createObjectURL(renderBlob), name: file.name, videoPaused: false })
      if (beatSync.source === 'background') setBeatSync({ analyzedAssetName: null, beats: [], confidence: 0 })
      setError(null)
    } catch { setError('No se pudo procesar el fondo.') }
  }
  const range = (label: string, key: 'blur' | 'darkness' | 'ambilightStrength' | 'ambilightReach' | 'videoVolume') => <label className="range-row">{label}<output>{background[key]}%</output><input type="range" min="0" max="100" value={background[key]} onChange={(e) => setBackground({ [key]: Number(e.target.value) })} /></label>
  return <section className="panel"><h2>Fondo</h2><div className="tabs">{(['color', 'image', 'video'] as const).map((type) => <button key={type} className={background.type === type ? 'selected' : ''} onClick={() => { setBackground({ type }); setError(null) }}>{type === 'color' ? 'Color' : type === 'image' ? 'Imagen' : 'Video'}</button>)}</div>
    {background.type === 'color' ? <label className="color-picker block"><input type="color" value={background.color} onChange={(e) => setBackground({ color: e.target.value })} />Color de fondo</label> : <><input hidden ref={input} type="file" accept={background.type === 'video' ? 'video/mp4,video/webm' : 'image/jpeg,image/png,image/webp'} onChange={(e) => { void choose(e.target.files?.[0]) }} /><button className="upload-button" onClick={() => input.current?.click()}>{background.url ? 'Reemplazar archivo' : `Cargar ${background.type === 'video' ? 'video' : 'imagen'}`}</button>{background.name && <p className="muted truncate">{background.name}</p>}{background.type === 'video' && background.url && <button className="secondary small video-pause" onClick={() => setBackground({ videoPaused: !background.videoPaused })}>{background.videoPaused ? <><Play size={13} /> Reanudar video</> : <><Pause size={13} /> Pausar video</>}</button>}</>}
    {background.type === 'video' && background.url && <div className="video-audio-controls"><label className="toggle-row"><input type="checkbox" checked={background.videoAudioEnabled} onChange={(e) => setBackground({ videoAudioEnabled: e.target.checked })} /><span><strong>Usar audio del video</strong><small>Se incluirá en la previsualización y exportación</small></span></label>{background.videoAudioEnabled && range('Volumen del video', 'videoVolume')}</div>}
    {range('Desenfoque', 'blur')}{range('Oscurecer fondo', 'darkness')}
    {background.type === 'video' && <div className="ambilight-controls"><label className="toggle-row"><input type="checkbox" checked={background.ambilight} onChange={(e) => setBackground({ ambilight: e.target.checked })} /><span><strong>Ambilight del video</strong><small>Proyecta sus colores sobre toda la prenda</small></span></label>{background.ambilight && <>{range('Intensidad Ambilight', 'ambilightStrength')}{range('Alcance desde los bordes', 'ambilightReach')}</>}</div>}
    {error && <p className="error">{error}</p>}
  </section>
}
