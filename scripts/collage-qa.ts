import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { getCollageGeometry } from '../src/components/collage/collageRenderer'

let assertions = 0
const check = (value: unknown, message: string) => { assertions++; assert.ok(value, message) }
const equal = (actual: unknown, expected: unknown, message: string) => { assertions++; assert.equal(actual, expected, message) }
const source = (name: string) => readFileSync(name, 'utf8')

const portrait = { width: 480, height: 600 }
const one = getCollageGeometry([portrait])
const four = getCollageGeometry(Array.from({ length: 4 }, () => portrait))
equal(one.width, 572, 'One 4:5 panel must preserve white outer margins')
equal(one.height, 692, 'A single panel must use the common height plus white margins')
equal(four.width, 2102, 'Four 4:5 panels must keep their natural widths and white gaps')
equal(four.height, one.height, 'All horizontal collages share one row height')
const mixed = getCollageGeometry([{ width: 900, height: 1600 }, { width: 1600, height: 900 }, { width: 1000, height: 1000 }])
equal(mixed.panels.length, 3, 'Every input image must receive one independent panel')
check(mixed.panels[0].width < mixed.panels[2].width && mixed.panels[2].width < mixed.panels[1].width, 'Portrait, square and landscape images must have natural, distinct panel widths')
for (const [index, source] of [{ width: 900, height: 1600 }, { width: 1600, height: 900 }, { width: 1000, height: 1000 }].entries()) {
  check(Math.abs(mixed.panels[index].width / mixed.panelHeight - source.width / source.height) < 1e-9, 'Panel aspect ratio must match its source')
  if (index) check(Math.abs(mixed.panels[index].x - mixed.panels[index - 1].x - mixed.panels[index - 1].width - mixed.gap) < 1e-9, 'Gutters must be white and adjacent to panels')
}
for (const count of [1, 2, 3, 4, 10, 20, 50, 100]) {
  const geometry = getCollageGeometry(Array.from({ length: count }, () => portrait))
  check(geometry.width <= 8192, 'PNG export exceeded maximum mobile-friendly canvas width: ' + count)
  check(geometry.width * geometry.height <= 16000000, 'PNG export exceeded maximum mobile-friendly pixel budget: ' + count)
  check(geometry.panels.every((panel) => panel.width > 0) && geometry.panelHeight > 0, 'Every panel must have positive dimensions')
}

const app = source('src/app/App.tsx')
check(app.includes("'#/collage'") && app.includes('<CollageCreator />'), 'Collage route missing from GAS3D tool selector')
const page = source('src/components/collage/CollageCreator.tsx')
check(page.includes('type="file" accept="image/*" multiple'), 'Native multiple-photo picker missing')
check(page.includes('collage-preview-board') && page.includes('collage-preview-tile') && page.includes('aspectRatio:'), 'Source aspect ratios missing from horizontal preview')
check(page.includes('changeBackground(item.id') && page.includes("background === 'black'"), 'Independent panel backgrounds missing')
check(page.includes('move(index, -1)') && page.includes('move(index, 1)') && page.includes('remove(item.id)'), 'Accessible reordering/removal actions missing')
check(page.includes('repeatLast()') && page.includes('saveCollageManifest'), 'Restore-last-image or manifest persistence missing')
check(page.includes('renderCollage(items)'), 'PNG export disconnected from horizontal renderer')
const renderer = source('src/components/collage/collageRenderer.ts')
check(renderer.includes("ctx.fillStyle = '#ffffff'") && renderer.includes("source.background === 'white'"), 'White outer margins or backgrounds missing')
check(renderer.includes('ctx.drawImage(image, panel.x, size.margin, panel.width, size.panelHeight)'), 'Export must draw every source into its exact aspect-ratio panel')
check(renderer.includes('getImageDimensions') && !renderer.includes('PANEL_WIDTH'), 'Source dimensions must drive export geometry')
const storage = source('src/components/collage/collageStorage.ts')
check(storage.includes('loadMedia') && storage.includes('storeMedia') && storage.includes('localStorage.setItem'), 'Original images and metadata must use IndexedDB and localStorage respectively')
check(storage.includes("LAST_MEDIA_KEY = 'collage:last'"), 'Last uploaded image must remain saved after removal')
const css = source('src/components/collage/collageCreator.css')
check(css.includes('overflow-x:auto') && css.includes('width:max-content'), 'Horizontal preview scrolling removed')
check(css.includes('--collage-preview-scale') && css.includes('width:auto;') && !css.includes('aspect-ratio:4/5'), 'Preview must use uniform height and dynamic width without fixed tiles')
check(css.includes('.collage-mobile-actions') && css.includes('env(safe-area-inset-bottom'), 'Safe-area-aware mobile export/add actions removed')
check(css.includes('@media (max-width:600px)') && css.includes('grid-template-columns:repeat(auto-fit'), 'Phone and desktop layouts missing')
check(source('AGENTS.md').includes('agents/collage-creator.md'), 'Collage maintenance instructions missing from AGENTS.md')
console.log('Collage Creator QA: ' + assertions + ' verificaciones correctas.')
