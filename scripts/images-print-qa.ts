import assert from 'node:assert/strict'
import { deflateSync, inflateSync } from 'node:zlib'
import { getExportGeometry } from '../src/components/images/printExport'
import { DEFAULT_ALPHA_SETTINGS, optimizeImageAlpha, analyzeAlpha, type AlphaOptimizationSettings, type DtfPattern } from '../src/components/images/alphaOptimization'
import { embedSrgbIcc, inspectPng, verifyPrintPng } from '../src/components/images/colorManagement'
import { assertStreamedDimensions, isLargeImage, readPngSourceSize } from '../src/components/images/largeImageExport'
import { analyzeDtfPrintability } from '../src/components/images/dtfAnalysis'

// The streamed path begins above, not instead of, the existing memory caps.
let mobileViewport = false
Object.defineProperty(globalThis, 'window', { configurable: true, value: { matchMedia: () => ({ matches: mobileViewport }) } })
assert.equal(isLargeImage({ width: 6000, height: 5000 }), false)
assert.equal(isLargeImage({ width: 6001, height: 5000 }), true)
mobileViewport = true
assert.equal(isLargeImage({ width: 4500, height: 4000 }), false)
assert.equal(isLargeImage({ width: 4501, height: 4000 }), true)
Reflect.deleteProperty(globalThis, 'window')
Object.defineProperty(globalThis, 'ImageData', { configurable: true, value: class {
  constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
} })

const profile: AlphaOptimizationSettings = { method: 'dtf', dtfMode: 'halftone', cleanupPercent: 10, cellPixels: 8 }
assert.equal(DEFAULT_ALPHA_SETTINGS.pattern, 'stochastic')
const xl = getExportGeometry(3000, 3975, 'print-40x53')
assert.deepEqual([xl.width, xl.height, xl.dpi], [3000, 3975, 300])
assert.deepEqual([xl.x, xl.y, xl.drawWidth, xl.drawHeight, xl.upscaled], [0, 0, 3000, 3975, false])

const medium = getExportGeometry(2000, 2000, 'print-35x40')
assert.deepEqual([medium.width, medium.height, medium.dpi], [2000, 2000, 300])
assert.deepEqual([medium.x, medium.y, medium.drawWidth, medium.drawHeight, medium.upscaled], [0, 0, 2000, 2000, false])
const icon = getExportGeometry(2000, 2000, 'companion-2x')
assert.deepEqual([icon.width, icon.height, icon.dpi], [2000, 2000, null])
assert.equal(icon.upscaled, false)

const img = { width: 16, height: 16, data: new Uint8ClampedArray(16 * 16 * 4) } as ImageData
for (let i = 0; i < img.data.length; i += 4) {
  img.data[i] = 200
  img.data[i + 1] = 75
  img.data[i + 2] = 110
  img.data[i + 3] = i % 16 < 8 ? 120 : 225
}
const before = analyzeAlpha(img)
assert.ok(before.partial > 0)
optimizeImageAlpha(img, profile)
assert.equal(analyzeAlpha(img).partial, 0)
assert.ok(img.data.every((byte, i) => i % 4 !== 3 || byte === 0 || byte === 255))
// DTF regression: high-contrast face/eye details must not become flat averaged dots.
const artwork = { width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4) } as ImageData
for (let i = 0; i < artwork.data.length; i += 4) {
  artwork.data.set([65, 61, 83, 160], i)
}
const eye = (3 * 8 + 3) * 4
artwork.data.set([230, 28, 45, 160], eye)
const solidPixel = (2 * 8 + 2) * 4
artwork.data.set([254, 240, 226, 255], solidPixel)
const inputColors = new Uint8ClampedArray(artwork.data)
optimizeImageAlpha(artwork, { ...profile, detailProtection: 100 })
assert.deepEqual(Array.from(artwork.data.slice(solidPixel, solidPixel + 4)), [254, 240, 226, 255])
assert.deepEqual(Array.from(artwork.data.slice(eye, eye + 4)), [230, 28, 45, 255])
for (let i = 0; i < artwork.data.length; i += 4) {
  if (artwork.data[i + 3] === 255) {
    assert.deepEqual(Array.from(artwork.data.slice(i, i + 3)), Array.from(inputColors.slice(i, i + 3)))
  }
}
assert.equal(analyzeAlpha(artwork).partial, 0)

