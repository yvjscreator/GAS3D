import type { ButtonHTMLAttributes, CSSProperties, HTMLAttributes, ImgHTMLAttributes, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export function Tooltip({ label, shortcut, side = 'bottom', children }: { label: string; shortcut?: string; side?: 'top' | 'bottom'; children: ReactNode }) {
  return <span className={`ui-tooltip-anchor tooltip-${side}`}>
    {children}
    <span className="ui-tooltip" role="tooltip"><strong>{label}</strong>{shortcut && <kbd>{shortcut}</kbd>}</span>
  </span>
}

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  icon: LucideIcon
  label: string
  shortcut?: string
  text?: string
  tone?: 'neutral' | 'primary' | 'record'
}

export function IconButton({ icon: Icon, label, shortcut, text, tone = 'neutral', className = '', ...props }: IconButtonProps) {
  return <Tooltip label={label} shortcut={shortcut}><button {...props} className={`ui-icon-button ${tone}${text ? ' with-text' : ''} ${className}`.trim()} aria-label={props['aria-label'] ?? label}><Icon size={16} />{text && <span>{text}</span>}</button></Tooltip>
}

export function ToolGroup({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  return <div className={`ui-tool-group ${className}`.trim()} role="group" aria-label={label}>{children}</div>
}

export type SegmentedOption<T extends string> = { value: T; label: string; icon?: LucideIcon; disabled?: boolean }

export function SegmentedControl<T extends string>({ value, options, onChange, label, compact = false }: { value: T; options: SegmentedOption<T>[]; onChange: (value: T) => void; label: string; compact?: boolean }) {
  return <div className={compact ? 'ui-segmented compact' : 'ui-segmented'} role="radiogroup" aria-label={label}>{options.map((option) => {
    const Icon = option.icon
    return <button key={option.value} type="button" role="radio" aria-checked={value === option.value} disabled={option.disabled} className={value === option.value ? 'active' : ''} onClick={() => onChange(option.value)}>{Icon && <Icon size={14} />}<span>{option.label}</span></button>
  })}</div>
}

export function SelectableCard({ selected, className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean; children: ReactNode }) {
  return <button {...props} className={`ui-selectable-card${selected ? ' selected' : ''} ${className}`.trim()} aria-pressed={selected}>{children}</button>
}

export function ResponsiveOptionGrid({ minWidth = 150, className = '', style, ...props }: HTMLAttributes<HTMLDivElement> & { minWidth?: number }) {
  return <div {...props} className={`ui-responsive-grid ${className}`.trim()} style={{ '--option-min-width': `${minWidth}px`, ...style } as CSSProperties} />
}

export function MasterDetailLayout({ master, detail, className = '' }: { master: ReactNode; detail: ReactNode; className?: string }) {
  return <div className={`ui-master-detail ${className}`.trim()}><section className="ui-master-pane">{master}</section><section className="ui-detail-pane">{detail}</section></div>
}

export function InspectorSection({ title, actions, children, className = '' }: { title: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`ui-inspector-section ${className}`.trim()}><header><strong>{title}</strong>{actions}</header><div>{children}</div></section>
}

export function MediaThumbnailButton({ selected, badge, label, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & Pick<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> & { selected?: boolean; badge?: string; label: string }) {
  const { src, alt, ...buttonProps } = props
  return <button {...buttonProps} className={`ui-media-thumbnail${selected ? ' selected' : ''} ${className}`.trim()} aria-label={label}>{src ? <img src={src} alt={alt ?? ''} /> : <span className="ui-media-placeholder" />}{badge && <b>{badge}</b>}</button>
}

export type WorkspaceTab<T extends string> = { id: T; label: string; icon?: LucideIcon }

export function WorkspaceTabs<T extends string>({ value, tabs, onChange, label = 'Espacios de trabajo' }: { value: T; tabs: WorkspaceTab<T>[]; onChange: (value: T) => void; label?: string }) {
  return <nav className="ui-workspace-tabs" aria-label={label}>{tabs.map((tab) => {
    const Icon = tab.icon
    return <button key={tab.id} type="button" className={value === tab.id ? 'active' : ''} aria-current={value === tab.id ? 'page' : undefined} onClick={() => onChange(tab.id)}>{Icon && <Icon size={15} />}<span>{tab.label}</span></button>
  })}</nav>
}
