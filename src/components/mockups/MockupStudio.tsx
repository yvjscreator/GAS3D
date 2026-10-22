import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { ArrowDownToLine, ImagePlus, Layers2, RotateCcw, Shirt, SlidersHorizontal, Upload, X } from 'lucide-react'
import { AppLauncher } from '../navigation/AppLauncher'
import { loadMedia, removeMedia, storeMedia } from '../../utils/mediaStorage'
import { readPngSourceSize, assertStreamedDimensions } from '../images/largeImageExport'
import { bound, canvasPng, ensurePhotoSize, initialPlacement, placementQuad, pointInQuad, renderGarment, restorePlacement, type MockImage, type Placement, type Point, type ViewName } from './mockupEngine'
import './mockupStudio.css'

type ViewModel={ photo:MockImage|null; art:MockImage|null; placement:Placement }
type AssetKind='photo'|'art'
type Views=Record<ViewName,ViewModel>
const STORAGE_KEY='gas3d.mockup-studio.v1'
const mediaKey=(view:ViewName,kind:AssetKind)=>'mockup-studio:v1:'+view+':'+kind
const makeViews=():Views=>({
  front:{photo:null,art:null,placement:initialPlacement('front')},
  back:{photo:null,art:null,placement:initialPlacement('back')},
})
const names:Record<ViewName,string>={front:'Frente',back:'Espalda'}
const MAX_UPLOAD=55*1024*1024
const safeFile=(file:File,kind:AssetKind)=>kind==='art'
  ? file.type==='image/png'||(!file.type&&/\.png$/i.test(file.name))
  : /^image\/(png|jpeg|webp)$/.test(file.type)||(!file.type&&/\.(png|jpe?g|webp)$/i.test(file.name))

async function decode(blob:Blob,name:string,kind:AssetKind):Promise<MockImage>{
  if(kind==='art'){
    // Original PNG stays untouched in IndexedDB. Only the editing/photographic
    // compositing bitmap is sized to what a shirt mockup can actually display.
    const source=await readPngSourceSize(blob)
    if(!source)throw new Error('El diseño debe ser un PNG válido.')
    assertStreamedDimensions(source)
    const edge=4096
    const ratio=Math.min(1,edge/Math.max(source.width,source.height))
    const bitmap=await createImageBitmap(blob,{
      resizeWidth:Math.max(1,Math.round(source.width*ratio)),
      resizeHeight:Math.max(1,Math.round(source.height*ratio)),
      resizeQuality:'high',
    })
    return {bitmap,width:bitmap.width,height:bitmap.height,name}
  }
  const bitmap=await createImageBitmap(blob)
  try{ensurePhotoSize(bitmap)}catch(error){bitmap.close();throw error}
  return {bitmap,width:bitmap.width,height:bitmap.height,name}
}
function nameForView(view:ViewName,kind:AssetKind){return names[view]+' · '+(kind==='photo'?'remera':'diseño')}
function download(blob:Blob,name:string){
  const url=URL.createObjectURL(blob)
  const link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove()
  window.setTimeout(()=>URL.revokeObjectURL(url),30000)
}

