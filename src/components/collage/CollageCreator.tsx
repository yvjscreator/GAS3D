import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { ArrowLeft, ArrowRight, Download, ImagePlus, Images, Layers3, RotateCcw, Trash2, Upload } from 'lucide-react'
import {
  loadCollageImage,
  loadLastCollageImage,
  readCollageManifest,
  removeCollageImage,
  saveCollageManifest,
  storeCollageImage,
  storeLastCollageImage,
  type CollageBackground,
} from './collageStorage'
import { getCollageGeometry, renderCollage } from './collageRenderer'
import './collageCreator.css'

type CollageItem = { id: string; name: string; background: CollageBackground; url: string }
type Feedback = { kind: 'success' | 'error'; text: string } | null

const MAX_FILE_BYTES = 60 * 1024 * 1024
const supported = (file: File) => file.type.startsWith('image/') || /\.(png|jpg|jpeg|webp|avif|gif|heic|heif)$/i.test(file.name)
const makeId = () => globalThis.crypto?.randomUUID?.() ?? 'collage-' + Date.now() + '-' + Math.random().toString(16).slice(2)
const dateName = () => new Date().toISOString().slice(0, 10)
const shortName = (name: string) => name.length > 34 ? name.slice(0, 27) + '…' + name.slice(-6) : name