for (const pattern of ['stochastic', 'dots', 'lines', 'ordered'] as DtfPattern[]) {
  const sample = { width: 19, height: 17, data: new Uint8ClampedArray(19 * 17 * 4) } as ImageData
  for (let i = 0; i < sample.data.length; i += 4) sample.data.set([120, 80, 200, 128], i)
  optimizeImageAlpha(sample, { ...profile, pattern, detailProtection: 0 })
  assert.equal(analyzeAlpha(sample).partial, 0, pattern + ' must quantize alpha to 0/255')
}

const flatAlpha = (width: number, height: number, alpha: number) => {
  const sample = { width, height, data: new Uint8ClampedArray(width * height * 4) } as ImageData
  for (let i = 0; i < sample.data.length; i += 4) sample.data.set([180, 90, 210, alpha], i)
  return sample
}
// Round dots / continuous stripes should follow the fade, rather than jump
// between the four old line-screen levels. Coverage is checked, not a snapshot.
for (const pattern of ['stochastic', 'dots', 'lines'] as DtfPattern[]) {
  for (const alpha of [20, 64, 128, 192, 235]) {
    const sample = flatAlpha(512, 512, alpha)
    optimizeImageAlpha(sample, { ...profile, pattern, cellPixels: 16, cleanupPercent: 0, detailProtection: 0, angle: 45 })
    const coverage = analyzeAlpha(sample).opaque / (sample.width * sample.height)
    assert.ok(Math.abs(coverage - alpha / 255) < 0.015, `${pattern}: ${alpha} coverage = ${coverage}`)
  }
}
const roundDot = flatAlpha(32, 32, 128)
optimizeImageAlpha(roundDot, { ...profile, pattern: 'dots', cellPixels: 32, angle: 0, detailProtection: 0 })
assert.equal(roundDot.data[3], 0, 'Round dots leave the cell corners empty')
assert.equal(roundDot.data[(16 * 32 + 16) * 4 + 3], 255, 'Round dots fill their center')
assert.equal(roundDot.data[(3 * 32 + 16) * 4 + 3], 255, 'Round dot extends towards its axis')
assert.equal(roundDot.data[(3 * 32 + 3) * 4 + 3], 0, 'Round dot does not form a square')
for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
  assert.equal(roundDot.data[(y * 32 + x) * 4 + 3], roundDot.data[(x * 32 + y) * 4 + 3], 'Dot symmetry')
}
// A panned native crop must match the same pixels of the final full frame.
// Test non-aligned X/Y origins, all pitches and rotated screens, with detail halos.
for (const pattern of ['stochastic', 'dots', 'lines', 'ordered'] as DtfPattern[]) {
  for (const cellPixels of [8, 12, 16]) for (const angle of [0, 45, 70]) {
    const full = flatAlpha(137, 113, 128)
    for (let y = 0; y < full.height; y++) for (let x = 0; x < full.width; x++) {
      full.data.set([(x * 7) % 256, (y * 11) % 256, 160, 35 + (x + y * 7) % 220], (y * full.width + x) * 4)
    }
    const crop = flatAlpha(53, 61, 0)
    const sx = 37, sy = 23
    for (let y = 0; y < crop.height; y++) {
      const offset = ((sy + y) * full.width + sx) * 4
      crop.data.set(full.data.subarray(offset, offset + crop.width * 4), y * crop.width * 4)
    }
    const settings = { ...profile, pattern, cellPixels, angle, detailProtection: 85 }
    optimizeImageAlpha(full, settings)
    optimizeImageAlpha(crop, settings, sy, sx)
    for (let y = 1; y < crop.height - 1; y++) {
      const expected = full.data.subarray(((sy + y) * full.width + sx + 1) * 4, ((sy + y) * full.width + sx + crop.width - 1) * 4)
      const actual = crop.data.subarray((y * crop.width + 1) * 4, (y * crop.width + crop.width - 1) * 4)
      assert.deepEqual(actual, expected, `${pattern}/${cellPixels}/${angle}: cropped native detail must match export`)
    }
  }
}
const overview = flatAlpha(24, 24, 128)
optimizeImageAlpha(overview, { ...profile, detailProtection: 0 }, 0, 0, 6)
assert.equal(analyzeAlpha(overview).partial, 24 * 24, 'A reduced overview filters subpixel grain instead of exaggerating it')
const overviewAnalysis = analyzeDtfPrintability(overview, { widthCm: 10, heightCm: 10 }, { width: 144, height: 144 }, 0.4, 0.5, true)
assert.equal(overviewAnalysis.alphaBinary, true, 'Filtered overview coverage must not become a false final-alpha warning')
const preservedAnalysis = analyzeDtfPrintability(overview, { widthCm: 10, heightCm: 10 }, { width: 144, height: 144 })
assert.equal(preservedAnalysis.alphaBinary, false, 'Preserve-alpha mode still diagnoses actual semitransparency')
const native = flatAlpha(24, 24, 128)
optimizeImageAlpha(native, { ...profile, detailProtection: 0 })
assert.equal(analyzeAlpha(native).partial, 0, 'Native exports always keep binary alpha')

