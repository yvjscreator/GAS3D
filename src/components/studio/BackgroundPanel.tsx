import { useRef, useState } from 'react'
import { useStudioStore } from '../../store/studioStore'
import { backgroundMediaKey, storeMedia } from '../../utils/mediaStorage'
export function BackgroundPanel() {
  const { background, setBackground } = useStudioStore(); const input = useRef<HTMLInputElement>(null); const [error, setError] = useState<string | null>(null)
  const choose = (file?: File) => { if (!file) return; const isVideo = background.type === 'video'; if (!(isVideo ? file.type.startsWith('video/') : file.type.startsWith('image/'))) { setError(isVideo ? 'Carga MP4 o WebM.' : 'Carga JPG, PNG o WebP.'); return }; if (background.url) URL.revokeObjectURL(background.url); void storeMedia(backgroundMediaKey, file).catch(() => setError('No se pudo guardar el fondo para la próxima sesión.')); setBackground({ url: URL.createObjectURL(file), name: file.name }); setError(null) }
  const range = (label: string, key: 'blur' | 'darkness') => <label className="range-row">{label}<output>{background[key]}%</output><input type="range" min="0" max="100" value={background[key]} onChange={(e) => setBackground({ [key]: Number(e.target.value) })} /></label>
  return <section className="panel"><h2>Fondo</h2><div className="tabs">{(['color', 'image', 'video'] as const).map((type) => <button key={type} className={background.type === type ? 'selected' : ''} onClick={() => { setBackground({ type }); setError(null) }}>{type === 'color' ? 'Color' : type === 'image' ? 'Imagen' : 'Video'}</button>)}</div>
    {background.type === 'color' ? <label className="color-picker block"><input type="color" value={background.color} onChange={(e) => setBackground({ color: e.target.value })} />Color de fondo</label> : <><input hidden ref={input} type="file" accept={background.type === 'video' ? 'video/mp4,video/webm' : 'image/jpeg,image/png,image/webp'} onChange={(e) => choose(e.target.files?.[0])} /><button className="upload-button" onClick={() => input.current?.click()}>{background.url ? 'Reemplazar archivo' : `Cargar ${background.type === 'video' ? 'video' : 'imagen'}`}</button>{background.name && <p className="muted truncate">{background.name}</p>}</>}
    {range('Desenfoque', 'blur')}{range('Oscurecer fondo', 'darkness')}{error && <p className="error">{error}</p>}
  </section>
}
