import * as THREE from 'three'
import { preparePrintTexture } from '../utils/preparePrintTexture'

type TextureEntry = {
  url: string
  texture: THREE.Texture | null
  promise: Promise<THREE.Texture>
  refs: number
  lastUsed: number
  status: 'loading' | 'ready' | 'error'
  estimatedBytes: number
}

export interface RenderAssetMetrics {
  cachedTextures: number
  referencedTextures: number
  loadingTextures: number
  estimatedTextureBytes: number
  rendererTextures: number
  geometries: number
  drawCalls: number
  triangles: number
}

class RenderAssetManager {
  private entries = new Map<string, TextureEntry>()
  private rendererMetrics = { rendererTextures: 0, geometries: 0, drawCalls: 0, triangles: 0 }
  private loader = new THREE.TextureLoader()

  constructor() { THREE.Cache.enabled = true }

  private load(url: string) {
    const existing = this.entries.get(url)
    if (existing) { existing.lastUsed = performance.now(); return existing }
    const entry = { url, texture: null, refs: 0, lastUsed: performance.now(), status: 'loading' as const, estimatedBytes: 0 } as TextureEntry
    entry.promise = this.loader.loadAsync(url).then((texture) => {
      preparePrintTexture(texture, true)
      const image = texture.image as { width?: number; height?: number } | undefined
      entry.texture = texture; entry.status = 'ready'; entry.lastUsed = performance.now()
      entry.estimatedBytes = Math.round((image?.width ?? 0) * (image?.height ?? 0) * 4 * 1.333)
      return texture
    }).catch((error) => { entry.status = 'error'; this.entries.delete(url); throw error })
    this.entries.set(url, entry)
    return entry
  }

  async acquireTexture(url: string) {
    const entry = this.load(url); entry.refs += 1; entry.lastUsed = performance.now()
    try { return await entry.promise }
    catch (error) { entry.refs = Math.max(0, entry.refs - 1); throw error }
  }

  releaseTexture(url: string) {
    const entry = this.entries.get(url)
    if (!entry) return
    entry.refs = Math.max(0, entry.refs - 1); entry.lastUsed = performance.now()
  }

  async preload(urls: readonly string[]) {
    await Promise.all([...new Set(urls.filter(Boolean))].map((url) => this.load(url).promise))
  }

  evictExcept(keepUrls: ReadonlySet<string>, maximumEntries = 12) {
    const disposable = [...this.entries.values()].filter((entry) => entry.refs === 0 && !keepUrls.has(entry.url)).sort((a, b) => a.lastUsed - b.lastUsed)
    const target = Math.max(0, this.entries.size - maximumEntries)
    disposable.slice(0, Math.max(target, disposable.length > maximumEntries ? disposable.length - maximumEntries : 0)).forEach((entry) => {
      entry.texture?.dispose(); this.entries.delete(entry.url)
    })
  }

  updateRendererInfo(info: THREE.WebGLInfo) {
    this.rendererMetrics = { rendererTextures: info.memory.textures, geometries: info.memory.geometries, drawCalls: info.render.calls, triangles: info.render.triangles }
  }

  getMetrics(): RenderAssetMetrics {
    const entries = [...this.entries.values()]
    return {
      cachedTextures: entries.filter((entry) => entry.status === 'ready').length,
      referencedTextures: entries.filter((entry) => entry.refs > 0).length,
      loadingTextures: entries.filter((entry) => entry.status === 'loading').length,
      estimatedTextureBytes: entries.reduce((sum, entry) => sum + entry.estimatedBytes, 0),
      ...this.rendererMetrics,
    }
  }

  clear() {
    this.entries.forEach((entry) => entry.texture?.dispose()); this.entries.clear()
  }
}

export const renderAssetManager = new RenderAssetManager()
