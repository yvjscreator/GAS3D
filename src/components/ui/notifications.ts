import { useEffect } from 'react'
import { sileo, type SileoOptions } from 'sileo'

const recent = new Map<string, number>()
const visible: string[] = []
let sequence = 0
// Sileo 0.1.6 supports IDs in its store but omits them from the exported type.
// Unique IDs keep a finishing progress notice from dismissing its success notice.
type ScopedOptions = SileoOptions & { id: string }
const nextId = () => 'gas3d-notice-' + (++sequence)
export function notify(kind: 'success' | 'error' | 'info', message: string) {
  if (!message.trim()) return
  const key = kind + message, now = Date.now()
  if (now - (recent.get(key) ?? 0) < 1800) return
  for (const [id, time] of recent) if (now - time > 1800) recent.delete(id)
  recent.set(key, now)
  while (visible.length >= 3) sileo.dismiss(visible.shift()!)
  const options: ScopedOptions = {
    id: nextId(),
    title: kind === 'error' ? 'No se pudo completar' : kind === 'success' ? 'Listo' : 'Información',
    description: message, duration: kind === 'error' ? 9000 : 5500,
    button: { title: 'Cerrar', onClick: () => sileo.dismiss(id) },
  }
  const id = sileo[kind](options)
  visible.push(id)
}

/** One temporary notice per operation, cleaned up even on navigation/unmount. */
export function useTaskNotice(active: boolean, title: string) {
  useEffect(() => {
    if (!active) return
    const options: ScopedOptions = { id: nextId(), title, type: 'loading', duration: null }
    const id = sileo.show(options)
    return () => sileo.dismiss(id)
  }, [active, title])
}