type DragSession={view:ViewName;pointerId:number;kind:'move'|'corner';corner:number;start:Point;origin:Placement}
export function LegacyMockupStudio(){
  const [views,setViews]=useState<Views>(makeViews)
  const viewsRef=useRef<Views>(views)
  const assetRefs=useRef(new Set<ImageBitmap>())
  const stageRefs=useRef<Record<ViewName,HTMLDivElement|null>>({front:null,back:null})
  const canvasRefs=useRef<Record<ViewName,HTMLCanvasElement|null>>({front:null,back:null})
  const inputRef=useRef<HTMLInputElement>(null)
  const uploadTarget=useRef<{view:ViewName;kind:AssetKind}>({view:'front',kind:'photo'})
  const dragRef=useRef<DragSession|null>(null)
  const [active,setActive]=useState<ViewName>('front')
  const [ready,setReady]=useState(false)
  const [busy,setBusy]=useState(false)
  const [showGuides,setShowGuides]=useState(true)
  const [feedback,setFeedback]=useState<string|null>(null)
  const [error,setError]=useState<string|null>(null)
  viewsRef.current=views

  useEffect(()=>{
    let disposed=false
    const refs=assetRefs.current
    const restore=async()=>{
      let placements:Record<string,unknown>={}
      try{
        const saved=JSON.parse(window.localStorage.getItem(STORAGE_KEY)||'{}') as unknown
        if(saved&&typeof saved==='object'&&!Array.isArray(saved))placements=saved as Record<string,unknown>
      }catch{placements={}}
      const next=makeViews()
      for(const view of ['front','back'] as const){
        next[view].placement=restorePlacement(placements[view],view)
        const storedNames=placements['names'] as Record<string,string>|undefined
        for(const kind of ['photo','art'] as const){
          try{
            const saved=await loadMedia(mediaKey(view,kind))
            if(!saved)continue
            const asset=await decode(saved,storedNames?.[view+':'+kind]|| (kind==='photo'?'Foto guardada':'Diseño guardado'),kind)
            if(disposed){asset.bitmap.close();return}
            refs.add(asset.bitmap)
            next[view][kind]=asset
          }catch{/* A corrupt/expired browser asset should not block the other view. */}
        }
      }
      if(!disposed){setViews(next);setReady(true)}
    }
    void restore()
    return ()=>{disposed=true;refs.forEach(bitmap=>bitmap.close());refs.clear()}
  },[])

  useEffect(()=>{
    if(!ready)return
    try{window.localStorage.setItem(STORAGE_KEY,JSON.stringify({
      front:views.front.placement,back:views.back.placement,
      names: {
        'front:photo':views.front.photo?.name,
        'front:art':views.front.art?.name,
        'back:photo':views.back.photo?.name,
        'back:art':views.back.art?.name,
      },
    }))}catch{/* Storage permission is optional. */}
  },[views,ready])

  useEffect(()=>{
    if(!ready)return
    const frame=requestAnimationFrame(()=>{
      for(const view of ['front','back'] as const){
        const canvas=canvasRefs.current[view]
        const source=views[view]
        if(canvas&&source.photo){
          try{renderGarment(canvas,source.photo,source.art,source.placement,1050)}
          catch(err){setError(err instanceof Error?err.message:'No se pudo mostrar el mockup.')}
        }
      }
    })
    return ()=>cancelAnimationFrame(frame)
  },[views,ready,active])

  const modify=(view:ViewName,edit:(prev:Placement)=>Placement)=>
    setViews(old=>({...old,[view]:{...old[view],placement:edit(old[view].placement)}}))
  const openUpload=(view:ViewName,kind:AssetKind)=>{
    uploadTarget.current={view,kind}
    if(inputRef.current){
      inputRef.current.accept=kind==='art'?'image/png': 'image/png,image/jpeg,image/webp'
      inputRef.current.click()
    }
  }
  const onSelect=(event:ChangeEvent<HTMLInputElement>)=>{
    const file=event.currentTarget.files?.[0]
    event.currentTarget.value=''
    if(!file||busy)return
    const {view,kind}=uploadTarget.current
    if(!safeFile(file,kind)){setError(kind==='art'?'El diseño debe ser PNG (preferiblemente con transparencia).':'La foto debe ser PNG, JPG o WebP.');return}
    if(file.size>MAX_UPLOAD){setError('El archivo supera los 55 MB permitidos.');return}
    setBusy(true);setError(null);setFeedback(null)
    void (async()=>{
      try{
        const asset=await decode(file,file.name,kind)
        assetRefs.current.add(asset.bitmap)
        setViews(old=>({...old,[view]:{...old[view],[kind]:asset}}))
        try{
          await storeMedia(mediaKey(view,kind),file)
          setFeedback(nameForView(view,kind)+' cargado y guardado en este navegador.')
        }catch{
          setFeedback(nameForView(view,kind)+' cargado. Tu navegador no permitió guardarlo para después.')
        }
      }catch(err){setError(err instanceof Error?err.message:'No se pudo abrir el archivo.')}
      finally{setBusy(false)}
    })()
  }
  const removeAsset=(view:ViewName,kind:AssetKind)=>{
    if(busy)return
    setViews(old=>({...old,[view]:{...old[view],[kind]:null}}))
    void removeMedia(mediaKey(view,kind)).catch(()=>setFeedback('No se pudo borrar la copia guardada.'))
    setFeedback(nameForView(view,kind)+' eliminado del editor.')
  }
  const position=(event:ReactPointerEvent<HTMLDivElement>):Point=>{
    const rect=event.currentTarget.getBoundingClientRect()
    return {x:(event.clientX-rect.left)/rect.width,y:(event.clientY-rect.top)/rect.height}
  }
  const pointerDown=(event:ReactPointerEvent<HTMLDivElement>,view:ViewName)=>{
    const model=viewsRef.current[view]
    if(!model.photo||!model.art||busy||event.button!==0)return
    const p=position(event),q=placementQuad(model.photo,model.art,model.placement)
    let corner=-1
    const rect=event.currentTarget.getBoundingClientRect()
    for(let index=0;index<4;index++){
      if(Math.hypot((p.x-q[index].x)*rect.width,(p.y-q[index].y)*rect.height)<22){corner=index;break}
    }
    if(corner<0&&!pointInQuad(p,q))return
    setActive(view)
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current={view,pointerId:event.pointerId,kind:corner>=0?'corner':'move',corner,start:p,origin:model.placement}
  }
  const pointerMove=(event:ReactPointerEvent<HTMLDivElement>,view:ViewName)=>{
    const drag=dragRef.current
    if(!drag||drag.pointerId!==event.pointerId||drag.view!==view)return
    const p=position(event),dx=p.x-drag.start.x,dy=p.y-drag.start.y
    modify(view,()=>{
      const old=drag.origin
      if(drag.kind==='move')return{...old,x:bound(old.x+dx,-.4,1.4),y:bound(old.y+dy,-.4,1.4)}
      const corners=old.corners.map(c=>({...c})) as Placement['corners']
      corners[drag.corner]={x:bound(corners[drag.corner].x+dx,-.5,.5),y:bound(corners[drag.corner].y+dy,-.5,.5)}
      return {...old,corners}
    })
  }
  const pointerEnd=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(dragRef.current?.pointerId===event.pointerId)dragRef.current=null
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const reset=(view:ViewName)=>modify(view,()=>initialPlacement(view))

  const exportMockup=async(mode:'active'|'combined')=>{
    if(busy)return
    const selections=(mode==='active'?[active]:['front','back']) as ViewName[]
    const present=selections.filter(view=>views[view].photo)
    if(!present.length){setError('Carga una foto de remera antes de exportar.');return}
    setBusy(true);setError(null);setFeedback(null)
    const generated:HTMLCanvasElement[]=[]
    try{
      for(const view of present){
        const model=views[view]
        if(!model.photo)continue
        const canvas=document.createElement('canvas')
        renderGarment(canvas,model.photo,model.art,model.placement,8192)
        generated.push(canvas)
        await new Promise<void>(resolve=>window.setTimeout(resolve,0))
      }
      let output:HTMLCanvasElement
      if(mode==='combined'&&generated.length===2){
        const margin=36,gap=26
        const width=generated[0].width+generated[1].width+2*margin+gap
        const height=Math.max(generated[0].height,generated[1].height)+2*margin
        if(width>8192||height>8192||width*height>24_000_000){
          throw new Error('El montaje conjunto supera el límite seguro de 24 MP. Exporta cada vista por separado.')
        }
        output=document.createElement('canvas');output.width=width;output.height=height
        const ctx=output.getContext('2d')
        if(!ctx)throw new Error('No se pudo crear la composición conjunta.')
        ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height)
        ctx.drawImage(generated[0],margin,Math.round((height-generated[0].height)/2))
        ctx.drawImage(generated[1],margin+generated[0].width+gap,Math.round((height-generated[1].height)/2))
      }else output=generated[0]
      const blob=await canvasPng(output)
      download(blob,'GAS3D-mockup-'+(mode==='active'?active:'frente-espalda')+'.png')
      setFeedback('Mockup PNG exportado · '+output.width+' × '+output.height+' px.')
      if(output!==generated[0]){output.width=0;output.height=0}
    }catch(err){setError(err instanceof Error?err.message:'No se pudo exportar el mockup.')}
    finally{generated.forEach(canvas=>{canvas.width=0;canvas.height=0});setBusy(false)}
  }

  const model=views[active]
  const canSave=Object.values(views).some(v=>v.photo)
  return <main className="mockup-studio">
    <input ref={inputRef} className="mockup-file" type="file" accept="image/png,image/jpeg,image/webp" onChange={onSelect} aria-label="Seleccionar foto o estampado" />
    <header className="mockup-header">
      <AppLauncher active="mockups" />
      <div><h1>Mockup <span>Studio</span></h1><p>Estampados integrados en fotografías reales</p></div>
      <button type="button" className="mockup-primary mockup-export-header" disabled={busy||!canSave} onClick={()=>void exportMockup('combined')}><ArrowDownToLine size={17}/> Exportar</button>
    </header>

    <div className="mockup-layout">
      <section className="mockup-workspace" aria-label="Vista de remeras">
        <div className="mockup-workspace-heading">
          <h2>Tu catálogo</h2>
          <div className="mockup-view-tabs" role="group" aria-label="Vista para editar">
            {(['front','back'] as const).map(view=><button type="button" key={view} onClick={()=>setActive(view)} className={active===view?'active':''} aria-pressed={active===view}>{names[view]}</button>)}
          </div>
        </div>
        <div className="mockup-view-grid">
          {(['front','back'] as const).map(view=>{
            const part=views[view],quad=part.photo&&part.art?placementQuad(part.photo,part.art,part.placement):null
            return <div className={'mockup-view'+(active===view?' is-active':'')} key={view}>
              <div className="mockup-view-title"><strong>{names[view]}</strong><span>{part.photo?.name??'Sin fotografía'}</span></div>
              {part.photo ? <div className="mockup-stage" ref={element=>{stageRefs.current[view]=element}} style={{aspectRatio:part.photo.width+'/'+part.photo.height}}
                onPointerDown={event=>pointerDown(event,view)}
                onPointerMove={event=>pointerMove(event,view)} onPointerUp={pointerEnd} onPointerCancel={pointerEnd}>
                <canvas ref={element=>{canvasRefs.current[view]=element}} aria-label={'Mockup '+names[view].toLowerCase()}/>
                {showGuides&&quad&&<svg viewBox="0 0 100 100" preserveAspectRatio="none" className="mockup-guides" aria-hidden="true">
                  <polygon points={quad.map(q=>q.x*100+','+q.y*100).join(' ')}/>
                  {quad.map((p,i)=><circle key={i} cx={p.x*100} cy={p.y*100} r="1.15"/>)}
                </svg>}
              </div> :
                <button type="button" className="mockup-empty" onClick={()=>openUpload(view,'photo')}><Shirt size={34}/><strong>Cargar foto de {names[view].toLowerCase()}</strong><small>Recomendamos una remera sin estampado</small></button>}
              <div className="mockup-view-actions">
                <button type="button" disabled={busy} onClick={()=>openUpload(view,'photo')}><ImagePlus size={15}/>{part.photo?'Cambiar remera':'Añadir remera'}</button>
                <button type="button" disabled={busy||!part.photo} onClick={()=>{setActive(view);openUpload(view,'art')}}><Layers2 size={15}/>{part.art?'Cambiar arte':'Añadir estampado'}</button>
                {(part.photo||part.art)&&<button type="button" className="mockup-remove" disabled={busy} onClick={()=>removeAsset(view,part.art?'art':'photo')} title={part.art?'Quitar estampado':'Quitar foto'} aria-label={part.art?'Quitar estampado':'Quitar foto'}><X size={16}/></button>}
              </div>
            </div>
          })}
        </div>
        <p className="mockup-hint">Arrastra el arte para moverlo. Arrastra las esquinas azules para ajustar la perspectiva. Los puntos de edición no aparecen en el PNG exportado.</p>
      </section>
      <aside className="mockup-controls" aria-label="Ajustes del estampado">
        <div className="mockup-panel-title"><SlidersHorizontal size={17}/><h2>Estampado · {names[active]}</h2></div>
        <div className="mockup-asset-status"><span>Prenda</span><strong>{model.photo?.name??'Sin cargar'}</strong><span>Diseño</span><strong>{model.art?.name??'Sin cargar'}</strong></div>
        <div className="mockup-upload-actions">
          <button type="button" disabled={busy} onClick={()=>openUpload(active,'photo')}><Upload size={15}/> Foto base</button>
          <button type="button" disabled={busy} onClick={()=>openUpload(active,'art')}><ImagePlus size={15}/> PNG del arte</button>
        </div>
        <div className="mockup-divider"/>
        <div className="mockup-adjustment"><label htmlFor="mock-width"><span>Tamaño del estampado</span><strong>{Math.round(model.placement.width*100)}%</strong></label><input id="mock-width" type="range" min="4" max="95" step="1" value={Math.round(model.placement.width*100)} onChange={e=>modify(active,p=>({...p,width:Number(e.target.value)/100}))} disabled={!model.art}/></div>
        <div className="mockup-adjustment"><label htmlFor="mock-angle"><span>Rotación</span><strong>{model.placement.rotation}°</strong></label><input id="mock-angle" type="range" min="-45" max="45" step="1" value={model.placement.rotation} onChange={e=>modify(active,p=>({...p,rotation:Number(e.target.value)}))} disabled={!model.art}/></div>
        <div className="mockup-adjustment"><label htmlFor="mock-light"><span>Luces y sombras del tejido</span><strong>{Math.round(model.placement.lighting*100)}%</strong></label><input id="mock-light" type="range" min="0" max="100" step="1" value={Math.round(model.placement.lighting*100)} onChange={e=>modify(active,p=>({...p,lighting:Number(e.target.value)/100}))} disabled={!model.art}/><small>Integra la iluminación real de la prenda sin multiplicar el arte por el color de una remera negra.</small></div>
        <div className="mockup-controls-row">
          <button type="button" onClick={()=>reset(active)} disabled={busy||!model.art}><RotateCcw size={15}/> Centrar de nuevo</button>
          <label className="mockup-guides-toggle"><input type="checkbox" checked={showGuides} onChange={e=>setShowGuides(e.target.checked)}/> Guías</label>
        </div>
        <p className="mockup-note">El tamaño indicado es relativo a la foto. Para garantizar medidas físicas en centímetros será necesaria una plantilla calibrada. Usá fotografías de remeras vacías: este editor no borra estampados preexistentes.</p>
        <div className="mockup-divider"/>
        <div className="mockup-export-actions">
          <button type="button" disabled={busy||!model.photo} onClick={()=>void exportMockup('active')}><ArrowDownToLine size={16}/> Exportar {names[active].toLowerCase()}</button>
          <button type="button" className="mockup-primary" disabled={busy||!canSave} onClick={()=>void exportMockup('combined')}><ArrowDownToLine size={16}/> Exportar frente + espalda</button>
        </div>
        {!ready&&<p role="status">Recuperando tus plantillas guardadas…</p>}
        {busy&&<p role="status" className="mockup-feedback">Procesando la imagen…</p>}
        {feedback&&<p role="status" className="mockup-feedback">{feedback}</p>}
        {error&&<p role="alert" className="mockup-error">{error}</p>}
      </aside>
    </div>
  </main>
}

export { ProductMockupStudio as MockupStudio } from './ProductMockupStudio'
