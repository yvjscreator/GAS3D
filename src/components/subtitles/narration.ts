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

export function sequenceUnplacedBlocks(blocks: NarrationBlock[], clips: Record<string, NarrationClip>) {
  let end = 0
  return blocks.map((block) => {
    const start = block.anchored ? block.start : end
    end = Math.max(end, start + clipSeconds(clips[block.id]) + spacing)
    return { ...block, start }
  })
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
  return new Blob([header.buffer, ...result], { type: 'audio/wav' })
}

// The transcript uses a stable, packed audio track. Dragging a block moves the
// same words to the new start without another request or new word IDs.
export function moveNarrationWords(words: SubtitleWord[], packed: Placement[], placed: Placement[]) {
  const locations = new Map(placed.map((part) => [part.block.id, part]))
  return words.flatMap((word) => {
    const midpoint = (word.start + word.end) / 2
    const source = packed.find((part) => midpoint >= part.start && midpoint < part.end)
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
