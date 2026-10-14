import { optimise } from '@jsquash/oxipng'

type Incoming = { id: number; png: ArrayBuffer }
type Outgoing =
  | { id: number; optimized: ArrayBuffer }
  | { id: number; error: string }

/**
 * Browser-local Oxipng WebAssembly process. Using a Worker keeps the React
 * canvas and controls responsive while evaluating PNG filters/deflate.
 */
self.addEventListener('message', async (event: MessageEvent<Incoming>) => {
  const { id, png } = event.data
  try {
    // optimiseAlpha=false guarantees transparent RGB is NOT intentionally
    // rewritten. RGBA/ICC/DPI are additionally checked on the main thread.
    const optimized = await optimise(png, {
      level: 3,
      interlace: false,
      optimiseAlpha: false,
    })
    const result: Outgoing = { id, optimized }
    self.postMessage(result, { transfer: [optimized] })
  } catch (error) {
    const result: Outgoing = {
      id,
      error: error instanceof Error ? error.message : 'Oxipng falló.',
    }
    self.postMessage(result)
  }
})
