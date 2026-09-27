import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
} from 'mediabunny'
import type { SubtitleCaption, SubtitleExportOptions, SubtitlePresetId, SubtitleWord } from './types'

export type LocalExportProgress = {
  progress: number
  message: string
}

export type LocalExportRequest = {
  file: File
  words: SubtitleWord[]
  options: SubtitleExportOptions
  onProgress?: (state: LocalExportProgress) => void
}

type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

type RenderWord = {
  id: number
  text: string
  start: number
  end: number
}

type WordBox = {
  word: RenderWord
  x: number
  y: number
  width: number
  lineHeight: number
  lineIndex: number
}

const groupWords = (words: RenderWord[], maxWords: number): SubtitleCaption[] => {
  const groups: SubtitleCaption[] = []
  let current: RenderWord[] = []

  const flush = () => {
    if (!current.length) return
    groups.push({
      id: groups.length,
      start: current[0].start,
      end: current[current.length - 1].end,
      wordIds: current.map((word) => word.id),
    })
    current = []
  }

  for (const word of words) {
    const previous = current[current.length - 1]
    if (previous && word.start - previous.end > 0.7) flush()
    current.push(word)
    if (current.length >= maxWords || /[.!?…]$/.test(word.text)) flush()
  }

  flush()
  return groups
}

const easeOutBack = (value: number) => {
  const x = Math.min(1, Math.max(0, value))
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}

const easeOutCubic = (value: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, value)), 3)

const hexToRgba = (hex: string, alpha: number) => {
  const value = hex.replace('#', '').trim()
  const normalized = value.length === 3 ? value.split('').map((part) => part + part).join('') : value
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return `rgba(0,0,0,${alpha})`
  const red = Number.parseInt(normalized.slice(0, 2), 16)
  const green = Number.parseInt(normalized.slice(2, 4), 16)
  const blue = Number.parseInt(normalized.slice(4, 6), 16)
  return `rgba(${red},${green},${blue},${alpha})`
}

const roundedRect = (ctx: Canvas2D, x: number, y: number, width: number, height: number, radius: number) => {
  const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)
  ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

const fontFamilyForPreset = (preset: SubtitlePresetId) => {
  if (preset === 'cinema') return 'Georgia, "Times New Roman", serif'
  return 'Arial, Helvetica, sans-serif'
}

const fontWeightForPreset = (preset: SubtitlePresetId) => {
  if (preset === 'cinema') return 800
  if (preset === 'clean') return 800
  return 900
}

const buildWordBoxes = (
  ctx: Canvas2D,
  words: RenderWord[],
  width: number,
  fontSize: number,
  maxWidth: number,
  lineHeight: number,
) => {
  const gap = Math.max(7, fontSize * 0.22)
  const lines: Array<Array<{ word: RenderWord; width: number }>> = []
  let line: Array<{ word: RenderWord; width: number }> = []
  let lineWidth = 0

  for (const word of words) {
    const measured = ctx.measureText(word.text).width
    const addition = (line.length ? gap : 0) + measured
    if (line.length && lineWidth + addition > maxWidth) {
      lines.push(line)
      line = []
      lineWidth = 0
    }
    line.push({ word, width: measured })
    lineWidth += (line.length > 1 ? gap : 0) + measured
  }
  if (line.length) lines.push(line)

  const boxes: WordBox[] = []
  lines.forEach((items, lineIndex) => {
    const total = items.reduce((sum, item, index) => sum + item.width + (index ? gap : 0), 0)
    let cursor = width / 2 - total / 2
    for (const item of items) {
      boxes.push({
        word: item.word,
        x: cursor,
        y: lineIndex * lineHeight,
        width: item.width,
        lineHeight,
        lineIndex,
      })
      cursor += item.width + gap
    }
  })

  return { boxes, lineCount: lines.length }
}

