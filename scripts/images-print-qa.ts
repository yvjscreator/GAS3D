import assert from 'node:assert/strict'
import { deflateSync, inflateSync } from 'node:zlib'
import { getExportGeometry } from '../src/components/images/printExport'
import { DEFAULT_ALPHA_SETTINGS, optimizeImageAlpha, analyzeAlpha, type AlphaOptimizationSettings, type DtfPattern } from '../src/components/images/alphaOptimization'
import { embedSrgbIcc, inspectPng, verifyPrintPng } from '../src/components/images/colorManagement'

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
function textResult() { process.stdout.write('Images Studio print QA: no-resample geometry, DTF detail preservation / strip continuity, RGBA8, 300 ppp and real ICC sRGB passed.\n') }
