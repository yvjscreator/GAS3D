import { useId } from 'react'
import { Check, X } from 'lucide-react'
import { IconButton, InlineField } from '../ui/primitives'
import { calibrationLineToSave, type CalibrationAxis, type CalibrationDraft, type PhotoCalibration } from './mockupCalibration'

export function PhotoCalibrationControls({ calibration, values, pending, disabled, onValue, onMark, onSave, onCancel }: {
  calibration: PhotoCalibration; values: Partial<Record<CalibrationAxis, string>>; pending: CalibrationDraft | null; disabled: boolean
  onValue: (axis: CalibrationAxis, value: string) => void; onMark: (axis: CalibrationAxis) => void
  onSave: (axis: CalibrationAxis) => void; onCancel: (axis: CalibrationAxis) => void
}) {
  const id = useId()
  return <section className="mockup-calibration" aria-label="Calibración de fotografía">
    <h3>Referencias en centímetros</h3>
    <details className="mockup-control-help"><summary>Cómo calibrar</summary><p>Marcá dos puntos sobre la prenda y asignale su medida real o estimada. ✓ aplica; × descarta los cambios de esa fila. Una referencia estima ambos ejes; la segunda permite afinarlos. Las medidas sugeridas por ChatGPT son aproximadas.</p></details>
    <div className="mockup-calibration-grid">
      {(['horizontal', 'vertical'] as const).map(axis => {
        const line = calibration[axis], marking = pending?.axis === axis
        const value = values[axis] ?? line?.cm.toString() ?? ''
        const changed = values[axis] !== undefined && value !== (line?.cm.toString() ?? '')
        const canSave = Boolean(calibrationLineToSave(line, pending, axis, value)) && (marking || changed)
        const name = axis === 'horizontal' ? 'ancho' : 'alto'
        return <div key={axis} className="mockup-calibration-axis" data-axis={axis}>
          <InlineField label={(axis === 'horizontal' ? 'Ancho' : 'Alto') + ' de referencia (cm)'} htmlFor={id + axis} actionCount={3}>
            <input id={id + axis} type="number" min=".1" max="500" step=".1" value={value} disabled={disabled}
              aria-describedby={marking ? id + axis + '-status' : undefined}
              onChange={event => onValue(axis, event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') { event.preventDefault(); onSave(axis) }
                if (event.key === 'Escape') { event.preventDefault(); onCancel(axis) }
              }} />
            <button type="button" className={'mockup-reference-mark' + (marking ? ' is-marking' : '')} disabled={disabled}
              aria-label={'Marcar ' + name + ' de referencia'} title={(line ? 'Volver a marcar' : 'Marcar') + ' dos puntos del ' + name} onClick={() => onMark(axis)}>Marcar</button>
            <IconButton icon={Check} label={'Guardar referencia de ' + name} title={'Aplicar referencia de ' + name} disabled={disabled || !canSave} tone="primary" onClick={() => onSave(axis)} />
            <IconButton icon={X} label={'Cancelar cambios de ' + name} title={'Descartar cambios de ' + name} disabled={disabled || (!marking && !changed)} onClick={() => onCancel(axis)} />
          </InlineField>
          {marking && <small id={id + axis + '-status'} role="status">{!pending.first ? 'Marcá el primer punto.' : !pending.second ? 'Marcá el segundo punto.' : 'Tramo listo: asigná cm y aplicá con ✓.'}</small>}
        </div>
      })}
    </div>
    <p className="mockup-note">{calibration.horizontal || calibration.vertical ? 'Reglas en cm estimados · ✓ para aplicar cambios.' : 'Sin referencia: las reglas muestran píxeles.'}</p>
  </section>
}
