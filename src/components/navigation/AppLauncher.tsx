import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Clapperboard, Images, Layers3, LayoutGrid, Mic2, SlidersHorizontal, X } from 'lucide-react'
import './appLauncher.css'

export type GasModule = 'garment' | 'images' | 'collage' | 'subtitles' | 'halftone'

const MODULES = [
  { id: 'garment', label: 'Video y publicidad', description: '3D Studio', icon: Clapperboard, hash: '/garment' },
  { id: 'images', label: 'Preparación de imágenes', description: 'Images Studio', icon: Images, hash: '/images' },
  { id: 'collage', label: 'Collage Creator', description: 'Composición horizontal', icon: Layers3, hash: '/collage' },
  { id: 'subtitles', label: 'Subtítulos', description: 'Guion, voz y video', icon: Mic2, hash: '/subtitles' },
  { id: 'halftone', label: 'Halftone Lab', description: 'Tramas para estampados', icon: SlidersHorizontal, hash: '/halftone' },
] as const

export function AppLauncher({ active }: { active: GasModule }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.querySelector<HTMLButtonElement>('button[data-gas-module]')?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
      }
      if (event.key === 'Tab') {
        const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
        if (!buttons?.length) return
        const first = buttons[0]
        const last = buttons[buttons.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const close = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }
  const navigate = (hash: string) => {
    setOpen(false)
    if (window.location.hash !== '#' + hash) window.location.hash = hash
  }

  return <div className="gas-app-launcher">
    <button
      ref={triggerRef}
      type="button"
      className="gas-app-launcher-trigger"
      onClick={() => setOpen((value) => !value)}
      aria-label="Abrir menú de aplicaciones GAS3D"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls="gas-app-launcher-dialog"
      title="Cambiar aplicación"
    ><LayoutGrid size={19} aria-hidden="true" /></button>
    {open && createPortal(<>
      <button type="button" className="gas-app-launcher-backdrop" aria-label="Cerrar menú de aplicaciones" onClick={close} tabIndex={-1} />
      <div id="gas-app-launcher-dialog" ref={dialogRef} className="gas-app-launcher-dialog" role="dialog" aria-modal="true" aria-label="Aplicaciones de GAS3D">
        <div className="gas-app-launcher-heading">
          <span><LayoutGrid size={16} /> Aplicaciones GAS3D</span>
          <button type="button" onClick={close} aria-label="Cerrar menú"><X size={18} /></button>
        </div>
        <nav className="gas-app-launcher-options" aria-label="Ir a una aplicación">
          {MODULES.map(({ id, label, description, icon: Icon, hash }) =>
            <button
              type="button"
              data-gas-module={id}
              key={id}
              className={'gas-app-launcher-option' + (active === id ? ' is-active' : '')}
              aria-current={active === id ? 'page' : undefined}
              onClick={() => navigate(hash)}
            >
              <span className="gas-app-launcher-icon"><Icon size={21} aria-hidden="true" /></span>
              <span className="gas-app-launcher-option-label"><strong>{label}</strong><small>{description}</small></span>
              {active === id && <span className="gas-app-launcher-current">Actual</span>}
            </button>
          )}
        </nav>
      </div>
    </>, document.body)}
  </div>
}
