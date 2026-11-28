import type { NarrationBlock, NarrationClip, PresentationSegment, SubtitleCaption, SubtitleWord } from './types'

const sampleRate = 24_000
const spacing = 0.25

export function splitNarration(text: string, locale: string) {
  const paragraphs = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  try {
    const segmenter = new Intl.Segmenter(locale, { granularity: 'sentence' })
    return paragraphs.flatMap((line) => Array.from(segmenter.segment(line), ({ segment }) => segment.trim())).filter(Boolean)
  } catch {
    return paragraphs.flatMap((line) => line.split(/(?<=[.!?…])\s+/))
  }
}

export function createNarrationBlocks(phrases: string[], segments: PresentationSegment[] = []): NarrationBlock[] {
  let offset = 0
  return phrases.map((text, index) => {
    const scene = segments[index]
    const block = {
      id: crypto.randomUUID(),
      text,
      label: scene?.label?.trim() || '',
      visibleText: scene?.visibleText?.trim() || undefined,
      start: scene?.start ?? offset,
      sceneStart: scene?.start ?? null,
      sceneEnd: scene?.end ?? null,
      anchored: Boolean(scene),
    }
    offset += Math.max(0.5, text.split(/\s+/).length / 2.35) + spacing
    return block
  })
}

export function clipSeconds(clip: NarrationClip | undefined) {
  return clip ? clip.pcm.size / 2 / sampleRate : 0
}

export function placeNarration(blocks: NarrationBlock[], clips: Record<string, NarrationClip>, packed = false) {
  let offset = 0
  return blocks.flatMap((block) => {
    const clip = clips[block.id]
    if (!clip) return []
    const start = packed ? offset : Math.round(block.start * sampleRate)
    const end = start + clip.pcm.size / 2
    if (packed) offset = end + Math.round(spacing * sampleRate)
    return [{ block, clip, start: start / sampleRate, end: end / sampleRate, frame: start }]
  })
}

type Placement = ReturnType<typeof placeNarration>[number]

export function narrationScript(blocks: Pick<NarrationBlock, 'text'>[]) {
  return blocks.map((block) => block.text.trim()).join(' ').replace(/\s+/gu, ' ').trim()
}

function spokenTokens(text: string) {
  return text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').match(/[\p{L}\p{N}]+/gu) ?? []
}

// Match the whole script in order. Substitutions allow isolated recognition
// mistakes (including names), while insertions and omissions don't shift all
// subsequent cuts. Distinct token occurrences remain in spoken order.
function alignSpokenWords(expected: string[], actual: string[]) {
  if (expected.length === actual.length && expected.every((word, i) => word === actual[i])) {
    return expected.map((_, index) => index)
  }
  const width = actual.length + 1
  if ((expected.length + 1) * width > 16_000_000) return null
  const paths = new Uint8Array((expected.length + 1) * width)
  let previous = new Uint32Array(width)
  let current = new Uint32Array(width)
  for (let j = 1; j < width; j++) previous[j] = j * 2
  for (let i = 1; i <= expected.length; i++) {
    current[0] = i * 2
    for (let j = 1; j < width; j++) {
      const diagonal = previous[j - 1] + (expected[i - 1] === actual[j - 1] ? 0 : 3)
      const remove = previous[j] + 2
      const insert = current[j - 1] + 2
      if (diagonal <= remove && diagonal <= insert) {
        current[j] = diagonal
        paths[i * width + j] = 1
      } else if (remove <= insert) {
        current[j] = remove
        paths[i * width + j] = 2
      } else {
        current[j] = insert
        paths[i * width + j] = 3
      }
    }
    const next = previous
    previous = current
    current = next
  }
  const mapping = expected.map(() => -1)
  let i = expected.length
  let j = actual.length
  while (i > 0 && j > 0) {
    const path = paths[i * width + j]
    if (path === 1) mapping[--i] = --j
    else if (path === 2) i--
    else j--
  }
  return mapping
}

