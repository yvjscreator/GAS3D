import { useEffect, useState } from 'react'
import { Pipette, X } from 'lucide-react'
import { InlineField } from '../ui/primitives'
import { normalizeKeyColor } from './imageProcessor'

export function BackgroundColorControls({ color, sampling, disabled, canSample, onChange, onToggleSample }: {
  color: string
  sampling: boolean
  disabled: boolean
  canSample: boolean
  onChange: (color: string) => void
  onToggleSample: () => void
}) {
  const [draft, setDraft] = useState(color)
  useEffect(() => setDraft(color), [color])
  const valid = normalizeKeyColor(draft)
  return <div className="images-key-color">
    <InlineField label="Color a eliminar" htmlFor="images-key-hex" actionCount={2}>
      <input id="images-key-hex" type="text" value={draft} spellCheck={false} maxLength={7} disabled={disabled}
        aria-invalid={!valid} aria-describedby={!valid ? 'images-key-error' : undefined}
        onChange={(event) => {
          const value = event.currentTarget.value
          setDraft(value)
          // Three digits are accepted on blur/Enter, so typing a six-digit
          // value never replaces the unfinished input halfway through.
          if (/^#?[a-f\d]{6}$/i.test(value)) onChange(normalizeKeyColor(value)!)
        }} onBlur={() => { if (valid) { setDraft(valid); if (valid !== color) onChange(valid) } }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && valid) { setDraft(valid); onChange(valid) }
          if (event.key === 'Escape') { event.stopPropagation(); setDraft(color) }
        }} />
      <input type="color" aria-label="Elegir color a eliminar" value={color} disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)} />
      <button type="button" aria-label={sampling ? 'Cancelar cuentagotas' : 'Tomar color de la imagen'}
        title={sampling ? 'Cancelar cuentagotas (Esc)' : 'Tomar color de la imagen'}
        aria-pressed={sampling} disabled={disabled || !canSample} onClick={onToggleSample}>
        {sampling ? <X size={18} /> : <Pipette size={18} />}
      </button>
    </InlineField>
    {!valid && <span className="images-key-error" id="images-key-error">Usa un color HEX, por ejemplo #061c3d. Esc restaura el anterior.</span>}
    <p>{sampling ? 'Tocá el fondo en la imagen original. Esc cancela.' : 'Usá el cuentagotas para tomar un color de tu imagen.'}</p>
  </div>
}
