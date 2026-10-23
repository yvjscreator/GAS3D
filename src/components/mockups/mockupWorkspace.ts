import type { ViewName } from './mockupEngine'
import { VIEWS } from './mockupProduct'

export type ViewMode = 'setup' | 'mockup'
export type ViewModes = Record<ViewName, ViewMode>
export const initialViewModes = (mode: ViewMode): ViewModes => Object.fromEntries(VIEWS.map(view => [view, mode])) as ViewModes
