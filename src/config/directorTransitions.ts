import type { DirectorTransitionId, LayerTransition } from '../types/studio'
import type { ShotTimingFrame } from '../utils/shotTiming'

export type DirectorTransitionDefinition = {
  id: DirectorTransitionId
  name: string
  description: string
}

export interface DirectorTransitionFrame {
  rotationOffset: number
  cameraScale: number
  opacity: number
}

export const directorTransitionDefinitions: DirectorTransitionDefinition[] = [
  { id: 'cut', name: 'Corte limpio', description: 'Mantiene la toma estable y corta exactamente en el punto musical.' },
  { id: 'premiumOrbit', name: 'Premium Orbit', description: 'Carga un arco elegante al final de la toma antes del corte.' },
  { id: 'whipReveal', name: 'Whip Reveal', description: 'Reserva un giro veloz para la salida y revela la siguiente vista.' },
  { id: 'matchRotation', name: 'Match Rotation', description: 'Alinea el final de una toma con la orientación inicial de la siguiente.' },
  { id: 'detailDive', name: 'Detail Dive', description: 'Se acerca con fuerza al estampado para usar el detalle como puente.' },
  { id: 'occlusionCut', name: 'Occlusion Cut', description: 'Acerca la prenda hasta ocupar el cuadro y oculta el punto de corte.' },
]

export const defaultDirectorTransitionIds: DirectorTransitionId[] = directorTransitionDefinitions.map((transition) => transition.id)

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
const smooth = (value: number) => { const t = clamp01(value); return t * t * (3 - 2 * t) }
const shortestAngle = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from))

export function normalizeDirectorTransition(value: unknown): DirectorTransitionId | null {
  if (directorTransitionDefinitions.some((item) => item.id === value)) return value as DirectorTransitionId
  const legacy: Partial<Record<LayerTransition, DirectorTransitionId>> = {
    none: 'cut',
    fade: 'premiumOrbit',
    slideLeft: 'whipReveal',
    slideRight: 'matchRotation',
    slideUp: 'occlusionCut',
    zoom: 'detailDive',
  }
  return typeof value === 'string' ? legacy[value as LayerTransition] ?? null : null
}

export function evaluateDirectorTransition(id: DirectorTransitionId | undefined, timing: ShotTimingFrame, currentRotation: number, nextFacing?: number): DirectorTransitionFrame {
  const transition = timing.phase === 'transition' ? smooth(timing.local) : timing.phase === 'settle' ? 1 : 0
  if (!id || id === 'cut' || transition <= 0) return { rotationOffset: 0, cameraScale: 1, opacity: 1 }

  if (id === 'matchRotation' && nextFacing !== undefined) {
    return { rotationOffset: shortestAngle(currentRotation, nextFacing) * transition, cameraScale: 1 - Math.sin(transition * Math.PI) * .035, opacity: 1 }
  }
  if (id === 'premiumOrbit') return { rotationOffset: .42 * transition, cameraScale: 1 - .07 * transition, opacity: 1 }
  if (id === 'whipReveal') return { rotationOffset: 1.05 * transition, cameraScale: 1 - Math.sin(transition * Math.PI) * .12, opacity: 1 }
  if (id === 'detailDive') return { rotationOffset: .08 * transition, cameraScale: 1 - .34 * transition, opacity: 1 }
  if (id === 'occlusionCut') return { rotationOffset: .18 * transition, cameraScale: 1 - .5 * transition, opacity: 1 }
  return { rotationOffset: 0, cameraScale: 1, opacity: 1 }
}
