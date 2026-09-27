import type { SubtitleExportOptions, SubtitlePresetId } from './types'

export type SubtitlePreset = {
  id: SubtitlePresetId
  name: string
  description: string
  sample: string
  options: Pick<SubtitleExportOptions, 'baseColor' | 'activeColor' | 'outlineColor' | 'effectColor' | 'fontScale' | 'verticalPosition' | 'maxWords' | 'uppercase'>
}

export const subtitlePresets: SubtitlePreset[] = [
  {
    id: 'viral',
    name: 'Viral Pop',
    description: 'Entrada con rebote y palabra activa amarilla.',
    sample: 'ESTO CAMBIA TODO',
    options: { baseColor: '#FFFFFF', activeColor: '#FFE347', outlineColor: '#050505', effectColor: '#FFE347', fontScale: 6.2, verticalPosition: 0.82, maxWords: 4, uppercase: false },
  },
  {
    id: 'clean',
    name: 'Clean',
    description: 'Minimalista, legible y elegante para aprendizaje.',
    sample: 'Aprende más rápido',
    options: { baseColor: '#FFFFFF', activeColor: '#65D8FF', outlineColor: '#111820', effectColor: '#65D8FF', fontScale: 5.3, verticalPosition: 0.82, maxWords: 6, uppercase: false },
  },
  {
    id: 'punch',
    name: 'Punch',
    description: 'Mayúsculas, caja activa y golpe visual fuerte.',
    sample: 'NO HAGAS ESTO',
    options: { baseColor: '#FFFFFF', activeColor: '#FF7A45', outlineColor: '#050505', effectColor: '#FF7A45', fontScale: 6.4, verticalPosition: 0.5, maxWords: 3, uppercase: true },
  },
  {
    id: 'neon',
    name: 'Neon Glow',
    description: 'Glow dinámico para gaming, tecnología y contenido nocturno.',
    sample: 'MIRA ESTE TRUCO',
    options: { baseColor: '#F3F7FF', activeColor: '#FF58D6', outlineColor: '#11101A', effectColor: '#FF58D6', fontScale: 5.8, verticalPosition: 0.82, maxWords: 5, uppercase: false },
  },
  {
    id: 'karaoke',
    name: 'Karaoke Focus',
    description: 'Contexto atenuado, palabra activa y subrayado progresivo.',
    sample: 'sigue cada palabra',
    options: { baseColor: '#F2F4F7', activeColor: '#6EFFA8', outlineColor: '#090D11', effectColor: '#6EFFA8', fontScale: 5.8, verticalPosition: 0.82, maxWords: 5, uppercase: false },
  },
  {
    id: 'cinema',
    name: 'Cinema',
    description: 'Tipografía editorial, entrada suave y énfasis cálido.',
    sample: 'Una historia comienza aquí',
    options: { baseColor: '#FFF8EC', activeColor: '#FFD29A', outlineColor: '#16120E', effectColor: '#FFD29A', fontScale: 4.8, verticalPosition: 0.82, maxWords: 7, uppercase: false },
  },
  {
    id: 'bubble',
    name: 'Bubble',
    description: 'Palabra activa dentro de una cápsula elástica y llamativa.',
    sample: 'MUY FÁCIL',
    options: { baseColor: '#FFFFFF', activeColor: '#111111', outlineColor: '#050505', effectColor: '#FFE347', fontScale: 6.0, verticalPosition: 0.82, maxWords: 4, uppercase: true },
  },
  {
    id: 'focus',
    name: 'Focus Box',
    description: 'Bloque oscuro suave con la palabra actual iluminada.',
    sample: 'Presta atención aquí',
    options: { baseColor: '#DCE7F2', activeColor: '#FFFFFF', outlineColor: '#07111A', effectColor: '#06101B', fontScale: 5.5, verticalPosition: 0.82, maxWords: 5, uppercase: false },
  },
]

export const getSubtitlePreset = (id: SubtitlePresetId) => subtitlePresets.find((preset) => preset.id === id) ?? subtitlePresets[0]
