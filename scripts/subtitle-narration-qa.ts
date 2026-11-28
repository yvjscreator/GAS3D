import assert from 'node:assert/strict'
import { captionAt, composeNarration, createNarrationBlocks, groupWords, moveNarrationWords, narrationConflicts, narrationScript, narrationTakeWav, placeNarration, splitNarration, splitNarrationTake } from '../src/components/subtitles/narration'

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

const collection = createNarrationBlocks([
  'La Snitch Dorada.', 'Un hechizo para ti.', 'La Snitch Dorada.',
  'Más allá del andén.', 'Tu escudo favorito.', 'El castillo de noche.',
  'Aquí empieza la magia.', 'Otro toque de magia.', 'Elige el tuyo.',
])
const takeSamples = new Int16Array(12 * 24_000)
for (let i = 0; i < takeSamples.length; i++) takeSamples[i] = i % 12000 - 6000
const take = { pcm: new Blob([takeSamples.buffer]), signature: narrationScript(collection) }
const transcript = collection.flatMap((block, index) => {
  const tokens = block.text.split(/\s+/u)
  return tokens.flatMap((text, k) => {
    if (index === 1 && text === 'para') return [] // a missed word must not shift the next cut
    const recognized = index === 0 && k === 1 ? 'Snich' : text // differing spelling, stable boundary
    return [{ id: 10 * index + k, text: recognized, start: index * 1.25 + .1 + k * .19, end: index * 1.25 + .24 + k * .19 }]
  })
})
const { source, error } = splitNarrationTake(take, collection, transcript)
assert.equal(error, undefined)
assert.equal(source.length, 9)
assert.equal(source[0].start, 0)
assert.equal(source[1].start, 1.29)
assert.equal(source[2].start, 2.54, 'the repeated Snitch line matches the second occurrence')
assert.equal(source.at(-1)?.end, 12)
const recovered = composeNarration(source)
assert.ok(recovered)
assert.deepEqual(new Uint8Array(await recovered.arrayBuffer()), new Uint8Array(await narrationTakeWav(take).arrayBuffer()), 'unmoved blocks reconstruct one take sample for sample')
const slices = Object.fromEntries(source.map(({ block, clip }) => [block.id, clip]))
const movedBlocks = source.map(({ block, start }, index) => ({ ...block, start: index === 1 ? 15 : start }))
const movedWords = moveNarrationWords(transcript, source, placeNarration(movedBlocks, slices))
assert.ok(Math.abs(movedWords.find((word) => word.id === 10)!.start - 15.06) < 1e-8)
assert.equal(movedWords.find((word) => word.id === 20)?.start, transcript.find((word) => word.id === 20)?.start)
assert.ok(splitNarrationTake(take, collection, transcript.filter((word) => word.id < 50)).error, 'missing phrases must not be cut at guessed times')
const joined = [{ ...collection[0], text: `${collection[0].text} ${collection[1].text}` }, ...collection.slice(2)]
assert.equal(narrationScript(joined), take.signature)
assert.equal(splitNarrationTake(take, joined, transcript).source.length, 8)
console.log('Continuous take QA passed: nine cuts, omissions, repeated words, exact PCM reconstruction, retiming and regrouping.')
