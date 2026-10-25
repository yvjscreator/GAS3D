export type DtfPrintSizePreset = '40x53' | '35x40' | 'chest-12_5' | 'sleeve-12' | 'custom'

export type DtfPrintSize = {
  widthCm: number
  heightCm: number
}

export type DtfPrintSizeOption = DtfPrintSize & {
  id: DtfPrintSizePreset
  name: string
}

export const DTF_PRINT_SIZES: DtfPrintSizeOption[] = [
  { id: '40x53', name: '40 × 53 cm', widthCm: 40, heightCm: 53 },
  { id: '35x40', name: '35 × 40 cm', widthCm: 35, heightCm: 40 },
  { id: 'chest-12_5', name: 'Pecho 12.5 × 12.5', widthCm: 12.5, heightCm: 12.5 },
  { id: 'sleeve-12', name: 'Manga 12 × 12', widthCm: 12, heightCm: 12 },
  { id: 'custom', name: 'Personalizado', widthCm: 20, heightCm: 20 },
]

export type DtfAnalysisStatus = 'ok' | 'warn' | 'risk'

export type DtfPrintabilityAnalysis = {
  effectivePpi: number
  ppiX: number
  ppiY: number
  resolutionStatus: DtfAnalysisStatus
  minLineMm: number
  thinPixels: number
  thinPercent: number
  smallComponents: number
  smallPixels: number
  partialAlphaPixels: number
  alphaBinary: boolean
  overlay: ImageData
}

const clampSize = (value: number) => Number.isFinite(value) ? Math.max(0.1, value) : 0.1

export function resolveDtfPrintSize(
  preset: DtfPrintSizePreset,
  customWidthCm: number,
  customHeightCm: number,
): DtfPrintSize {
  if (preset === 'custom') {
    return { widthCm: clampSize(customWidthCm), heightCm: clampSize(customHeightCm) }
  }
  const option = DTF_PRINT_SIZES.find((entry) => entry.id === preset) ?? DTF_PRINT_SIZES[0]
  return { widthCm: option.widthCm, heightCm: option.heightCm }
}

function resolutionStatus(ppi: number): DtfAnalysisStatus {
  if (ppi >= 200) return 'ok'
  if (ppi >= 150) return 'warn'
  return 'risk'
}

function paint(overlay: Uint8ClampedArray, index: number, r: number, g: number, b: number, alpha: number) {
  const offset = index * 4
  // Higher-priority diagnostics overwrite lower-priority ones.
  if (overlay[offset + 3] > alpha) return
  overlay[offset] = r
  overlay[offset + 1] = g
  overlay[offset + 2] = b
  overlay[offset + 3] = alpha
}