export function CollageCreator() {
  const pickerRef = useRef<HTMLInputElement>(null)
  const activeUrls = useRef(new Set<string>())
  const [items, setItems] = useState<CollageItem[]>([])
  const [hydrating, setHydrating] = useState(true)
  const [working, setWorking] = useState<'adding' | 'exporting' | null>(null)
  const [recentName, setRecentName] = useState<string | null>(null)
  const [recentAvailable, setRecentAvailable] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const busy = hydrating || working !== null
  const exportGeometry = getCollageGeometry(items.length)

  useEffect(() => {
    let active = true
    const urls = activeUrls.current
    const restore = async () => {
      const manifest = readCollageManifest()
      const restored: CollageItem[] = []
      try {
        for (const entry of manifest.items) {
          const file = await loadCollageImage(entry.id)
          if (!file) continue
          const url = URL.createObjectURL(file)
          if (!active) { URL.revokeObjectURL(url); return }
          urls.add(url)
          restored.push({ ...entry, url })
        }
        const recent = await loadLastCollageImage()
        if (!active) return
        setItems(restored)
        setRecentName(manifest.lastName)
        setRecentAvailable(Boolean(recent))
      } catch {
        if (active) {
          setItems(restored)
          setFeedback({ kind: 'error', text: 'No se pudo recuperar todo el contenido guardado. Revisa el almacenamiento de este navegador.' })
        }
      } finally {
        if (active) setHydrating(false)
      }
    }
    void restore()
    return () => {
      active = false
      urls.forEach((url) => URL.revokeObjectURL(url))
      urls.clear()
    }
  }, [])

  useEffect(() => {
    if (!hydrating && !saveCollageManifest(items.map(({ id, name, background }) => ({ id, name, background })), recentName)) {
      setFeedback({ kind: 'error', text: 'No se pudieron guardar las preferencias. Revisa el espacio o permisos del navegador.' })
    }
  }, [items, hydrating, recentName])

  const acceptFiles = async (files: File[]) => {
    if (busy || files.length === 0) return
    setWorking('adding')
    setFeedback(null)
    const imported: CollageItem[] = []
    let rejected = 0
    try {
      for (const file of files) {
        if (!supported(file) || file.size > MAX_FILE_BYTES) { rejected++; continue }
        const id = makeId()
        try {
          // Keep original source bytes in IndexedDB, never in localStorage.
          await storeCollageImage(id, file)
          const url = URL.createObjectURL(file)
          activeUrls.current.add(url)
          imported.push({ id, name: file.name, background: 'black', url })
          await storeLastCollageImage(file)
          setRecentName(file.name)
          setRecentAvailable(true)
        } catch { rejected++ }
      }
      if (imported.length) setItems((current) => [...current, ...imported])
      if (rejected) setFeedback({ kind: 'error', text: rejected + ' archivo(s) no se pudieron añadir. Usa imágenes válidas de hasta 60 MB y revisa el espacio del dispositivo.' })
      else if (imported.length) setFeedback({ kind: 'success', text: imported.length + ' imagen(es) añadidas y guardadas en este dispositivo.' })
    } finally {
      setWorking(null)
    }
  }

  const onFilesSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    void acceptFiles(files)
  }

  const repeatLast = async () => {
    if (busy) return
    setWorking('adding')
    setFeedback(null)
    try {
      const file = await loadLastCollageImage()
      if (!file) throw new Error('La última imagen ya no está disponible en este dispositivo.')
      const id = makeId()
      await storeCollageImage(id, file)
      const url = URL.createObjectURL(file)
      activeUrls.current.add(url)
      setItems((current) => [...current, { id, name: recentName ?? 'Última imagen', background: 'black', url }])
    } catch (error) {
      setFeedback({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudo recuperar la última imagen.' })
    } finally { setWorking(null) }
  }

  const changeBackground = (id: string, background: CollageBackground) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, background } : item))
  }

  const move = (index: number, direction: -1 | 1) => {
    setItems((current) => {
      const target = index + direction
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
  }

  const remove = (id: string) => {
    if (busy) return
    const item = items.find((candidate) => candidate.id === id)
    if (!item) return
    setItems((current) => current.filter((candidate) => candidate.id !== id))
    activeUrls.current.delete(item.url)
    URL.revokeObjectURL(item.url)
    void removeCollageImage(id).catch(() => setFeedback({ kind: 'error', text: 'Se retiró el panel, pero no se pudo limpiar su archivo del almacenamiento.' }))
  }

  const clearAll = async () => {
    if (busy || !items.length || !window.confirm('¿Quitar todas las imágenes del collage? La última imagen añadida seguirá disponible.')) return
    const removed = [...items]
    setItems([])
    removed.forEach((item) => { activeUrls.current.delete(item.url); URL.revokeObjectURL(item.url) })
    const results = await Promise.allSettled(removed.map((item) => removeCollageImage(item.id)))
    if (results.some((result) => result.status === 'rejected')) {
      setFeedback({ kind: 'error', text: 'Se vació el collage, pero algunos archivos no se pudieron limpiar del almacenamiento.' })
    }
  }

  const exportPng = async () => {
    if (busy || items.length === 0) return
    setWorking('exporting')
    setFeedback(null)
    try {
      const blob = await renderCollage(items)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'GAS3D-Collage-' + dateName() + '.png'
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60000)
      setFeedback({ kind: 'success', text: 'Collage PNG generado con ' + items.length + ' panel(es).' })
    } catch (error) {
      setFeedback({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudo exportar el collage.' })
    } finally { setWorking(null) }
  }

  return <main className="collage-creator">
    <div className="collage-container">
      <header className="collage-header">
        <div>
          <span className="collage-eyebrow"><Layers3 size={14} /> GAS3D / HERRAMIENTA CREATIVA</span>
          <h1>Collage <span>Creator</span></h1>
          <p>Crea una referencia horizontal para tus prompts. Añade imágenes, cambia el fondo de cada una y exporta todo junto.</p>
        </div>
        <div className="collage-desktop-actions">
          <button type="button" className="collage-btn collage-btn-secondary" disabled={busy} onClick={() => pickerRef.current?.click()}><ImagePlus size={17} /> Añadir imágenes</button>
          <button type="button" className="collage-btn collage-btn-primary" disabled={busy || items.length === 0} onClick={() => void exportPng()}><Download size={17} /> Exportar PNG</button>
        </div>
      </header>

      <input ref={pickerRef} className="collage-hidden-input" type="file" accept="image/*" multiple onChange={onFilesSelected} aria-label="Seleccionar imágenes para el collage" />

      <section className="collage-preview-section" aria-label="Vista previa del collage horizontal">
        <div className="collage-section-heading"><div><span className="collage-section-number">01</span><h2>Vista previa</h2></div><span>{items.length} paneles · Horizontal</span></div>
        {hydrating ? <div className="collage-empty"><Images size={30} /><strong>Recuperando imágenes guardadas…</strong></div> :
          items.length === 0 ? <button type="button" className="collage-empty" onClick={() => pickerRef.current?.click()}><ImagePlus size={32} /><strong>Comienza con tus imágenes</strong><span>Puedes elegir varias fotos de tu galería al mismo tiempo.</span></button> :
          <div className="collage-scroll" tabIndex={0} aria-label="Desliza horizontalmente para explorar el collage">
            <div className="collage-preview-board">{items.map((item, index) => <div className="collage-preview-tile" key={item.id} style={{ backgroundColor: item.background }}><img src={item.url} alt={'Panel ' + (index + 1) + ': ' + item.name} /><span className="collage-preview-number">{index + 1}</span></div>)}</div>
          </div>}
        <div className="collage-preview-meta"><span>{items.length ? exportGeometry.width + ' × ' + exportGeometry.height + ' px · PNG' : 'Sin imágenes'}</span><span>{items.length > 1 ? 'Desliza para ver el resto →' : 'Los diseños nunca se recortan'}</span></div>
      </section>

      <section className="collage-manage-section" aria-label="Editar y ordenar imágenes">
        <div className="collage-section-heading"><div><span className="collage-section-number">02</span><h2>Imágenes y fondos</h2></div><span>Negro o blanco por imagen</span></div>
        <div className="collage-utility-bar">
          <button type="button" className="collage-text-button" disabled={busy || !recentAvailable} onClick={() => void repeatLast()}><RotateCcw size={16} /> Repetir última{recentName ? ': ' + shortName(recentName) : ''}</button>
          <button type="button" className="collage-text-button collage-danger" disabled={busy || !items.length} onClick={() => void clearAll()}><Trash2 size={15} /> Vaciar collage</button>
        </div>
        {items.length > 0 ? <div className="collage-items-grid">{items.map((item, index) => <article className="collage-item" key={item.id}>
          <div className="collage-item-thumb" style={{ background: item.background }}><img src={item.url} alt="" /><span>{index + 1}</span></div>
          <div className="collage-item-details">
            <strong title={item.name}>{shortName(item.name)}</strong>
            <span>Fondo del panel</span>
            <div className="collage-background-choice" role="group" aria-label={'Fondo de ' + item.name}>
              <button type="button" className={item.background === 'black' ? 'active' : ''} aria-pressed={item.background === 'black'} onClick={() => changeBackground(item.id, 'black')}><i className="collage-swatch black" /> Negro</button>
              <button type="button" className={item.background === 'white' ? 'active' : ''} aria-pressed={item.background === 'white'} onClick={() => changeBackground(item.id, 'white')}><i className="collage-swatch white" /> Blanco</button>
            </div>
          </div>
          <div className="collage-item-order" aria-label="Orden de la imagen">
            <button type="button" disabled={busy || index === 0} onClick={() => move(index, -1)} aria-label={'Mover ' + item.name + ' a la izquierda'}><ArrowLeft size={18} /></button>
            <button type="button" disabled={busy || index === items.length - 1} onClick={() => move(index, 1)} aria-label={'Mover ' + item.name + ' a la derecha'}><ArrowRight size={18} /></button>
            <button type="button" className="collage-item-remove" disabled={busy} onClick={() => remove(item.id)} aria-label={'Eliminar ' + item.name}><Trash2 size={17} /></button>
          </div>
        </article>)}</div> :
          <p className="collage-muted">{hydrating ? 'Cargando…' : 'Los controles de fondo y orden aparecerán aquí al añadir imágenes.'}</p>}
      </section>

      <div className="collage-info"><Upload size={17} /><span>Se guarda automáticamente en el navegador de este dispositivo mediante IndexedDB y localStorage. Las imágenes no se suben a ningún servidor. La última imagen añadida se puede recuperar.</span></div>
      {feedback && <div className={'collage-feedback ' + feedback.kind} role="status">{feedback.text}</div>}
    </div>
    <div className="collage-mobile-actions" aria-label="Acciones del collage"><button type="button" className="collage-btn collage-btn-secondary" disabled={busy} onClick={() => pickerRef.current?.click()}><ImagePlus size={18} /> Añadir</button><button type="button" className="collage-btn collage-btn-primary" disabled={busy || items.length === 0} onClick={() => void exportPng()}><Download size={18} /> {working === 'exporting' ? 'Exportando…' : 'Exportar PNG'}</button></div>
  </main>
}
