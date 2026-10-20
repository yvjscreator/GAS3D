import type { DirectorShotKind } from '../types/studio'

export type DirectorShotPriority = 'primary' | 'supporting' | 'detail'
export type DirectorShotVariantScope = 'all' | 'lead'

export type DirectorShotDefinition = {
  id: DirectorShotKind
  name: string
  description: string
  rhythmicUnits: number
  defaultDuration: number
  minimumDuration: number
  priority: DirectorShotPriority
  variantScope: DirectorShotVariantScope
}

export const directorShotDefinitions: DirectorShotDefinition[] = [
  { id: 'groupShowcase', name: 'Presentación grupal', description: 'Muestra un grupo equilibrado de hasta cuatro prendas.', rhythmicUnits: 2, defaultDuration: 8, minimumDuration: 4, priority: 'supporting', variantScope: 'all' },
  { id: 'itemShowcase', name: 'Presentación individual', description: 'Presenta cada diseño con tiempo suficiente para leerlo.', rhythmicUnits: 2, defaultDuration: 4.8, minimumDuration: 3.2, priority: 'primary', variantScope: 'all' },
  { id: 'hero', name: 'Toma hero', description: 'Da protagonismo al estampado principal antes de preparar la salida.', rhythmicUnits: 2, defaultDuration: 5.2, minimumDuration: 3.2, priority: 'primary', variantScope: 'lead' },
  { id: 'detailLarge', name: 'Detalle principal', description: 'Acercamiento al estampado principal sin perder tiempo de lectura.', rhythmicUnits: 1, defaultDuration: 3.4, minimumDuration: 2.4, priority: 'supporting', variantScope: 'lead' },
  { id: 'detailSmall', name: 'Detalle companion', description: 'Muestra el companion como acento secundario de la prenda.', rhythmicUnits: 1, defaultDuration: 2.8, minimumDuration: 2, priority: 'detail', variantScope: 'lead' },
]

export const defaultEnabledShotTypes: DirectorShotKind[] = directorShotDefinitions.map((shot) => shot.id)

export const shotDefinition = (id: DirectorShotKind) => directorShotDefinitions.find((shot) => shot.id === id)!
