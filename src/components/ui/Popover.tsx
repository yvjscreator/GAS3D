import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export function Popover({ open, onOpenChange, trigger, children, align = 'center', className = '' }: { open: boolean; onOpenChange: (open: boolean) => void; trigger: (controls: { open: boolean; toggle: () => void }) => ReactNode; children: ReactNode; align?: 'start' | 'center' | 'end'; className?: string }) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) onOpenChange(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onOpenChange(false) }
    document.addEventListener('pointerdown', outside)
    window.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', escape) }
  }, [onOpenChange, open])
  return <div ref={root} className={`ui-popover-root ${className}`.trim()}>{trigger({ open, toggle: () => onOpenChange(!open) })}{open && <div className={`ui-popover align-${align}`}>{children}</div>}</div>
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
