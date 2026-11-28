import assert from 'node:assert/strict'
import { captionAt, composeNarration, createNarrationBlocks, groupWords, moveNarrationWords, narrationConflicts, placeNarration, splitNarration } from '../src/components/subtitles/narration'

const phrases = splitNarration('El perro caía.\n¿Y ahora, qué? El vecino me avisó.', 'es-CL')
assert.deepEqual(phrases, ['El perro caía.', '¿Y ahora, qué?', 'El vecino me avisó.'])
const blocks = createNarrationBlocks(phrases)
const clips = Object.fromEntries(blocks.map((block, index) => {
  const samples = new Int16Array(24_000)
  samples.fill(1000 * (index + 1))
  return [block.id, { pcm: new Blob([samples.buffer]), signature: block.text }]
}))
const scene = blocks.map((block, index) => ({ ...block, start: [1, 3, 7][index] }))
const packed = placeNarration(scene, clips, true)
const placed = placeNarration(scene, clips)
const wav = composeNarration(placed)
assert.ok(wav)
const data = new DataView(await wav.arrayBuffer())
const sample = (seconds: number) => data.getInt16(44 + Math.round(seconds * 24_000) * 2, true)
assert.equal(sample(1.25), 1000)
assert.equal(sample(3.25), 2000)
assert.equal(sample(6), 0)
assert.equal(sample(7.25), 3000)
assert.equal(data.getUint32(40, true), 8 * 24_000 * 2)

const words = packed.map((item, index) => ({ id: index, text: `Frase ${index + 1}`, start: item.start + .2, end: item.start + .4 }))
const retimed = moveNarrationWords(words, packed, placed)
assert.deepEqual(retimed.map((word) => [word.id, Number(word.start.toFixed(2))]), [[0, 1.2], [1, 3.2], [2, 7.2]])
const grouped = groupWords(retimed, 8)
assert.equal(grouped.length, 3)
assert.equal(captionAt(grouped, 7.25)?.wordIds[0], 2)
assert.equal(captionAt(grouped, 6), undefined)

const collision = placeNarration([{ ...scene[0], start: 7.2 }, scene[2]], clips)
assert.equal(narrationConflicts(collision, 8).overlaps.size, 2)
assert.equal(narrationConflicts(collision, 8).outside.size, 1)
assert.equal(composeNarration(collision), null)
console.log('Subtitle Studio narration QA passed: punctuation, stable word timing, PCM offsets, gaps, overlap and video boundaries.')
