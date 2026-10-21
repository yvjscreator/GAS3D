import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Download, ImagePlus, Images, Layers3, GripVertical, Trash2, Upload, RefreshCw } from 'lucide-react'
import {
  loadCollageImage,
  readCollageManifest,
  removeCollageImage,
  saveCollageManifest,
  storeCollageImage,
  type CollageBackground,
} from './collageStorage'
import { getCollageGeometry, getImageDimensions, renderCollage, type CollageQuality } from './collageRenderer'
import './collageCreator.css'
import { AppLauncher } from '../navigation/AppLauncher'

type CollageItem = { id: string; name: string; background: CollageBackground; url: string; width: number; height: number }
type Feedback = { kind: 'success' | 'error'; text: string } | null

const MAX_FILE_BYTES = 60 * 1024 * 1024
const supported = (file: File) => file.type.startsWith('image/') || /\.(png|jpg|jpeg|webp|avif|gif|heic|heif)$/i.test(file.name)
const makeId = () => globalThis.crypto?.randomUUID?.() ?? 'collage-' + Date.now() + '-' + Math.random().toString(16).slice(2)
const dateName = () => new Date().toISOString().slice(0, 10)
const shortName = (name: string) => name.length > 34 ? name.slice(0, 27) + '…' + name.slice(-6) : name

