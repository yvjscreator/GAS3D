import { useEffect, useId, useState } from 'react'
import type { FormEvent } from 'react'
import { Check, KeyRound, Trash2 } from 'lucide-react'
import { InlineField } from '../ui/primitives'
import { notify } from '../ui/notifications'
import { requestConfirmation } from '../ui/confirmation'
import { geminiKeyOwner } from './api'
import { clearGeminiApiKey, loadGeminiApiKey, saveGeminiApiKey } from './storage'

export function GeminiKeySettings({ onChange }: { onChange: () => void }) {
  const inputId = useId()
  const owner = geminiKeyOwner()
  const [draft, setDraft] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    loadGeminiApiKey(owner).then((key) => { if (active) setSaved(Boolean(key)) })
      .catch(() => { if (active) setError('El navegador no permite acceder a IndexedDB.') })
      .finally(() => { if (active) setSaving(false) })
    return () => { active = false }
  }, [owner])

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving) return
    const value = draft.trim()
    if (!/^[a-zA-Z0-9_-]{16,256}$/.test(value)) {
      setError('Pega una clave de Gemini válida.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await saveGeminiApiKey(owner, value)
      setDraft('')
      setSaved(true)
      onChange()
      notify('success', 'Clave de Gemini guardada en este navegador.')
    } catch {
      setError('No se pudo guardar la clave en IndexedDB.')
    } finally { setSaving(false) }
  }

  const remove = async () => {
    if (saving || !await requestConfirmation({ title: 'Quitar clave de Gemini', description: 'La clave se borrará de este navegador y Subtitle Studio volverá a la configuración del servidor.', accept: 'Quitar clave', destructive: true })) return
    setSaving(true)
    setError('')
    try {
      await clearGeminiApiKey(owner)
      setDraft('')
      setSaved(false)
      onChange()
      notify('success', 'Clave personal eliminada de este navegador.')
    } catch {
      setError('No se pudo quitar la clave de IndexedDB.')
    } finally { setSaving(false) }
  }

  return <details className="subtitle-desktop-logs subtitle-gemini-settings">
    <summary><KeyRound size={14} /> Gemini <span>{saved ? 'Clave personal' : 'Configuración del servidor'}</span></summary>
    <form onSubmit={(event) => void save(event)}>
      <InlineField label="Clave de Gemini" htmlFor={inputId} actionCount={saved ? 2 : 1}>
        <input id={inputId} type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={256}
          placeholder={saved ? 'Pega una clave para cambiarla' : 'Pega tu clave de API'} value={draft}
          disabled={saving} onChange={(event) => setDraft(event.target.value)} aria-invalid={Boolean(error)} />
        <button type="submit" aria-label="Guardar clave" title="Guardar clave" disabled={saving || !draft.trim()}><Check size={16} /></button>
        {saved && <button type="button" aria-label="Quitar clave" title="Quitar clave" disabled={saving} onClick={() => void remove()}><Trash2 size={16} /></button>}
      </InlineField>
      <small>Se guarda en este navegador y se usa para guion, voz y transcripción.</small>
      {error && <small className="subtitle-gemini-error" role="status">{error}</small>}
    </form>
  </details>
}