// Processing chunks with a one-row halo must match a full-frame DTF pass.
const continuous = { width: 13, height: 11, data: new Uint8ClampedArray(13 * 11 * 4) } as ImageData
for (let y = 0; y < continuous.height; y++) for (let x = 0; x < continuous.width; x++) {
  const i = (y * continuous.width + x) * 4
  continuous.data.set([(x * 43) % 256, (y * 47) % 256, (x * y * 19) % 256, 75 + (x * 13 + y * 17) % 170], i)
}
const allAtOnce = { width: continuous.width, height: continuous.height,
  data: new Uint8ClampedArray(continuous.data) } as ImageData
const inStrips = new Uint8ClampedArray(continuous.data.length)
const edgeSafe = { ...profile, detailProtection: 90, cellPixels: 8 }
optimizeImageAlpha(allAtOnce, edgeSafe)
for (let y = 0; y < continuous.height; y += 3) {
  const h = Math.min(3, continuous.height - y)
  const top = Math.max(0, y - 1)
  const bottom = Math.min(continuous.height, y + h + 1)
  const bytesPerRow = continuous.width * 4
  const crop = { width: continuous.width, height: bottom - top,
    data: continuous.data.slice(top * bytesPerRow, bottom * bytesPerRow) } as ImageData
  optimizeImageAlpha(crop, edgeSafe, top)
  const offset = (y - top) * bytesPerRow
  inStrips.set(crop.data.slice(offset, offset + h * bytesPerRow), y * bytesPerRow)
}
assert.deepEqual(Array.from(inStrips), Array.from(allAtOnce.data))

const preserved = { width: 1, height: 1, data: new Uint8ClampedArray([100, 90, 80, 74]) } as ImageData
optimizeImageAlpha(preserved, { ...profile, method: 'dtg' })
assert.equal(preserved.data[3], 74)
const solid = { width: 2, height: 1, data: new Uint8ClampedArray([100, 90, 80, 60, 100, 90, 80, 200]) } as ImageData
optimizeImageAlpha(solid, { ...profile, dtfMode: 'solid' })
assert.deepEqual([solid.data[3], solid.data[7]], [0, 255])

