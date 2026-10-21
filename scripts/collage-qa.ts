import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { getCollageGeometry } from '../src/components/collage/collageRenderer'

let assertions = 0
const check = (value: unknown, message: string) => { assertions++; assert.ok(value, message) }
const equal = (actual: unknown, expected: unknown, message: string) => { assertions++; assert.equal(actual, expected, message) }
const source = (name: string) => readFileSync(name, 'utf8')

const one = getCollageGeometry(1)
const four = getCollageGeometry(4)
equal(one.width, 572, 'One panel must use the defined margins without clipping')
equal(one.height, 692, 'Panel export height must preserve the 4:5 portrait ratio plus margins')
equal(four.width, 2102, 'Four panels must be arranged horizontally with white gaps')
equal(four.height, one.height, 'All horizontal collages must share one row height')
for (const count of [1, 2, 3, 4, 10, 20, 50, 100]) {
  const geometry = getCollageGeometry(count)
  check(geometry.width <= 8192, 'PNG export exceeded maximum mobile-friendly canvas width: ' + count)
  check(geometry.width * geometry.height <= 16000000, 'PNG export exceeded maximum mobile-friendly pixel budget: ' + count)
  check(geometry.panelWidth > 0 && geometry.panelHeight > 0, 'Every panel must have positive dimensions')
}

const app = source('src/app/App.tsx')
check(app.includes("'#/collage'") && app.includes('<CollageCreator />'), 'Collage route missing from GAS3D tool selector')
const page = source('src/components/collage/CollageCreator.tsx')
check(page.includes('type="file" accept="image/*" multiple'), 'Native multiple-photo picker missing')
check(page.includes('collage-preview-board') && page.includes('collage-preview-tile'), 'Horizontal preview structure missing')
check(page.includes('changeBackground(item.id') && page.includes("background === 'black'"), 'Independent panel backgrounds missing')
check(page.includes('move(index, -1)') && page.includes('move(index, 1)') && page.includes('remove(item.id)'), 'Accessible reordering/removal actions missing')
check(page.includes('repeatLast()') && page.includes('saveCollageManifest'), 'Restore-last-image or manifest persistence missing')
check(page.includes('renderCollage(items)'), 'PNG export disconnected from horizontal renderer')
const renderer = source('src/components/collage/collageRenderer.ts')
check(renderer.includes("ctx.fillStyle = '#ffffff'") && renderer.includes("source.background === 'white'"), 'White outer margins or backgrounds missing')
check(renderer.includes('Math.min(size.panelWidth / imageWidth, size.panelHeight / imageHeight)'), 'Artwork no longer uses contain instead of crop')
const storage = source('src/components/collage/collageStorage.ts')
check(storage.includes('loadMedia') && storage.includes('storeMedia') && storage.includes('localStorage.setItem'), 'Original images and metadata must use IndexedDB and localStorage respectively')
check(storage.includes("LAST_MEDIA_KEY = 'collage:last'"), 'Last uploaded image must remain saved after removal')
const css = source('src/components/collage/collageCreator.css')
check(css.includes('overflow-x:auto') && css.includes('width:max-content'), 'Horizontal preview scrolling removed')
check(css.includes('.collage-mobile-actions') && css.includes('env(safe-area-inset-bottom'), 'Safe-area-aware mobile export/add actions removed')
check(css.includes('@media (max-width:600px)') && css.includes('grid-template-columns:repeat(auto-fit'), 'Phone and desktop layouts missing')
check(source('AGENTS.md').includes('agents/collage-creator.md'), 'Collage maintenance instructions missing from AGENTS.md')
console.log('Collage Creator QA: ' + assertions + ' verificaciones correctas.')