const drawSubtitleFrame = (
  ctx: Canvas2D,
  width: number,
  height: number,
  time: number,
  words: RenderWord[],
  captions: SubtitleCaption[],
  options: SubtitleExportOptions,
) => {
  const caption = captions.find((item) => time >= item.start - 0.04 && time <= item.end + 0.28)
  if (!caption) return

  const byId = new Map(words.map((word) => [word.id, word]))
  const captionWords = caption.wordIds.map((id) => byId.get(id)).filter((word): word is RenderWord => Boolean(word))
  if (!captionWords.length) return

  const active = captionWords.find((word, index) => {
    const next = captionWords[index + 1]
    const boundary = next?.start ?? caption.end + 0.22
    return time >= word.start - 0.03 && time < boundary
  }) ?? captionWords[captionWords.length - 1]

  const fontSize = Math.max(24, Math.round(height * options.fontScale / 100))
  const lineHeight = fontSize * 1.12
  const maxWidth = width * 0.86
  const fontFamily = fontFamilyForPreset(options.preset)
  const fontWeight = fontWeightForPreset(options.preset)

  ctx.save()
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.lineJoin = 'round'
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`

  const { boxes, lineCount } = buildWordBoxes(ctx, captionWords, width, fontSize, maxWidth, lineHeight)
  const totalHeight = lineCount * lineHeight
  const baseY = options.position === 'top'
    ? height * 0.11
    : options.position === 'center'
      ? height / 2 - totalHeight / 2
      : height - height * 0.12 - totalHeight

  const entryProgress = easeOutCubic((time - caption.start + 0.05) / 0.2)
  const captionAlpha = options.preset === 'cinema' ? entryProgress : 1

  if (options.preset === 'focus') {
    const padX = fontSize * 0.38
    const padY = fontSize * 0.25
    roundedRect(ctx, width * 0.07, baseY - padY, width * 0.86, totalHeight + padY * 1.35, fontSize * 0.22)
    ctx.fillStyle = 'rgba(3, 10, 17, .78)'
    ctx.fill()
  }

  for (const box of boxes) {
    const isActive = box.word.id === active.id
    const localProgress = Math.min(1, Math.max(0, (time - box.word.start + 0.02) / Math.max(0.12, box.word.end - box.word.start)))
    const pop = easeOutBack(Math.min(1, localProgress * 1.8))
    const baseScale =
      options.preset === 'punch' ? 1.16 :
      options.preset === 'bubble' ? 1.14 :
      options.preset === 'viral' ? 1.12 :
      options.preset === 'neon' ? 1.09 :
      options.preset === 'karaoke' ? 1.07 :
      options.preset === 'cinema' ? 1.03 :
      options.preset === 'clean' ? 1.04 : 1.05
    const scale = isActive ? 1 + (baseScale - 1) * pop : 1

    const centerX = box.x + box.width / 2
    const baselineY = baseY + box.y + fontSize
    const inactiveAlpha = options.preset === 'karaoke' ? 0.42 : options.preset === 'focus' ? 0.68 : 1

    ctx.save()
    ctx.globalAlpha = captionAlpha * (isActive ? 1 : inactiveAlpha)
    ctx.translate(centerX, baselineY - fontSize * 0.42)
    ctx.scale(scale, scale)
    ctx.translate(-centerX, -(baselineY - fontSize * 0.42))

    if (options.preset === 'punch' && isActive) {
      const padX = fontSize * 0.22
      const padY = fontSize * 0.11
      roundedRect(ctx, box.x - padX, baselineY - fontSize - padY, box.width + padX * 2, fontSize + padY * 1.8, fontSize * 0.13)
      ctx.fillStyle = options.activeColor
      ctx.fill()
    }

    if (options.preset === 'bubble' && isActive) {
      const padX = fontSize * 0.32
      const padY = fontSize * 0.14
      roundedRect(ctx, box.x - padX, baselineY - fontSize - padY, box.width + padX * 2, fontSize + padY * 2, fontSize * 0.5)
      ctx.fillStyle = '#FFE347'
      ctx.shadowColor = 'rgba(0,0,0,.35)'
      ctx.shadowBlur = fontSize * 0.2
      ctx.fill()
      ctx.shadowBlur = 0
    }

    if (options.preset === 'neon' && isActive) {
      ctx.shadowColor = options.activeColor
      ctx.shadowBlur = fontSize * 0.34
    } else {
      ctx.shadowColor = 'rgba(0,0,0,.55)'
      ctx.shadowBlur = fontSize * 0.12
    }

    const fillColor = options.preset === 'punch' && isActive
      ? '#FFFFFF'
      : options.preset === 'bubble' && isActive
        ? options.activeColor
        : isActive
          ? options.activeColor
          : options.baseColor

    ctx.lineWidth = Math.max(2, fontSize * 0.085)
    ctx.strokeStyle = options.outlineColor
    ctx.strokeText(box.word.text, box.x, baselineY)
    ctx.fillStyle = fillColor
    ctx.fillText(box.word.text, box.x, baselineY)

    if (options.preset === 'karaoke' && isActive) {
      const underlineY = baselineY + fontSize * 0.11
      const underlineWidth = box.width * Math.min(1, localProgress * 1.3)
      ctx.strokeStyle = options.activeColor
      ctx.lineWidth = Math.max(3, fontSize * 0.055)
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(box.x, underlineY)
      ctx.lineTo(box.x + underlineWidth, underlineY)
      ctx.stroke()
    }

    ctx.restore()
  }

  ctx.restore()
}

export async function exportSubtitledVideoLocally({ file, words, options, onProgress }: LocalExportRequest) {
  if (!('VideoEncoder' in window) || !('VideoDecoder' in window)) {
    throw new Error('Este navegador no tiene WebCodecs. La exportación local requiere Chrome/Edge/Safari moderno con WebCodecs.')
  }

  onProgress?.({ progress: 0.01, message: 'Analizando video en el dispositivo…' })

  const resolvedWords: RenderWord[] = words.map((word) => {
    const replacement = options.wordOverrides[word.id]
    const text = replacement?.trim() || word.text
    return {
      id: word.id,
      text: options.uppercase || options.preset === 'punch' || options.preset === 'bubble' ? text.toUpperCase() : text,
      start: word.start,
      end: word.end,
    }
  })
  const captions = groupWords(resolvedWords, options.maxWords)

  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(file),
  })

  const videoTrack = await input.getPrimaryVideoTrack()
  if (!videoTrack) throw new Error('El archivo no contiene una pista de video.')

  const width = await videoTrack.getDisplayWidth()
  const height = await videoTrack.getDisplayHeight()
  const decodable = await videoTrack.canDecode()
  if (!decodable) throw new Error('Este dispositivo no puede decodificar el codec del video original mediante WebCodecs.')

  const target = new BufferTarget()
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target,
  })

  let canvas: HTMLCanvasElement | null = null
  let ctx: CanvasRenderingContext2D | null = null

  const conversion = await Conversion.init({
    input,
    output,
    video: {
      codec: 'avc',
      quality: new Quality('high'),
      hardwareAcceleration: 'prefer-hardware',
      forceTranscode: true,
      processedWidth: width,
      processedHeight: height,
      process: (sample) => {
        if (!canvas || !ctx) {
          canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          ctx = canvas.getContext('2d', { alpha: false })
          if (!ctx) throw new Error('No se pudo crear el lienzo de exportación.')
        }

        ctx.clearRect(0, 0, width, height)
        sample.draw(ctx, 0, 0, width, height)
        drawSubtitleFrame(ctx, width, height, sample.timestamp, resolvedWords, captions, options)
        return canvas
      },
    },
  })

  if (!conversion.isValid) {
    const reasons = conversion.discardedTracks.map((item) => item.reason).filter(Boolean).join(' · ')
    throw new Error(
      reasons
        ? `Este dispositivo no puede exportar este video en MP4/H.264: ${reasons}`
        : 'Este dispositivo no puede exportar este video en MP4/H.264 mediante WebCodecs.',
    )
  }

  conversion.onProgress = (progress) => {
    const bounded = Math.min(0.99, Math.max(0.02, progress))
    onProgress?.({
      progress: bounded,
      message: `Exportando en el dispositivo… ${Math.round(bounded * 100)}%`,
    })
  }

  await conversion.execute()

  if (!target.buffer) throw new Error('La exportación terminó, pero no se generó el archivo MP4.')

  onProgress?.({ progress: 1, message: 'MP4 listo.' })
  return new Blob([target.buffer], { type: 'video/mp4' })
}