export function CollageCreator() {
  const pickerRef = useRef<HTMLInputElement>(null)
  const replacePickerRef = useRef<HTMLInputElement>(null)
  const replaceTargetRef = useRef<string | null>(null)
  const lastPhotoTapRef = useRef<{ id: string; time: number } | null>(null)
  const activeUrls = useRef(new Set<string>())
  const dragSession = useRef<{ id: string; pointerId: number } | null>(null)
  const [items, setItems] = useState<CollageItem[]>([])
  const [hydrating, setHydrating] = useState(true)
  const [working, setWorking] = useState<'adding' | 'exporting' | null>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [quality, setQuality] = useState<CollageQuality>('maximum')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const busy = hydrating || working !== null
  const exportGeometry = getCollageGeometry(items, quality)
  // Presentation size is independent of export quality: fit the ENTIRE row in place.
  const previewGeometry = getCollageGeometry(items, 'maximum')
  const canExport = items.length > 0 && exportGeometry.withinLimits

  useEffect(() => {
    let active = true
    const urls = activeUrls.current
    const restore = async () => {
      const manifest = readCollageManifest()
      const restored: CollageItem[] = []
      let unreadable = 0
      try {
        for (const entry of manifest.items) {
          const file = await loadCollageImage(entry.id)
          if (!file) continue
          const url = URL.createObjectURL(file)
          try {
            const dimensions = await getImageDimensions(url)
            if (!active) { URL.revokeObjectURL(url); return }
            urls.add(url)
            restored.push({ ...entry, ...dimensions, url })
          } catch {
            URL.revokeObjectURL(url)
            unreadable++
          }
        }
        if (!active) return
        setItems(restored)
        if (unreadable) setFeedback({ kind: 'error', text: unreadable + ' imagen(es) guardadas no se pudieron leer en este navegador.' })
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
    if (!hydrating && !saveCollageManifest(items.map(({ id, name, background }) => ({ id, name, background })), null)) {
      setFeedback({ kind: 'error', text: 'No se pudieron guardar las preferencias. Revisa el espacio o permisos del navegador.' })
    }
  }, [items, hydrating])

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
        let url: string | null = null
        try {
          url = URL.createObjectURL(file)
          const dimensions = await getImageDimensions(url)
          // Keep original source bytes in IndexedDB, never in localStorage.
          await storeCollageImage(id, file)
          activeUrls.current.add(url)
          imported.push({ id, name: file.name, background: 'black', url, ...dimensions })
        } catch {
          if (url) URL.revokeObjectURL(url)
          await removeCollageImage(id).catch(() => undefined)
          rejected++
        }
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

  const requestReplacement = (id: string) => {
    if (busy || !items.some((item) => item.id === id)) return
    lastPhotoTapRef.current = null
    replaceTargetRef.current = id
    replacePickerRef.current?.click()
  }

  // Supports double tap on mobile and double click on desktop, without
  // replacing an image on an accidental single touch. Keyboard activation
  // is a deliberate one-key action for accessibility.
  const activatePhoto = (id: string, detail: number) => {
    if (busy) return
    if (detail === 0) {
      requestReplacement(id)
      return
    }
    const time = Date.now()
    const last = lastPhotoTapRef.current
    if (detail >= 2 || (last?.id === id && time - last.time < 400)) {
      requestReplacement(id)
    } else {
      lastPhotoTapRef.current = { id, time }
    }
  }

  const onReplacementSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    const targetId = replaceTargetRef.current
    event.target.value = ''
    replaceTargetRef.current = null
    if (!file || !targetId || busy) return
    const current = items.find((item) => item.id === targetId)
    if (!current) return
    if (!supported(file) || file.size > MAX_FILE_BYTES) {
      setFeedback({ kind: 'error', text: 'Usa una imagen válida de hasta 60 MB para sustituir la anterior.' })
      return
    }

    setWorking('adding')
    setFeedback(null)
    let replacementUrl: string | null = null
    try {
      replacementUrl = URL.createObjectURL(file)
      const dimensions = await getImageDimensions(replacementUrl)
      // Overwrite the same IndexedDB entry. Keep id, position and background.
      await storeCollageImage(targetId, file)
      activeUrls.current.add(replacementUrl)
      setItems((existing) => existing.map((item) => item.id === targetId
        ? { ...item, url: replacementUrl!, name: file.name, ...dimensions }
        : item))
      activeUrls.current.delete(current.url)
      URL.revokeObjectURL(current.url)
      replacementUrl = null

      setFeedback({ kind: 'success', text: 'Imagen sustituida sin cambiar su posición ni su fondo.' })
    } catch {
      if (replacementUrl) URL.revokeObjectURL(replacementUrl)
      setFeedback({ kind: 'error', text: 'No se pudo sustituir la foto. Se conservó la imagen anterior.' })
    } finally {
      setWorking(null)
    }
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

  const reorderById = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return
    setItems((current) => {
      const from = current.findIndex((item) => item.id === sourceId)
      const to = current.findIndex((item) => item.id === targetId)
      if (from < 0 || to < 0 || from === to) return current
      const next = [...current]
      const [picked] = next.splice(from, 1)
      next.splice(to, 0, picked)
      return next
    })
  }

  // Pointer capture supports touch and mouse; only reorder on release.
  const dragStart = (id: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (busy || items.length < 2 || (event.pointerType === 'mouse' && event.button !== 0)) return
    event.preventDefault()
    dragSession.current = { id, pointerId: event.pointerId }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDraggingId(id)
    setDropTargetId(id)
  }

  const targetUnderPointer = (x: number, y: number) =>
    document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-collage-id]')?.dataset.collageId ?? null

  const dragMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragSession.current?.pointerId !== event.pointerId) return
    const target = targetUnderPointer(event.clientX, event.clientY)
    if (target && items.some((item) => item.id === target)) setDropTargetId(target)
  }

  const dragEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const session = dragSession.current
    if (!session || session.pointerId !== event.pointerId) return
    const target = targetUnderPointer(event.clientX, event.clientY) ?? dropTargetId
    if (target) reorderById(session.id, target)
    dragSession.current = null
    setDraggingId(null)
    setDropTargetId(null)
  }

  const dragCancel = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragSession.current?.pointerId !== event.pointerId) return
    dragSession.current = null
    setDraggingId(null)
    setDropTargetId(null)
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
      const blob = await renderCollage(items, quality)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'GAS3D-Collage-' + dateName() + '.png'
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60000)
      setFeedback({ kind: 'success', text: 'PNG de ' + exportGeometry.width + ' × ' + exportGeometry.height + ' px exportado con ' + items.length + ' imágenes.' })
    } catch (error) {
      setFeedback({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudo exportar el collage.' })
    } finally { setWorking(null) }
  }

  return <main className="collage-creator">
    <div className="collage-container">
      <header className="collage-header">
        <AppLauncher active="collage" />
        <div>
          <span className="collage-eyebrow"><Layers3 size={14} /> GAS3D / HERRAMIENTA CREATIVA</span>
          <h1>Collage <span>Creator</span></h1>
          <p>Crea una referencia horizontal para tus prompts. Añade imágenes, cambia el fondo de cada una y exporta todo junto.</p>
        </div>
        <div className="collage-desktop-actions">
          <button type="button" className="collage-btn collage-btn-secondary" disabled={busy} onClick={() => pickerRef.current?.click()}><ImagePlus size={17} /> Añadir imágenes</button>
          <button type="button" className="collage-btn collage-btn-primary" disabled={busy || !canExport} onClick={() => void exportPng()}><Download size={17} /> Exportar PNG</button>
        </div>
      </header>

      <input ref={pickerRef} className="collage-hidden-input" type="file" accept="image/*" multiple onChange={onFilesSelected} aria-label="Seleccionar imágenes para el collage" />
      <input ref={replacePickerRef} className="collage-hidden-input" type="file" accept="image/*" onChange={(event) => { void onReplacementSelected(event) }} aria-label="Seleccionar foto de sustitución" />

      <section className="collage-preview-section" aria-label="Vista previa del collage horizontal">
        <div className="collage-section-heading"><div><span className="collage-section-number">01</span><h2>Vista previa</h2></div><span>{items.length} paneles · Horizontal</span></div>
        {hydrating ? <div className="collage-empty"><Images size={30} /><strong>Recuperando imágenes guardadas…</strong></div> :
          items.length === 0 ? <button type="button" className="collage-empty" onClick={() => pickerRef.current?.click()}><ImagePlus size={32} /><strong>Comienza con tus imágenes</strong><span>Puedes elegir varias fotos de tu galería al mismo tiempo.</span></button> :
          <div className="collage-preview-fit" role="img" aria-label={'Vista previa completa del collage de ' + items.length + ' imágenes, sin recortes'}>
            <div className="collage-preview-board" style={{ aspectRatio: `${previewGeometry.width} / ${previewGeometry.height}` }}>
              {items.map((item, index) => {
                const panel = previewGeometry.panels[index]
                return <div className="collage-preview-tile" key={item.id} style={{
                  backgroundColor: item.background,
                  left: (panel.x / previewGeometry.width * 100) + '%',
                  top: (previewGeometry.margin / previewGeometry.height * 100) + '%',
                  width: (panel.width / previewGeometry.width * 100) + '%',
                  height: (previewGeometry.panelHeight / previewGeometry.height * 100) + '%',
                }}><img src={item.url} alt="" draggable={false} /></div>
              })}
            </div>
          </div>}
        <div className="collage-preview-meta"><span>{items.length ? exportGeometry.width + ' × ' + exportGeometry.height + ' px · PNG' : 'Sin imágenes'}</span><span>{items.length > 1 ? 'Collage completo · Reordena las fotos abajo' : 'Los diseños nunca se recortan'}</span></div>
        <div className="collage-quality" role="group" aria-label="Resolución de exportación PNG">
          <strong>Resolución de descarga</strong>
          <button type="button" className={quality === 'maximum' ? 'active' : ''} aria-pressed={quality === 'maximum'} onClick={() => setQuality('maximum')}>Máxima</button>
          <button type="button" className={quality === 'compatible' ? 'active' : ''} aria-pressed={quality === 'compatible'} onClick={() => setQuality('compatible')}>Compatible</button>
        </div>
        {items.length > 0 && quality === 'maximum' && !canExport && <p className="collage-quality-warning" role="status">El tamaño supera el límite seguro. Selecciona Compatible para reducir la resolución de salida, sin alterar tus archivos originales.</p>}
        {items.length > 0 && quality === 'compatible' && exportGeometry.scale < 1 && <p className="collage-quality-warning">Compatible reduce la resolución de salida para evitar problemas de memoria. Máxima conserva más detalle cuando el tamaño lo permite.</p>}
      </section>

      <section className="collage-manage-section" aria-label="Editar y ordenar imágenes">
        <div className="collage-section-heading"><div><span className="collage-section-number">02</span><h2>Imágenes y fondos</h2></div>
          <button type="button" className="collage-text-button collage-danger collage-clear-button" disabled={busy || !items.length} onClick={() => void clearAll()}><Trash2 size={15} /> Vaciar collage</button>
        </div>
        {items.length > 0 ? <div className="collage-items-grid">{items.map((item, index) => <article className={'collage-item' + (draggingId === item.id ? ' is-dragging' : '') + (draggingId && dropTargetId === item.id ? ' is-drop-target' : '')} data-collage-id={item.id} key={item.id}>
          <div className="collage-item-order" role="group" aria-label={'Orden y eliminación de ' + item.name}>
            <button type="button" disabled={busy || index === 0} onClick={() => move(index, -1)} aria-label={'Mover ' + item.name + ' a la posición anterior'}><ArrowLeft className="collage-order-horizontal" size={18} /><ArrowUp className="collage-order-vertical" size={18} /></button>
            <button type="button" className="collage-drag-handle collage-mobile-drag" disabled={busy || items.length < 2} aria-label={'Arrastrar ' + item.name + ' para cambiar su posición'} onPointerDown={(event) => dragStart(item.id, event)} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={dragCancel}><GripVertical size={21} /></button>
            <button type="button" disabled={busy || index === items.length - 1} onClick={() => move(index, 1)} aria-label={'Mover ' + item.name + ' a la posición siguiente'}><ArrowRight className="collage-order-horizontal" size={18} /><ArrowDown className="collage-order-vertical" size={18} /></button>
            <button type="button" className="collage-item-remove" disabled={busy} onClick={() => remove(item.id)} aria-label={'Eliminar ' + item.name}><Trash2 size={17} /></button>
          </div>
          <button type="button" className="collage-drag-handle collage-desktop-drag" disabled={busy || items.length < 2} aria-label={'Arrastrar ' + item.name + ' para cambiar su posición'} onPointerDown={(event) => dragStart(item.id, event)} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={dragCancel}><GripVertical size={21} /></button>
          <div className="collage-item-thumb" style={{ background: item.background }}>
            <button type="button" className="collage-item-photo" disabled={busy} onClick={(event) => activatePhoto(item.id, event.detail)} aria-label={'Doble toque para sustituir ' + item.name} title="Doble toque para cambiar la foto"><img src={item.url} alt="" draggable={false} /></button>
            <span>{index + 1}</span>
            <button type="button" className="collage-photo-replace" disabled={busy} onClick={() => requestReplacement(item.id)} aria-label={'Sustituir ' + item.name + ' desde la galería'} title="Cambiar foto"><RefreshCw size={18} aria-hidden="true" /></button>
          </div>
          <div className="collage-item-details">
            <strong title={item.name}>{shortName(item.name)}</strong>
            <span>Fondo del panel</span>
            <div className="collage-background-choice" role="group" aria-label={'Fondo de ' + item.name}>
              <button type="button" className={item.background === 'black' ? 'active' : ''} aria-label={'Fondo negro de ' + item.name} title="Fondo negro" aria-pressed={item.background === 'black'} onClick={() => changeBackground(item.id, 'black')}><i className="collage-swatch black" aria-hidden="true" /></button>
              <button type="button" className={item.background === 'white' ? 'active' : ''} aria-label={'Fondo blanco de ' + item.name} title="Fondo blanco" aria-pressed={item.background === 'white'} onClick={() => changeBackground(item.id, 'white')}><i className="collage-swatch white" aria-hidden="true" /></button>
            </div>
          </div>
        </article>)}</div> :
          <p className="collage-muted">{hydrating ? 'Cargando…' : 'Los controles de fondo y orden aparecerán aquí al añadir imágenes.'}</p>}
      </section>

      <div className="collage-info"><Upload size={17} /><span>Se guarda automáticamente en el navegador de este dispositivo mediante IndexedDB y localStorage. Las imágenes no se suben a ningún servidor. La última imagen añadida se puede recuperar.</span></div>
      {feedback && <div className={'collage-feedback ' + feedback.kind} role="status">{feedback.text}</div>}
    </div>
    <div className="collage-mobile-actions" aria-label="Acciones del collage"><button type="button" className="collage-btn collage-btn-secondary" disabled={busy} onClick={() => pickerRef.current?.click()}><ImagePlus size={18} /> Añadir</button><button type="button" className="collage-btn collage-btn-primary" disabled={busy || !canExport} onClick={() => void exportPng()}><Download size={18} /> {working === 'exporting' ? 'Exportando…' : 'Exportar PNG'}</button></div>
  </main>
}
