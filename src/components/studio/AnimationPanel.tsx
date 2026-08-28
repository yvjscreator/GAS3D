import { useEffect } from 'react'
import { useStudioStore } from '../../store/studioStore'
import { getProfessionalDuration, PROFESSIONAL_MIN_DURATION } from '../../config/professionalRecording'
import { hasBeatMap } from '../../utils/beatSync'
import { RotateCcw, RotateCw } from '../icons'

export function AnimationPanel() {
  const { animation, setAnimation, duration, setDuration, setTargetRotation, variantAssets, beatSync, enabledShotTypes } = useStudioStore(); const professional = Boolean(variantAssets.large.url && variantAssets.small.url); const rhythmic = professional && hasBeatMap(beatSync)
  useEffect(() => { if (professional && !rhythmic && duration < PROFESSIONAL_MIN_DURATION) setDuration(PROFESSIONAL_MIN_DURATION) }, [duration, professional, rhythmic, setDuration])
  return <section className="panel"><h2>Animación</h2>
    {professional && <p className="director-note"><strong>Dirección profesional activa</strong><span>{enabledShotTypes.length} tipos de toma activos; la secuencia se ajusta automáticamente.</span></p>}
    <label className="select-row">Movimiento manual<select disabled={professional} value={animation} onChange={(e) => setAnimation(e.target.value as typeof animation)}><option value="spin180">Giro 180°</option><option value="spin360">Giro 360°</option><option value="still">Quieto</option></select></label>
    <label className="range-row">Duración total<output>{rhythmic ? `${getProfessionalDuration(duration, beatSync, enabledShotTypes).toFixed(1)}s · ritmo` : `${duration}s`}</output><input disabled={rhythmic} type="range" min={professional ? PROFESSIONAL_MIN_DURATION : 4} max="60" value={Math.max(duration, professional && !rhythmic ? PROFESSIONAL_MIN_DURATION : 4)} onChange={(e) => setDuration(Number(e.target.value))} /></label>
    {rhythmic && <p className="muted">La duración la determina el BPM y los compases configurados.</p>}
    <div className="quick-views"><button className="secondary small" onClick={() => setTargetRotation(0)}><RotateCcw size={13} /> Frente</button><button className="secondary small" onClick={() => setTargetRotation(Math.PI)}><RotateCw size={13} /> Espalda</button></div>
  </section>
}
