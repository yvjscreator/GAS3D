import type { DirectorShotKind } from '../types/studio'

export type DirectorShotDefinition = {
  id: DirectorShotKind
  name: string
  description: string
  rhythmicUnits: number
}

export const directorShotDefinitions: DirectorShotDefinition[] = [
  { id: 'groupShowcase', name: 'Presentación grupal', description: 'Muestra un grupo equilibrado de hasta cuatro prendas.', rhythmicUnits: 2 },
  { id: 'itemShowcase', name: 'Presentación individual', description: 'Dedica una rotación completa a cada diseño.', rhythmicUnits: 1 },
  { id: 'hero', name: 'Toma hero', description: 'Presenta el estampado principal con un arco de cámara.', rhythmicUnits: 1 },
  { id: 'detailLarge', name: 'Detalle principal', description: 'Acercamiento al estampado de mayor resolución.', rhythmicUnits: 1 },
  { id: 'detailSmall', name: 'Detalle companion', description: 'Acercamiento al companion del diseño.', rhythmicUnits: 1 },
]

export const defaultEnabledShotTypes: DirectorShotKind[] = directorShotDefinitions.map((shot) => shot.id)

export const shotDefinition = (id: DirectorShotKind) => directorShotDefinitions.find((shot) => shot.id === id)!