const crcTable = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let n = i
  for (let j = 0; j < 8; j++) n = (n & 1) ? (0xedb88320 ^ (n >>> 1)) : (n >>> 1)
  crcTable[i] = n >>> 0
}
function crc(input: Uint8Array) {
  let n = 0xffffffff
  for (const b of input) n = crcTable[(n ^ b) & 255] ^ (n >>> 8)
  return (n ^ 0xffffffff) >>> 0
}
function chunk(type: string, bytes: Uint8Array) {
  const buf = Buffer.alloc(bytes.length + 12)
  buf.writeUInt32BE(bytes.length, 0)
  buf.write(type, 4, 'ascii')
  Buffer.from(bytes).copy(buf, 8)
  buf.writeUInt32BE(crc(new Uint8Array(buf.subarray(4, buf.length - 4))), buf.length - 4)
  return buf
}
// A minimal 1x1 RGBA/8 PNG whose physical resolution is 300 ppp.
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6
const ppm = Buffer.alloc(9); ppm.writeUInt32BE(11811, 0); ppm.writeUInt32BE(11811, 4); ppm[8] = 1
const png = Buffer.concat([
  Buffer.from([137,80,78,71,13,10,26,10]),
  chunk('IHDR', ihdr), chunk('pHYs', ppm),
  chunk('IDAT', deflateSync(Buffer.from([0,220,40,30,180]))),
  chunk('IEND', Buffer.alloc(0)),
])
const pngHeader = await readPngSourceSize(new Blob([new Uint8Array(png)]))
assert.deepEqual(pngHeader, { width: 1, height: 1 }, 'PNG dimensions should be readable without decoding a full bitmap')
assert.equal(await readPngSourceSize(new Blob([new Uint8Array([0, 1, 2, 3])])), null)
assert.doesNotThrow(() => assertStreamedDimensions({ width: 13_535, height: 4_725 }), 'A 64MP collage PNG must be accepted for streaming')
assert.throws(() => assertStreamedDimensions({ width: 18_000, height: 4_000 }), 'Canvas/browser axis bounds still apply')
assert.throws(() => assertStreamedDimensions({ width: 15_000, height: 8_000 }), 'Protect browsers from pathological huge inputs')
const browserSource = (await import('node:fs')).readFileSync('src/components/images/ImagesStudio.tsx','utf8')
const streamSource = (await import('node:fs')).readFileSync('src/components/images/largeImageExport.ts','utf8')
const detailSource = (await import('node:fs')).readFileSync('src/components/images/detailPreview.ts','utf8')
const halftoneUi = (await import('node:fs')).readFileSync('src/components/images/DtfHalftoneControls.tsx','utf8')
const imagesCss = (await import('node:fs')).readFileSync('src/components/images/imagesStudio.css','utf8')
assert.ok(browserSource.includes('await renderLargeTransparentPng(currentFile, sourceDimensions') && browserSource.includes('await renderLargeTransparentPng(item.file, dimensions'))
assert.ok(streamSource.includes('createImageBitmap(input, 0, sourceTop') && streamSource.includes("new CompressionStream('deflate')"))
assert.ok(detailSource.includes('alphaSettings, sy, sx') && detailSource.includes('createImageBitmap(file, sx, sy, sw, sh'), 'Native detail must use the original crop and both screen origins')
assert.ok(detailSource.includes('signal.aborted') && detailSource.includes('crop?.close()'), 'Stale native crops must be discarded and released')
assert.ok(browserSource.includes('const controller = new AbortController()') && browserSource.includes('controller.abort()'))
assert.ok(halftoneUi.includes('PatternSwatch') && halftoneUi.includes('onInspect') && halftoneUi.includes('aria-pressed') && halftoneUi.includes('Ángulo de trama'))
assert.match(imagesCss, /\.images-halftone-patterns\s*\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/)
assert.match(imagesCss, /@container \(min-width:460px\)/)
assert.match(imagesCss, /\.images-halftone-segments button\s*\{[^}]*min-height:44px/)
assert.match(imagesCss, /\.images-preview.native-detail-active[^}]*opacity:0/, 'Native alpha holes must not reveal the filtered overview')
const withProfile = await embedSrgbIcc(new Blob([new Uint8Array(png)], {type:'image/png'}))
const details = await verifyPrintPng(withProfile, { width:1, height:1, dpi:300, icc:true })
assert.deepEqual(details, {width:1,height:1,bitDepth:8,colorType:6,icc:true,dpi:300})

const data = Buffer.from(await withProfile.arrayBuffer())
const namePos = data.indexOf(Buffer.from('iCCP'))
assert.ok(namePos > 0)
const size = data.readUInt32BE(namePos - 4)
const payload = data.subarray(namePos + 4, namePos + 4 + size)
const nullPos = payload.indexOf(0)
assert.equal(payload[nullPos + 1], 0)
const icc = inflateSync(payload.subarray(nullPos + 2))
assert.equal(icc.readUInt32BE(0), icc.length)
assert.equal(icc.toString('ascii', 36, 40), 'acsp')
assert.equal(icc.toString('ascii', 16, 20), 'RGB ')
assert.deepEqual(await inspectPng(withProfile), details)
textResult()
function textResult() { process.stdout.write('Images Studio print QA: native geometry, round-dot coverage, rotated/cropped DTF continuity, filtered overview, compact control structure, RGBA8, 300 ppp and ICC sRGB passed.\n') }
