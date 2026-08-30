import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { LucideIcon } from 'lucide-react'

export function Popover({ open, onOpenChange, trigger, children, align = 'center', placement = 'anchor', width, className = '' }: { open: boolean; onOpenChange: (open: boolean) => void; trigger: (controls: { open: boolean; toggle: () => void }) => ReactNode; children: ReactNode; align?: 'start' | 'center' | 'end'; placement?: 'anchor' | 'viewport'; width?: number; className?: string }) {
  const root = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  useLayoutEffect(() => {
    if (!open) { setPosition(null); return }
    const place = () => {
      const triggerRect = root.current?.getBoundingClientRect()
      const panelRect = panel.current?.getBoundingClientRect()
      if (!triggerRect || !panelRect) return
      const viewportMargin = 8
      const preferredLeft = placement === 'viewport'
        ? (window.innerWidth - panelRect.width) / 2
        : align === 'start'
          ? triggerRect.left
          : align === 'end'
            ? triggerRect.right - panelRect.width
            : triggerRect.left + (triggerRect.width - panelRect.width) / 2
      const left = Math.min(Math.max(preferredLeft, viewportMargin), Math.max(viewportMargin, window.innerWidth - panelRect.width - viewportMargin))
      const spaceBelow = window.innerHeight - triggerRect.bottom - viewportMargin
      const top = spaceBelow >= Math.min(panelRect.height, 240)
        ? triggerRect.bottom + 9
        : Math.max(viewportMargin, triggerRect.top - panelRect.height - 9)
      setPosition({ top, left })
    }
    place()
    const frame = window.requestAnimationFrame(place)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [align, open, placement])
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!root.current?.contains(target) && !panel.current?.contains(target)) onOpenChange(false)
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onOpenChange(false) }
    document.addEventListener('pointerdown', outside)
    window.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', escape) }
  }, [onOpenChange, open])
  return <div ref={root} className={`ui-popover-root ${className}`.trim()}>
    {trigger({ open, toggle: () => onOpenChange(!open) })}
    {open && createPortal(<div
      ref={panel}
      className={`ui-popover ui-popover-portal align-${align} ${className}`.trim()}
      style={{ top: position?.top ?? 0, left: position?.left ?? 0, width, visibility: position ? 'visible' : 'hidden' }}
    >{children}</div>, document.body)}
  </div>
}

export type ContextMenuItem = { id: string; label: string; icon?: LucideIcon; disabled?: boolean; danger?: boolean; onSelect: () => void }

export function ContextMenu({ open, x, y, items, onClose }: { open: boolean; x: number; y: number; items: ContextMenuItem[]; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const close = () => onClose()
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', escape)
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', escape) }
  }, [onClose, open])
  if (!open) return null
  return <div className="ui-context-menu" role="menu" style={{ '--context-x': `${x}px`, '--context-y': `${y}px` } as CSSProperties} onPointerDown={(event) => event.stopPropagation()}>{items.map((item) => {
    const Icon = item.icon
    return <button key={item.id} role="menuitem" disabled={item.disabled} className={item.danger ? 'danger' : ''} onClick={() => { item.onSelect(); onClose() }}>{Icon && <Icon size={14} />}<span>{item.label}</span></button>
  })}</div>
}