export function splitNarrationTake(take: NarrationClip, blocks: NarrationBlock[], words: SubtitleWord[]): { source: Placement[]; error?: string } {
  const totalFrames = take.pcm.size / 2
  if (!blocks.length || !words.length || totalFrames <= 0) return { source: [], error: 'No hay palabras con tiempos para separar la toma.' }
  const totalSeconds = totalFrames / sampleRate
  const transcript = words.filter((word) => Number.isFinite(word.start) && word.start >= 0 && word.start < totalSeconds
    && Number.isFinite(word.end) && word.end > word.start).sort((a, b) => a.start - b.start)
  const recognized = transcript.flatMap((word, index) => spokenTokens(word.text).map((token) => ({ token, index })))
  if (!recognized.length) return { source: [], error: 'La transcripción no devolvió palabras con tiempos válidos.' }
  const expected = blocks.map((block) => spokenTokens(block.text))
  const cuts = [0]
  if (blocks.length > 1) {
    const mapping = alignSpokenWords(expected.flat(), recognized.map(({ token }) => token))
    if (!mapping) return { source: [], error: 'La transcripción es demasiado larga para separar todos los bloques.' }
    let offset = 0
    let previousLast = -1
    for (const [index, tokens] of expected.entries()) {
      const matches = mapping.slice(offset, offset + tokens.length)
      offset += tokens.length
      const exact = matches.filter((match, k) => recognized[match]?.token === tokens[k]).length
      const mapped = matches.filter((match) => match >= 0)
      const first = mapped[0]
      const last = mapped.at(-1)
      if (first === undefined || last === undefined || exact < Math.max(1, Math.ceil(tokens.length / 2))) {
        return { source: [], error: `La transcripción no pudo ubicar con confianza la frase ${index + 1}.` }
      }
      const firstWord = recognized[first].index
      if (index > 0) {
        const after = transcript[firstWord].start
        const before = transcript[firstWord - 1]?.end ?? after
        if (firstWord <= previousLast || before - after > 0.12) {
          return { source: [], error: `La transcripción no dio un corte claro antes de la frase ${index + 1}.` }
        }
        // Keep the original pause, assigning up to 60 ms of it to the next
        // clip. Partition the PCM so an unmoved take plays sample-for-sample.
        const time = before > after ? (before + after) / 2 : Math.max(before, after - 0.06)
        const frame = Math.round(time * sampleRate)
        if (frame <= cuts[cuts.length - 1] || frame >= totalFrames) {
          return { source: [], error: `El tiempo de corte de la frase ${index + 1} está fuera de la toma.` }
        }
        cuts.push(frame)
      }
      previousLast = recognized[last].index
    }
  }
  cuts.push(totalFrames)
  const source = blocks.map((block, index) => ({
    block,
    clip: { signature: take.signature, pcm: take.pcm.slice(cuts[index] * 2, cuts[index + 1] * 2) },
    frame: cuts[index],
    start: cuts[index] / sampleRate,
    end: cuts[index + 1] / sampleRate,
  }))
  return { source }
}

export function narrationConflicts(placements: Placement[], duration: number) {
  const overlaps = new Set<string>()
  const outside = new Set<string>()
  const scenes = new Set<string>()
  const sorted = [...placements].sort((a, b) => a.start - b.start)
  sorted.forEach(({ block, start, end }, index) => {
    if (start < 0 || (duration > 0 && end > duration + 1 / sampleRate)) outside.add(block.id)
    if (block.sceneEnd !== null && (end > block.sceneEnd + 0.05 || start < (block.sceneStart ?? 0) - 0.05)) scenes.add(block.id)
    for (let i = index + 1; i < sorted.length && sorted[i].start < end; i++) {
      overlaps.add(block.id)
      overlaps.add(sorted[i].block.id)
    }
  })
  return { overlaps, outside, scenes }
}

