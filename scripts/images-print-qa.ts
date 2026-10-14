import assert from 'node:assert/strict'
import { deflateSync, inflateSync } from 'node:zlib'
import { getExportGeometry } from '../src/components/images/printExport'
import { optimizeImageAlpha, analyzeAlpha, type AlphaOptimizationSettings } from '../src/components/images/alphaOptimization'
import { embedSrgbIcc, inspectPng, verifyPrintPng } from '../src/components/images/colorManagement'

const profile: AlphaOptimizationSettings = { method: 'dtf', dtfMode: 'halftone', cleanupPercent: 10, cellPixels: 8 }
const xl = getExportGeometry(3000, 3975, 'print-40x53')
assert.deepEqual([xl.width, xl.height, xl.dpi], [4724, 6260, 300])
assert.ok(xl.x >= 0 && xl.y >= 0)
assert.ok(xl.drawWidth <= xl.width && xl.drawHeight <= xl.height)

const medium = getExportGeometry(2000, 2000, 'print-35x40')
assert.deepEqual([medium.width, medium.height, medium.dpi], [4134, 4724, 300])
assert.ok(medium.drawHeight <= medium.height && medium.drawWidth <= medium.width)
const icon = getExportGeometry(2000, 2000, 'companion-2x')
assert.deepEqual([icon.width, icon.height, icon.dpi], [4000, 4000, null])

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
function textResult() { process.stdout.write('Images Studio print QA: geometry, alpha, PNG RGBA8, 300 ppp and real ICC sRGB passed.\n') }
