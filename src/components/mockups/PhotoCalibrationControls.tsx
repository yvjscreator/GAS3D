import { useId, useState } from 'react'
import { Check, X } from 'lucide-react'
import { IconButton, InlineField } from '../ui/primitives'
import { calibrationLineToSave, calibrationScaleAxis, referenceLengthCm, type CalibrationAxis, type CalibrationDraft, type PhotoCalibration, type PhotoSize } from './mockupCalibration'

export function PhotoCalibrationControls({ calibration, photo, values, pending, disabled, onValue, onMark, onSave, onCancel, onScaleAxis }: {
  calibration: PhotoCalibration; values: Partial<Record<CalibrationAxis, string>>; pending: CalibrationDraft | null; disabled: boolean
  photo: PhotoSize | null; onScaleAxis: (axis: CalibrationAxis) => void
  onValue: (axis: CalibrationAxis, value: string) => void; onMark: (axis: CalibrationAxis) => void
  onSave: (axis: CalibrationAxis, primary: boolean) => void; onCancel: (axis: CalibrationAxis) => void
}) {
  const id = useId()
  const scaleAxis = calibrationScaleAxis(calibration)
  const [primaryAxis, setPrimaryAxis] = useState<CalibrationAxis>(scaleAxis ?? 'vertical')
  const otherAxis = primaryAxis === 'vertical' ? 'horizontal' : 'vertical'
  const [comparisonOpen, setComparisonOpen] = useState(Boolean(calibration[otherAxis]))
  const hasPrimary = scaleAxis === primaryAxis
  const comparison = pending?.axis === otherAxis
    ? pending.first && pending.second ? { from: pending.first, to: pending.second } : null
    : calibration[otherAxis]
  const expectedCm = photo && comparison && hasPrimary ? referenceLengthCm(photo, calibration, otherAxis, comparison) : null
  const comparisonValue = Number(values[otherAxis] ?? calibration[otherAxis]?.cm ?? '')
  const difference = expectedCm && comparisonValue > 0 ? Math.abs(comparisonValue / expectedCm - 1) : 0

  const referenceRow = (axis: CalibrationAxis, primary: boolean) => {
    const line = calibration[axis], marking = pending?.axis === axis
    const value = values[axis] ?? line?.cm.toString() ?? ''
    const changed = values[axis] !== undefined && value !== (line?.cm.toString() ?? '')
    const canSave = Boolean(calibrationLineToSave(line, pending, axis, value)) && (marking || changed || (primary && scaleAxis !== axis))
    const name = axis === 'horizontal' ? 'ancho' : 'alto'
    return <div className="mockup-calibration-axis" data-axis={axis} data-reference={primary ? 'primary' : 'comparison'}>
      <InlineField label={(axis === 'horizontal' ? 'Ancho' : 'Alto') + (primary ? ' de referencia (cm)' : ' de comprobación (cm)')} htmlFor={id + axis} actionCount={3}>
        <input id={id + axis} type="number" min=".1" max="500" step=".1" value={value} disabled={disabled}
          aria-describedby={marking ? id + axis + '-status' : undefined}
          onChange={event => onValue(axis, event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') { event.preventDefault(); onSave(axis, primary) }
            if (event.key === 'Escape') { event.preventDefault(); onCancel(axis) }
          }} />
        <button type="button" className={'mockup-reference-mark' + (marking ? ' is-marking' : '')} disabled={disabled}
          aria-label={'Marcar ' + name + ' de ' + (primary ? 'referencia' : 'comprobación')} title={(line ? 'Volver a marcar' : 'Marcar') + ' dos puntos del ' + name} onClick={() => onMark(axis)}>Marcar</button>
        <IconButton icon={Check} label={'Guardar ' + (primary ? 'referencia' : 'comprobación') + ' de ' + name} title={'Aplicar ' + name} disabled={disabled || !canSave} tone="primary" onClick={() => onSave(axis, primary)} />
        <IconButton icon={X} label={'Cancelar cambios de ' + name} title={'Descartar cambios de ' + name} disabled={disabled || (!marking && !changed)} onClick={() => onCancel(axis)} />
      </InlineField>
      {marking && <small id={id + axis + '-status'} role="status">{!pending.first ? 'Marcá el primer punto.' : !pending.second ? 'Marcá el segundo punto.' : primary ? 'Tramo listo: asigná cm y aplicá con ✓.' : 'Tramo listo: podés comparar su medida con la escala principal.'}</small>}
    </div>
  }

  return <section className="mockup-calibration" aria-label="Calibración de fotografía">
    <h3>Calibrar con una medida</h3>
    <p className="mockup-note">Marcá dos puntos y asigná su distancia en cm. Esa medida calibra ambas reglas.</p>
    <label className="mockup-field mockup-field-inline mockup-calibration-scale">Medida principal
      <select aria-label="Medida principal" value={primaryAxis} disabled={disabled} onChange={event => {
        const axis = event.target.value as CalibrationAxis
        if (pending) onCancel(pending.axis)
        setPrimaryAxis(axis)
        setComparisonOpen(Boolean(calibration[axis === 'vertical' ? 'horizontal' : 'vertical']))
        if (calibration[axis]) onScaleAxis(axis)
      }}>
        <option value="vertical">Alto</option>
        <option value="horizontal">Ancho</option>
      </select>
    </label>
    <div className="mockup-calibration-grid">{referenceRow(primaryAxis, true)}</div>
    <p className="mockup-note" role="status">{hasPrimary
      ? 'Reglas, zonas y estampados en cm estimados con una única escala.'
      : scaleAxis ? 'La escala anterior se conserva hasta guardar esta medida.' : 'Sin referencia guardada: las reglas muestran píxeles.'}</p>
    {hasPrimary && <details className="mockup-calibration-comparison" open={comparisonOpen} onToggle={event => {
      setComparisonOpen(event.currentTarget.open)
      if (!event.currentTarget.open && pending?.axis === otherAxis) onCancel(otherAxis)
    }}>
      <summary>Comprobar otra medida (opcional)</summary>
      <div className="mockup-calibration-grid">
        {referenceRow(otherAxis, false)}
        <p className="mockup-note" role="status">{expectedCm !== null
          ? `Según la escala principal: ${expectedCm.toFixed(1)} cm.${difference > .05 ? ` Diferencia: ${Math.round(difference * 100)}%.` : ''} La escala principal se mantiene.`
          : 'Marcá otro tramo para conocer su medida estimada. Podés ingresar una medida conocida para compararla; no cambia la escala.'}</p>
      </div>
    </details>}
    <details className="mockup-control-help"><summary>Cómo medir</summary><p>Marcá los extremos del tramo de la prenda, sin incluir márgenes vacíos. Con una foto frontal, una sola referencia estima tanto el ancho como el alto y conserva la proporción del PNG. La comprobación es opcional. Si querés usarla como referencia, elegila en Medida principal. Las medidas sugeridas por ChatGPT y las fotos con perspectiva son aproximadas.</p></details>
  </section>
}