export async function decodeNarrationClip(audio: Blob, signature: string): Promise<NarrationClip> {
  const decoder = new OfflineAudioContext(1, 1, sampleRate)
  const decoded = await decoder.decodeAudioData(await audio.arrayBuffer())
  const pcm = new DataView(new ArrayBuffer(decoded.length * 2))
  const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index))
  for (let index = 0; index < decoded.length; index++) {
    const value = channels.reduce((sum, channel) => sum + channel[index], 0) / channels.length
    pcm.setInt16(index * 2, Math.round(Math.max(-1, Math.min(1, value)) * 32767), true)
  }
  return { pcm: new Blob([pcm.buffer]), signature }
}

export function composeNarration(placements: Placement[]) {
  if (!placements.length) return null
  const result: BlobPart[] = []
  let frame = 0
  for (const placement of [...placements].sort((a, b) => a.frame - b.frame)) {
    if (placement.frame < frame) return null
    const silence = placement.frame - frame
    if (silence > 0) result.push(new Uint8Array(silence * 2))
    result.push(placement.clip.pcm)
    frame = placement.frame + placement.clip.pcm.size / 2
  }
  return narrationWav(result, frame)
}

export function narrationTakeWav(take: NarrationClip) {
  return narrationWav([take.pcm], take.pcm.size / 2)
}

function narrationWav(parts: BlobPart[], frame: number) {
  const header = new DataView(new ArrayBuffer(44))
  const writeTag = (offset: number, name: string) => Array.from(name).forEach((letter, index) => header.setUint8(offset + index, letter.charCodeAt(0)))
  writeTag(0, 'RIFF')
  header.setUint32(4, frame * 2 + 36, true)
  writeTag(8, 'WAVE')
  writeTag(12, 'fmt ')
  header.setUint32(16, 16, true)
  header.setUint16(20, 1, true)
  header.setUint16(22, 1, true)
  header.setUint32(24, sampleRate, true)
  header.setUint32(28, sampleRate * 2, true)
  header.setUint16(32, 2, true)
  header.setUint16(34, 16, true)
  writeTag(36, 'data')
  header.setUint32(40, frame * 2, true)
  return new Blob([header.buffer, ...parts], { type: 'audio/wav' })
}

// Move the times from the original take (or the packed track in an older
// project). Keep the same recognized word IDs when a timeline block is moved.
export function moveNarrationWords(words: SubtitleWord[], sourcePlacements: Placement[], placed: Placement[]) {
  const locations = new Map(placed.map((part) => [part.block.id, part]))
  return words.flatMap((word) => {
    const midpoint = (word.start + word.end) / 2
    const source = sourcePlacements.find((part) => midpoint >= part.start && midpoint < part.end)
    const target = source && locations.get(source.block.id)
    if (!source || !target) return []
    return [{
      ...word,
      start: target.start + Math.max(0, word.start - source.start),
      end: target.start + Math.min(source.end, word.end) - source.start,
      blockId: source.block.id,
    }]
  }).sort((a, b) => a.start - b.start)
}

export function groupWords(words: SubtitleWord[], maxWords: number): SubtitleCaption[] {
  const groups: SubtitleCaption[] = []
  let current: SubtitleWord[] = []
  const flush = () => {
    if (!current.length) return
    groups.push({ id: groups.length, start: current[0].start, end: current[current.length - 1].end, wordIds: current.map(({ id }) => id) })
    current = []
  }
  for (const word of words) {
    const previous = current[current.length - 1]
    if (previous && (previous.blockId !== word.blockId || word.start - previous.end > 0.7)) flush()
    current.push(word)
    if (current.length >= maxWords || /[.!?…]$/.test(word.text)) flush()
  }
  flush()
  return groups
}

export function captionAt(captions: SubtitleCaption[], time: number) {
  let active: SubtitleCaption | undefined
  for (const caption of captions) {
    if (caption.start > time + 0.04) break
    active = caption
  }
  return active && time <= active.end + 0.28 ? active : undefined
}