export function analyzeDtfPrintability(
  image: ImageData,
  finalSize: DtfPrintSize,
  originalDimensions: { width: number; height: number },
  minLineMm = 0.4,
  minDetailMm = 0.5,
  binaryExport = false,
): DtfPrintabilityAnalysis {
  const width = image.width
  const height = image.height
  const total = Math.max(1, width * height)
  const widthCm = clampSize(finalSize.widthCm)
  const heightCm = clampSize(finalSize.heightCm)
  const ppiX = originalDimensions.width / (widthCm / 2.54)
  const ppiY = originalDimensions.height / (heightCm / 2.54)
  const effectivePpi = Math.min(ppiX, ppiY)
  const mmPerPixelX = widthCm * 10 / Math.max(1, width)
  const mmPerPixelY = heightCm * 10 / Math.max(1, height)

  const printed = new Uint8Array(total)
  const overlay = new Uint8ClampedArray(total * 4)
  let printedCount = 0
  let partialAlphaPixels = 0

  for (let index = 0, offset = 3; index < total; index++, offset += 4) {
    const alpha = image.data[offset]
    if (alpha > 12) {
      printed[index] = 1
      printedCount++
    }
    // A filtered overview has partial coverage even when the native screen
    // exports binary alpha. Do not diagnose display filtering as a print fault.
    if (!binaryExport && alpha > 0 && alpha < 255) {
      partialAlphaPixels++
      paint(overlay, index, 245, 196, 72, 112)
    }
  }

  // Estimate local stroke width using complete horizontal and vertical runs.
  // This is intentionally conservative and catches fragile hairlines without
  // flagging the normal outer edge of a broad filled shape.
  const horizontal = new Uint32Array(total)
  for (let y = 0; y < height; y++) {
    const row = y * width
    let x = 0
    while (x < width) {
      if (!printed[row + x]) { x++; continue }
      const start = x
      while (x < width && printed[row + x]) x++
      const run = x - start
      for (let xx = start; xx < x; xx++) horizontal[row + xx] = run
    }
  }

  const vertical = new Uint32Array(total)
  for (let x = 0; x < width; x++) {
    let y = 0
    while (y < height) {
      const index = y * width + x
      if (!printed[index]) { y++; continue }
      const start = y
      while (y < height && printed[y * width + x]) y++
      const run = y - start
      for (let yy = start; yy < y; yy++) vertical[yy * width + x] = run
    }
  }

  let thinPixels = 0
  for (let index = 0; index < total; index++) {
    if (!printed[index]) continue
    const widthMm = horizontal[index] * mmPerPixelX
    const heightMm = vertical[index] * mmPerPixelY
    if (Math.min(widthMm, heightMm) < minLineMm) {
      thinPixels++
      paint(overlay, index, 239, 78, 78, 154)
    }
  }

  // Connected components identify tiny isolated dots / ink islands.
  const visited = new Uint8Array(total)
  const queue = new Int32Array(total)
  const minAreaMm2 = minDetailMm * minDetailMm
  const pixelAreaMm2 = mmPerPixelX * mmPerPixelY
  let smallComponents = 0
  let smallPixels = 0

  for (let seed = 0; seed < total; seed++) {
    if (!printed[seed] || visited[seed]) continue
    let head = 0
    let tail = 0
    queue[tail++] = seed
    visited[seed] = 1

    while (head < tail) {
      const index = queue[head++]
      const x = index % width
      const y = Math.floor(index / width)
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= height) continue
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue
          const xx = x + dx
          if (xx < 0 || xx >= width) continue
          const next = yy * width + xx
          if (!printed[next] || visited[next]) continue
          visited[next] = 1
          queue[tail++] = next
        }
      }
    }

    if (tail * pixelAreaMm2 < minAreaMm2) {
      smallComponents++
      smallPixels += tail
      for (let i = 0; i < tail; i++) paint(overlay, queue[i], 245, 137, 52, 190)
    }
  }

  return {
    effectivePpi,
    ppiX,
    ppiY,
    resolutionStatus: resolutionStatus(effectivePpi),
    minLineMm,
    thinPixels,
    thinPercent: printedCount ? thinPixels / printedCount * 100 : 0,
    smallComponents,
    smallPixels,
    partialAlphaPixels,
    alphaBinary: partialAlphaPixels === 0,
    overlay: new ImageData(overlay, width, height),
  }
}

export function buildDtfPromptBlock(size: DtfPrintSize, minLineMm = 0.4) {
  const width = clampSize(size.widthCm)
  const height = clampSize(size.heightCm)
  return [
    'DTF PRINTABILITY REQUIREMENTS',
    '',
    `FINAL_PRINT_SIZE = ${width.toFixed(width % 1 ? 1 : 0)} x ${height.toFixed(height % 1 ? 1 : 0)} cm`,
    'PRINT_METHOD = DTF',
    `MIN_PRINTABLE_LINE = ${minLineMm.toFixed(1)} mm`,
    'MIN_PRINTABLE_DETAIL = 0.5 mm',
    '',
    '- Avoid hairline strokes, ultra-thin lines, microscopic texture, and fragile isolated marks.',
    '- Important lines, strokes, and printed details must remain physically printable at final size.',
    `- Prefer essential strokes to be at least ${minLineMm.toFixed(1)}–0.5 mm thick at final print size.`,
    '- Avoid relying on single-pixel or near-single-pixel texture.',
    '- Merge, reinforce, or simplify extremely fine details when necessary while preserving the style.',
    '- Distressed, sketch, ink, or grunge textures must use printable marks and printable gaps, not microscopic noise.',
    '- Preserve readability and visual impact after transfer, adhesive powder application, and pressing.',
    '- Prioritize DTF durability and printability without making the design feel heavy or clumsy.',
  ].join('\n')
}
