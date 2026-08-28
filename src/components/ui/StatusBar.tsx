import type { ReactNode } from 'react'

export function StatusBar({ children, tone = 'neutral', className = '' }: { children: ReactNode; tone?: 'neutral' | 'playing' | 'recording' | 'error' | 'ready'; className?: string }) {
  return <footer className={`ui-status-bar ${tone} ${className}`.trim()}>{children}</footer>
}

export function StatusItem({ label, value, strong = false, grow = false }: { label?: string; value: ReactNode; strong?: boolean; grow?: boolean }) {
  return <span className={`ui-status-item${strong ? ' strong' : ''}${grow ? ' grow' : ''}`}>{label && <small>{label}</small>}<b>{value}</b></span>
}
