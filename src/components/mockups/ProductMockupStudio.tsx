import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { ArrowDownToLine, ArrowLeft, Copy, ImagePlus, Layers2, Plus, RotateCcw, Shirt, Trash2, Upload } from 'lucide-react'
import { AppLauncher } from '../navigation/AppLauncher'
import { loadMedia, removeMedia, storeMedia } from '../../utils/mediaStorage'
import { readPngSourceSize, assertStreamedDimensions } from '../images/largeImageExport'
import { bound, canvasPng, ensurePhotoSize, initialPlacement, placementQuad, pointInQuad, renderGarmentLayers, restorePlacement, scaleFromCorner, type MockImage, type Placement, type Point, type ViewName } from './mockupEngine'
import { artworkFitsZone, photoPixelsPerCm, placementWidthForCm, printDimensionsCm, restoreCalibration, zoneDimensionsCm, type CalibrationAxis, type PhotoCalibration } from './mockupCalibration'
import './mockupStudio.css'

type Zone = { id:string; name:string; aspect:number; placement:Placement }
type ProductView = { enabled:boolean; photoName?:string; calibration?:PhotoCalibration; zones:Zone[] }
type Product = { id:string; name:string; type:string; views:Record<ViewName,ProductView> }
type Models = Record<ViewName,{photo:MockImage|null;arts:Record<string,MockImage>}>
type DraftValue = {placement:Placement;name:string}
type Draft = Partial<Record<ViewName,Record<string,DraftValue>>>
type Screen = 'library'|'setup'|'mockup'
type UploadTarget = {kind:'photo'|'art';view:ViewName;zoneId?:string}
type Drag = {view:ViewName;zoneId:string;pointerId:number;corner:number;kind:'move'|'scale'|'warp';start:Point;origin:Placement;artSize:{width:number;height:number}}
const VIEWS:ViewName[]=['front','back','left','right','leftSleeve','rightSleeve']
const LABELS:Record<ViewName,string>={front:'Frente',back:'Espalda',left:'Lateral izquierdo',right:'Lateral derecho',leftSleeve:'Manga izquierda',rightSleeve:'Manga derecha'}
const TYPES=['Remera','Remera oversize','Hoodie','Campera','Gorra','Otro']
const LIBRARY_KEY='gas3d.mockup-products.v2'
const draftKey=(id:string)=>'gas3d.mockup-draft.v2:'+id
const photoKey=(id:string,v:ViewName)=>'mockup-studio:v2:'+id+':'+v+':photo'
const artKey=(id:string,v:ViewName,z:string)=>'mockup-studio:v2:'+id+':'+v+':zone:'+z+':art'
const uid=()=>globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)+Math.random().toString(36).slice(2)
const blank=():Models=>Object.fromEntries(VIEWS.map(view=>[view,{photo:null,arts:{}}])) as Models
const newZone=(view:ViewName,name='Estampado principal'):Zone=>({
  id:uid(),name,aspect:1,placement: view.endsWith('Sleeve')
    ? {...initialPlacement(view),width:.16,y:.40}
    : (view==='left'||view==='right')?{...initialPlacement(view),width:.26,y:.45}:initialPlacement(view),
})
function makeProduct(name:string,type:string):Product{
  return {id:uid(),name,type,views:Object.fromEntries(VIEWS.map(view=>[view,{
    enabled:view==='front'||view==='back',zones:[newZone(view)],
  }])) as Record<ViewName,ProductView>}
}
function readProducts():Product[]{
  try{
    const raw=JSON.parse(localStorage.getItem(LIBRARY_KEY)||'[]') as unknown
    if(!Array.isArray(raw))return []
    return raw.filter((p):p is Product=>!!p&&typeof p==='object'&&typeof p.id==='string'&&typeof p.name==='string'&&typeof p.views==='object'&&p.views!==null)
      .map(p=>({...p,views:Object.fromEntries(VIEWS.map(v=>[v,{
        enabled:Boolean(p.views[v]?.enabled),
        photoName:p.views[v]?.photoName,
        calibration:restoreCalibration(p.views[v]?.calibration),
        zones:Array.isArray(p.views[v]?.zones)?p.views[v].zones.filter(z=>z&&typeof z.id==='string').map(z=>({
          id:z.id,name:typeof z.name==='string'?z.name:'Zona',aspect:bound(Number(z.aspect)||1,.15,6),placement:restorePlacement(z.placement,v),
        })):[],
      }])) as Product['views']}))
  }catch{return []}
}
async function decode(blob:Blob,name:string,kind:'photo'|'art'):Promise<MockImage>{
  if(kind==='art'){
    const size=await readPngSourceSize(blob)
    if(!size)throw new Error('El diseño debe ser un PNG válido.')
    assertStreamedDimensions(size)
    const ratio=Math.min(1,4096/Math.max(size.width,size.height))
    const bitmap=await createImageBitmap(blob,{resizeWidth:Math.max(1,Math.round(size.width*ratio)),resizeHeight:Math.max(1,Math.round(size.height*ratio)),resizeQuality:'high'})
    return {bitmap,width:bitmap.width,height:bitmap.height,name}
  }
  const bitmap=await createImageBitmap(blob)
  try{ensurePhotoSize(bitmap)}catch(e){bitmap.close();throw e}
  return {bitmap,width:bitmap.width,height:bitmap.height,name}
}
function download(blob:Blob,name:string){
  const url=URL.createObjectURL(blob),a=document.createElement('a')
  a.href=url;a.download=name;document.body.append(a);a.click();a.remove()
  window.setTimeout(()=>URL.revokeObjectURL(url),30000)
}
function zoneSize(zone:Zone):{width:number;height:number}{
  return {width:1000,height:1000/zone.aspect}
}
function fitArt(zone:Zone,photo:MockImage,art:MockImage):Placement{
  const availableH=(zone.placement.width*photo.width)/zone.aspect
  const width=Math.min(zone.placement.width,availableH*art.width/art.height/photo.width)
  return {...zone.placement,width:Math.max(.025,width),corners:zone.placement.corners.map(p=>({...p})) as Placement['corners']}
}
function ProductThumbnail({id,views}:{id:string;views:Record<ViewName,ProductView>}){
  const [url,setUrl]=useState('')
  useEffect(()=>{
    let closed=false
    const selected=VIEWS.find(v=>views[v].enabled&&views[v].photoName)
    if(!selected){setUrl('');return}
    void loadMedia(photoKey(id,selected)).then(blob=>{
      if(!blob||closed)return
      const next=URL.createObjectURL(blob)
      setUrl(next)
    }).catch(()=>{})
    return ()=>{closed=true}
  },[id,views])
  useEffect(()=>()=>{if(url)URL.revokeObjectURL(url)},[url])
  return <div className="mockup-product-image">{url?<img src={url} alt="Foto del producto"/>:<Shirt size={36}/>}</div>
}
export function ProductMockupStudio(){
  const [products,setProducts]=useState<Product[]>(readProducts)
  const [selectedId,setSelectedId]=useState<string|null>(null)
  const [screen,setScreen]=useState<Screen>('library')
  const [newName,setNewName]=useState('')
  const [newType,setNewType]=useState(TYPES[0])
  const [active,setActive]=useState<ViewName>('front')
  const [zoneId,setZoneId]=useState('')
  const [models,setModels]=useState<Models>(blank)
  const [draft,setDraft]=useState<Draft>({})
  const [loadedId,setLoadedId]=useState<string|null>(null)
  const [busy,setBusy]=useState(false)
  const [warpMode,setWarpMode]=useState(false)
  const [guides,setGuides]=useState(true)
  const [calibrationMode,setCalibrationMode]=useState<{view:ViewName;axis:CalibrationAxis;first:Point|null}|null>(null)
  const [measureDraft,setMeasureDraft]=useState<Record<string,string>>({})
  const [feedback,setFeedback]=useState('')
  const [error,setError]=useState('')
  const inputRef=useRef<HTMLInputElement>(null)
  const targetRef=useRef<UploadTarget>({kind:'photo',view:'front'})
  const canvasRefs=useRef<Partial<Record<ViewName,HTMLCanvasElement|null>>>({})
  const dragRef=useRef<Drag|null>(null)
  const modelsRef=useRef(models)
  useEffect(()=>{modelsRef.current=models},[models])
  const product=products.find(p=>p.id===selectedId)
  const enabled=product?VIEWS.filter(v=>product.views[v].enabled):[]
  const current=product?.views[active]
  const selectedZone=current?.zones.find(z=>z.id===zoneId)??current?.zones[0]
  const selectedArt=selectedZone?models[active].arts[selectedZone.id]:null
  const photo=models[active].photo
  const calibration=current?.calibration??{}
  const photoScale=photo?photoPixelsPerCm(photo,calibration):null
  const zoneCm=photo&&selectedZone?zoneDimensionsCm(photo,selectedZone.placement,selectedZone.aspect,calibration):null
  const printCm=photo&&selectedZone&&selectedArt
    ?printDimensionsCm(photo,selectedArt,draft[active]?.[selectedZone.id]?.placement??fitArt(selectedZone,photo,selectedArt),calibration):null
  const printFits=photo&&selectedZone&&selectedArt
    ?artworkFitsZone(photo,selectedArt,draft[active]?.[selectedZone.id]?.placement??fitArt(selectedZone,photo,selectedArt),selectedZone.placement,selectedZone.aspect):true

  useEffect(()=>{
    try{localStorage.setItem(LIBRARY_KEY,JSON.stringify(products))}catch{/* Storage optional */}
  },[products])
  // First-run migration copies the old front/back photos without deleting the old assets.
  useEffect(()=>{
    if(readProducts().length)return
    let disposed=false
    void (async()=>{
      const oldFront=await loadMedia('mockup-studio:v1:front:photo').catch(()=>null)
      const oldBack=await loadMedia('mockup-studio:v1:back:photo').catch(()=>null)
      if((!oldFront&&!oldBack)||disposed)return
      const legacy=makeProduct('Remera importada','Remera')
      const legacyDraft:Draft={}
      let previous:Record<string,unknown>={}
      try{previous=JSON.parse(localStorage.getItem('gas3d.mockup-studio.v1')||'{}') as Record<string,unknown>}catch{/* Invalid legacy settings */}
      const oldNames=(previous.names||{}) as Record<string,string>
      for(const view of ['front','back'] as const){
        const photo=view==='front'?oldFront:oldBack
        if(photo){
          await storeMedia(photoKey(legacy.id,view),photo).catch(()=>{})
          legacy.views[view].photoName=oldNames[view+':photo']||'Foto importada'
        }
        const art=await loadMedia('mockup-studio:v1:'+view+':art').catch(()=>null)
        if(art){
          const zone=legacy.views[view].zones[0]
          await storeMedia(artKey(legacy.id,view,zone.id),art).catch(()=>{})
          legacyDraft[view]={[zone.id]:{
            placement:restorePlacement(previous[view],view),
            name:oldNames[view+':art']||'Diseño importado',
          }}
        }
      }
      try{localStorage.setItem(draftKey(legacy.id),JSON.stringify(legacyDraft))}catch{/* Storage optional */}
      if(!disposed)setProducts(previousProducts=>previousProducts.length?previousProducts:[legacy])
    })()
    return ()=>{disposed=true}
  },[])

  useEffect(()=>{
    if(!selectedId||!product){setLoadedId(null);return}
    let disposed=false
    const opened:ImageBitmap[]=[]
    setLoadedId(null)
    // Retain the current canvas while the next product's assets decode; the
    // loadedId gate prevents exporting stale photos under another product.
    setModels(blank());setDraft({})
    void (async()=>{
      const next=blank()
      let stored:Draft={}
      try{stored=JSON.parse(localStorage.getItem(draftKey(selectedId))||'{}') as Draft}catch{stored={}}
      for(const view of VIEWS){
        try{
          const blob=await loadMedia(photoKey(selectedId,view))
          if(blob){const asset=await decode(blob,product.views[view].photoName||'Foto', 'photo');opened.push(asset.bitmap);next[view].photo=asset}
        }catch{/* A missing photo must not block the other views. */}
        for(const zone of product.views[view].zones){
          try{
            const blob=await loadMedia(artKey(selectedId,view,zone.id))
            if(blob){const asset=await decode(blob,stored[view]?.[zone.id]?.name||'Diseño','art');opened.push(asset.bitmap);next[view].arts[zone.id]=asset}
          }catch{/* A missing artwork must not block the library. */}
        }
      }
      if(!disposed){setModels(next);setDraft(stored);setLoadedId(selectedId)}
    })()
    return ()=>{disposed=true;opened.forEach(b=>b.close())}
    // Product setup edits must not force the photo to reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[selectedId])
  useEffect(()=>{
    if(!selectedId||loadedId!==selectedId)return
    try{localStorage.setItem(draftKey(selectedId),JSON.stringify(draft))}catch{/* Browser quota */}
  },[selectedId,loadedId,draft])
  useEffect(()=>{
    if(!product||loadedId!==product.id)return
    const frame=requestAnimationFrame(()=>{
      for(const view of VIEWS.filter(v=>product.views[v].enabled)){
        const photo=models[view].photo,canvas=canvasRefs.current[view]
        if(!photo||!canvas)continue
        const layers=screen==='mockup'?product.views[view].zones.flatMap(zone=>{
          const art=models[view].arts[zone.id]
          if(!art)return []
          const placement=draft[view]?.[zone.id]?.placement??fitArt(zone,photo,art)
          return [{art,placement}]
        }):[]
        try{renderGarmentLayers(canvas,photo,layers,1050)}
        catch(e){setError(e instanceof Error?e.message:'Error al mostrar el mockup.')}
      }
    })
    return ()=>cancelAnimationFrame(frame)
  },[models,draft,product,screen,loadedId])

  const updateProduct=(edit:(p:Product)=>Product)=>{
    setProducts(all=>all.map(p=>p.id===selectedId?edit(p):p))
  }
  const updateZone=(view:ViewName,zid:string,edit:(z:Zone)=>Zone)=>{
    updateProduct(p=>({...p,views:{...p.views,[view]:{...p.views[view],zones:p.views[view].zones.map(z=>z.id===zid?edit(z):z)}}}))
  }
  const placementFor=(view:ViewName,zone:Zone)=>{
    const photo=models[view].photo,art=models[view].arts[zone.id]
    return draft[view]?.[zone.id]?.placement??(photo&&art?fitArt(zone,photo,art):zone.placement)
  }
  const editPlacement=(view:ViewName,zone:Zone,edit:(p:Placement)=>Placement)=>{
    if(screen==='setup')updateZone(view,zone.id,z=>({...z,placement:edit(z.placement)}))
    else setDraft(previous=>({...previous,[view]:{...previous[view],[zone.id]:{
      placement:edit(placementFor(view,zone)),name:previous[view]?.[zone.id]?.name??models[view].arts[zone.id]?.name??'Diseño',
    }}}))
  }
  const openUpload=(kind:'photo'|'art',view:ViewName,zid?:string)=>{
    targetRef.current={kind,view,zoneId:zid}
    if(inputRef.current){
      inputRef.current.accept=kind==='art'?'image/png':'image/png,image/jpeg,image/webp'
      inputRef.current.click()
    }
  }
  const onSelect=(event:ChangeEvent<HTMLInputElement>)=>{
    const file=event.currentTarget.files?.[0]
    event.currentTarget.value=''
    if(!file||busy||!selectedId||loadedId!==selectedId)return
    const {kind,view,zoneId:zid}=targetRef.current
    const valid=kind==='art'?file.type==='image/png'||(!file.type&&/\.png$/i.test(file.name)):
      /^image\/(png|jpeg|webp)$/.test(file.type)||(!file.type&&/\.(png|jpe?g|webp)$/i.test(file.name))
    if(!valid){setError(kind==='art'?'El estampado debe ser PNG.':'La fotografía debe ser JPG, PNG o WebP.');return}
    if(file.size>55*1024*1024){setError('El archivo supera 55 MB.');return}
    setBusy(true);setError('');setFeedback('')
    const key=kind==='photo'?photoKey(selectedId,view):artKey(selectedId,view,zid||'')
    void (async()=>{
      try{
        const image=await decode(file,file.name,kind)
        await storeMedia(key,file)
        setModels(old=>({...old,[view]:{
          ...old[view],photo:kind==='photo'?image:old[view].photo,
          arts:kind==='art'?{...old[view].arts,[zid||'']:image}:old[view].arts,
        }}))
        if(kind==='photo'){
          // A replacement photo invalidates previously marked references.
          updateProduct(p=>({...p,views:{...p.views,[view]:{...p.views[view],photoName:file.name,calibration:{}}}}))
          setMeasureDraft(old=>Object.fromEntries(Object.entries(old).filter(([key])=>!key.startsWith(view+':'))))
          setCalibrationMode(null)
        }
        else if(zid){
          setDraft(old=>({...old,[view]:{...old[view],[zid]:{
            placement:old[view]?.[zid]?.placement??fitArt(product!.views[view].zones.find(z=>z.id===zid)!,modelsRef.current[view].photo!,image),
            name:file.name,
          }}}))
        }
        setFeedback('Archivo guardado en este navegador.')
      }catch(e){setError(e instanceof Error?e.message:'No se pudo cargar el archivo.')}
      finally{setBusy(false)}
    })()
  }
  const removeAsset=(kind:'photo'|'art',view:ViewName,zid?:string)=>{
    if(!selectedId||busy)return
    const key=kind==='photo'?photoKey(selectedId,view):artKey(selectedId,view,zid||'')
    setModels(old=>({...old,[view]:{
      photo:kind==='photo'?null:old[view].photo,
      arts:kind==='art'?Object.fromEntries(Object.entries(old[view].arts).filter(([id])=>id!==zid)):old[view].arts,
    }}))
    if(kind==='photo')updateProduct(p=>({...p,views:{...p.views,[view]:{...p.views[view],photoName:undefined}}}))
    void removeMedia(key).catch(()=>setError('No se pudo borrar el archivo del navegador.'))
  }
  const position=(e:ReactPointerEvent<HTMLDivElement>):Point=>{
    const r=e.currentTarget.getBoundingClientRect()
    return {x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height}
  }
  const onPointerDown=(e:ReactPointerEvent<HTMLDivElement>,view:ViewName)=>{
    if(busy||loadedId!==selectedId||e.button!==0||!product)return
    if(screen==='setup'&&calibrationMode?.view===view){
      const pointOnPhoto=position(e)
      if(!calibrationMode.first){setCalibrationMode({...calibrationMode,first:pointOnPhoto});return}
      const axis=calibrationMode.axis,first=calibrationMode.first
      const value=measureDraft[view+':'+axis]??product.views[view].calibration?.[axis]?.cm?.toString()??''
      const cm=Number(value)
      if(!value.trim()||!Number.isFinite(cm)||cm<.1||cm>500){
        setError('Introducí primero una medida válida en centímetros.');setCalibrationMode(null);return
      }
      const delta=Math.abs(axis==='horizontal'?pointOnPhoto.x-first.x:pointOnPhoto.y-first.y)
      if(delta<.005){setError('Los puntos están demasiado cerca. Volvé a marcar la referencia.');setCalibrationMode(null);return}
      updateProduct(p=>({...p,views:{...p.views,[view]:{
        ...p.views[view],
        calibration:{...p.views[view].calibration,[axis]:{from:first,to:pointOnPhoto,cm}},
      }}}))
      setCalibrationMode(null);setError('');setFeedback('Referencia guardada para '+LABELS[view]+'.')
      return
    }
    const zone=view===active?selectedZone:product.views[view].zones[0]
    const photo=modelsRef.current[view].photo
    if(!zone||!photo)return
    const art=screen==='setup'?zoneSize(zone):modelsRef.current[view].arts[zone.id]
    if(!art)return
    const placement=screen==='setup'?zone.placement:placementFor(view,zone)
    const p=position(e),quad=placementQuad(photo,art,placement),r=e.currentTarget.getBoundingClientRect()
    let corner=-1
    for(let i=0;i<4;i++){
      if(Math.hypot((quad[i].x-p.x)*r.width,(quad[i].y-p.y)*r.height)<24){corner=i;break}
    }
    if(corner<0&&!pointInQuad(p,quad))return
    e.currentTarget.setPointerCapture(e.pointerId)
    setActive(view);setZoneId(zone.id)
    dragRef.current={view,zoneId:zone.id,pointerId:e.pointerId,corner,kind:corner<0?'move':(warpMode||e.ctrlKey||e.metaKey?'warp':'scale'),start:p,origin:placement,artSize:art}
  }
  const onPointerMove=(e:ReactPointerEvent<HTMLDivElement>,view:ViewName)=>{
    const drag=dragRef.current
    if(!drag||drag.pointerId!==e.pointerId||drag.view!==view||!product)return
    const photo=modelsRef.current[view].photo,zone=product.views[view].zones.find(z=>z.id===drag.zoneId)
    if(!photo||!zone)return
    const p=position(e),dx=p.x-drag.start.x,dy=p.y-drag.start.y
    const next=drag.kind==='move'?{...drag.origin,x:bound(drag.origin.x+dx,-.4,1.4),y:bound(drag.origin.y+dy,-.4,1.4)}:
      drag.kind==='scale'?scaleFromCorner(photo,drag.artSize,drag.origin,drag.corner,p):
      {...drag.origin,corners:drag.origin.corners.map((v,i)=>i===drag.corner?{x:bound(v.x+dx,-.5,.5),y:bound(v.y+dy,-.5,.5)}:v) as Placement['corners']}
    editPlacement(view,zone,()=>next)
  }
  const onPointerEnd=(e:ReactPointerEvent<HTMLDivElement>)=>{
    if(dragRef.current?.pointerId===e.pointerId)dragRef.current=null
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)
  }
  const addProduct=()=>{
    if(!newName.trim())return
    const p=makeProduct(newName.trim(),newType)
    setProducts(all=>[...all,p]);setSelectedId(p.id);setScreen('setup');setActive('front');setZoneId('')
    setNewName('');setFeedback('Producto creado. Ahora configurá sus vistas y zonas de estampado.')
  }
  const duplicate=async(p:Product)=>{
    if(busy)return
    setBusy(true)
    try{
      const copy:Product={...p,id:uid(),name:p.name+' (copia)',views:structuredClone(p.views)}
      for(const view of VIEWS){
        const src=await loadMedia(photoKey(p.id,view))
        if(src)await storeMedia(photoKey(copy.id,view),src)
      }
      setProducts(all=>[...all,copy]);setFeedback('Producto duplicado con sus fotografías y zonas.')
    }catch{setError('No se pudo duplicar el producto completo.')}
    finally{setBusy(false)}
  }
  const erase=async(p:Product)=>{
    if(!window.confirm('¿Eliminar "'+p.name+'" y sus fotografías y estampados locales?'))return
    setBusy(true)
    try{
      for(const view of VIEWS){
        await removeMedia(photoKey(p.id,view))
        for(const zone of p.views[view].zones)await removeMedia(artKey(p.id,view,zone.id))
      }
      localStorage.removeItem(draftKey(p.id))
      setProducts(all=>all.filter(item=>item.id!==p.id))
      if(selectedId===p.id){setSelectedId(null);setScreen('library')}
      setFeedback('Producto eliminado.')
    }catch{setError('No se pudieron eliminar todos los archivos locales.')}
    finally{setBusy(false)}
  }
  const exportMockup=async(all:boolean)=>{
    if(!product||busy||loadedId!==product.id)return
    const chosen=(all?enabled:[active]).filter(view=>models[view].photo)
    if(!chosen.length){setError('Añadí una fotografía al producto antes de exportar.');return}
    setBusy(true);setError('');setFeedback('')
    const canvases:HTMLCanvasElement[]=[]
    try{
      for(const view of chosen){
        const photo=models[view].photo!
        const layers=product.views[view].zones.flatMap(zone=>{
          const art=models[view].arts[zone.id]
          return art?[{art,placement:draft[view]?.[zone.id]?.placement??fitArt(zone,photo,art)}]:[]
        })
        const canvas=document.createElement('canvas')
        renderGarmentLayers(canvas,photo,layers,8192);canvases.push(canvas)
      }
      let output=canvases[0]
      if(all&&canvases.length>1){
        const pad=32,gap=24,columns=Math.min(2,canvases.length),rows=Math.ceil(canvases.length/columns)
        const colWidths=Array.from({length:columns},(_,col)=>Math.max(...canvases.filter((_,i)=>i%columns===col).map(c=>c.width)))
        const rowHeights=Array.from({length:rows},(_,row)=>Math.max(...canvases.slice(row*columns,(row+1)*columns).map(c=>c.height)))
        const width=colWidths.reduce((a,b)=>a+b,0)+2*pad+gap*(columns-1)
        const height=rowHeights.reduce((a,b)=>a+b,0)+2*pad+gap*(rows-1)
        if(width>8192||height>8192||width*height>24_000_000)throw new Error('El collage supera el límite de 24 MP. Exportá cada vista por separado.')
        output=document.createElement('canvas');output.width=width;output.height=height
        const ctx=output.getContext('2d')
        if(!ctx)throw new Error('No se pudo crear el collage.')
        ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height)
        canvases.forEach((c,i)=>{
          const col=i%columns,row=Math.floor(i/columns)
          const x=pad+colWidths.slice(0,col).reduce((a,b)=>a+b,0)+col*gap
          const y=pad+rowHeights.slice(0,row).reduce((a,b)=>a+b,0)+row*gap
          ctx.drawImage(c,x,y)
        })
      }
      const blob=await canvasPng(output)
      download(blob,'GAS3D-'+product.name.replace(/[^a-z0-9_-]+/gi,'-')+'-'+(all?'vistas':active)+'.png')
      setFeedback('Exportación PNG terminada · '+output.width+' × '+output.height+' px.')
      if(output!==canvases[0]){output.width=0;output.height=0}
    }catch(e){setError(e instanceof Error?e.message:'No se pudo exportar.')}
    finally{canvases.forEach(c=>{c.width=0;c.height=0});setBusy(false)}
  }

  return <main className="mockup-studio">
    <input ref={inputRef} className="mockup-file" type="file" onChange={onSelect} aria-label="Seleccionar archivo"/>
    <header className="mockup-header">
      <AppLauncher active="mockups"/>
      <div><h1>Mockup <span>Studio</span></h1><p>Biblioteca de productos y estampados reutilizables</p></div>
      {screen!=='library'&&<button type="button" className="mockup-nav-button" disabled={busy} onClick={()=>{setScreen('library');setSelectedId(null)}}><ArrowLeft size={16}/> Productos</button>}
    </header>
    {screen==='library'||!product?<section className="mockup-library">
      <div className="mockup-library-intro"><div><h2>Productos</h2><p>Guardá cada prenda una sola vez. Después creá todos los mockups que necesites, sin volver a cargar las fotos.</p></div><span>{products.length} productos</span></div>
      <form className="mockup-new-product" onSubmit={e=>{e.preventDefault();addProduct()}}>
        <label>Nombre del producto<input required value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Ej. Remera oversize negra 24/1"/></label>
        <label>Tipo de producto<select value={newType} onChange={e=>setNewType(e.target.value)}>{TYPES.map(t=><option key={t}>{t}</option>)}</select></label>
        <button type="submit" className="mockup-primary"><Plus size={17}/> Crear producto</button>
      </form>
      <div className="mockup-product-grid">
        {products.map(p=><article key={p.id} className="mockup-product-card">
          <ProductThumbnail id={p.id} views={p.views}/>
          <div className="mockup-product-info"><small>{p.type} · {VIEWS.filter(v=>p.views[v].enabled).length} vistas</small><h3>{p.name}</h3></div>
          <div className="mockup-product-actions">
            <button type="button" onClick={()=>{setSelectedId(p.id);setScreen('mockup');setActive(VIEWS.find(v=>p.views[v].enabled)||'front');setZoneId('')}}>Nuevo mockup</button>
            <button type="button" onClick={()=>{setSelectedId(p.id);setScreen('setup');setActive(VIEWS.find(v=>p.views[v].enabled)||'front');setZoneId('')}}>Editar</button>
            <button type="button" disabled={busy} onClick={()=>void duplicate(p)} aria-label={'Duplicar '+p.name}><Copy size={15}/></button>
            <button type="button" disabled={busy} onClick={()=>void erase(p)} aria-label={'Eliminar '+p.name}><Trash2 size={15}/></button>
          </div>
        </article>)}
        {!products.length&&<div className="mockup-library-empty"><Shirt size={32}/><strong>Aún no hay productos.</strong><p>Creá el primero para configurar sus fotos, vistas y zonas de estampado.</p></div>}
      </div>
      <p className="mockup-note">Tus productos, fotografías y estampados se guardan solamente en este navegador. No se sincronizan entre dispositivos.</p>
    </section>:<div className="mockup-editor-shell">
      <nav className="mockup-editor-breadcrumb"><strong>{product.name}</strong><div role="group" aria-label="Modo del editor">
        <button type="button" className={screen==='setup'?'active':''} disabled={busy} onClick={()=>setScreen('setup')}>Configurar producto</button>
        <button type="button" className={screen==='mockup'?'active':''} disabled={busy} onClick={()=>{setScreen('mockup');setCalibrationMode(null)}}>Nuevo mockup</button>
      </div></nav>
      <div className="mockup-layout">
        <section className="mockup-workspace">
          <div className="mockup-workspace-heading"><h2>{screen==='setup'?'Fotografías y zonas':'Vista previa del mockup'}</h2><div className="mockup-view-tabs" role="group" aria-label="Vistas">{enabled.map(v=><button type="button" key={v} className={v===active?'active':''} onClick={()=>{setActive(v);setZoneId('');setCalibrationMode(null)}}>{LABELS[v]}</button>)}</div></div>
          <div className="mockup-view-grid">
            {enabled.map(view=>{
              const photo=models[view].photo,viewZones=product.views[view].zones
              const z=view===active?selectedZone:viewZones[0]
              const art=z?(screen==='setup'?zoneSize(z):models[view].arts[z.id]):null
              const placement=z?(screen==='setup'?z.placement:placementFor(view,z)):null
              const quad=photo&&art&&placement?placementQuad(photo,art,placement):null
              return <div className={'mockup-view'+(active===view?' is-active':'')} key={view}>
                <div className="mockup-view-title"><strong>{LABELS[view]}</strong><span>{photo?.name||'Sin fotografía'}</span></div>
                {photo?<div className="mockup-stage" style={{aspectRatio:photo.width+'/'+photo.height,cursor:calibrationMode?.view===view?'crosshair':undefined}}
                  onPointerDown={e=>onPointerDown(e,view)} onPointerMove={e=>onPointerMove(e,view)} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
                  <canvas ref={node=>{canvasRefs.current[view]=node}} aria-label={'Vista '+LABELS[view]}/>
                  {guides&&quad&&<svg className="mockup-guides" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    <polygon points={quad.map(p=>p.x*100+','+p.y*100).join(' ')}/>
                    {quad.map((p,i)=><circle key={i} cx={p.x*100} cy={p.y*100} r="1.15"/>)}
                  </svg>}
                  {screen==='setup'&&guides&&<svg className="mockup-calibration-guides" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    {(['horizontal','vertical'] as const).map(axis=>{
                      const line=product.views[view].calibration?.[axis]
                      return line?<g key={axis} className={axis}>
                        <line x1={line.from.x*100} y1={line.from.y*100} x2={line.to.x*100} y2={line.to.y*100}/>
                        <circle cx={line.from.x*100} cy={line.from.y*100} r="1.1"/>
                        <circle cx={line.to.x*100} cy={line.to.y*100} r="1.1"/>
                      </g>:null
                    })}
                    {calibrationMode?.view===view&&calibrationMode.first&&
                      <circle className="pending" cx={calibrationMode.first.x*100} cy={calibrationMode.first.y*100} r="1.45"/>}
                  </svg>}
                </div>:<button type="button" className="mockup-empty" disabled={screen!=='setup'} onClick={()=>openUpload('photo',view)}><Shirt size={32}/><strong>{screen==='setup'?'Añadir fotografía':'Falta configurar la fotografía'}</strong><small>{LABELS[view]}</small></button>}
                <div className="mockup-view-actions">
                  {screen==='setup'?<button type="button" disabled={busy} onClick={()=>openUpload('photo',view)}><ImagePlus size={15}/>{photo?'Cambiar foto':'Añadir foto'}</button>:
                    <button type="button" disabled={busy||!z||!photo} onClick={()=>openUpload('art',view,z?.id)}><Layers2 size={15}/>{z&&models[view].arts[z.id]?'Cambiar PNG':'Añadir PNG'}</button>}
                  {screen==='setup'&&photo&&<button type="button" className="mockup-remove" onClick={()=>removeAsset('photo',view)} aria-label="Quitar foto"><Trash2 size={15}/></button>}
                </div>
              </div>
            })}
          </div>
          <p className="mockup-hint">Arrastrá el estampado para moverlo. Las esquinas escalan proporcionalmente. Para deformar: Ctrl + arrastrar en computadora, o activá «Deformar» en móvil. Las guías no se exportan.</p>
        </section>
        <aside className="mockup-controls">
          {screen==='setup'?<>
            <h2>Configuración del producto</h2>
            <label className="mockup-field">Nombre<input value={product.name} onChange={e=>updateProduct(p=>({...p,name:e.target.value}))}/></label>
            <label className="mockup-field">Tipo<select value={product.type} onChange={e=>updateProduct(p=>({...p,type:e.target.value}))}>{TYPES.map(t=><option key={t}>{t}</option>)}</select></label>
            <div className="mockup-divider"/>
            <h3>Vistas disponibles</h3>
            <div className="mockup-views-picker">{VIEWS.map(v=><label key={v}><input type="checkbox" checked={product.views[v].enabled} onChange={e=>{
              const enabledNow=e.target.checked
              updateProduct(p=>({...p,views:{...p.views,[v]:{...p.views[v],enabled:enabledNow}}}))
              if(enabledNow){setActive(v);setZoneId('')}else if(v===active){setActive(VIEWS.find(k=>k!==v&&product.views[k].enabled)||'front');setZoneId('')}
            }}/>{LABELS[v]}</label>)}</div>
            <div className="mockup-divider"/>
            <div className="mockup-calibration">
              <h3>Calibración de fotografía · {LABELS[active]}</h3>
              <p className="mockup-note">Medí la prenda y marcá dos puntos por eje sobre la foto. La escala es aproximada si hay perspectiva.</p>
              <div className="mockup-calibration-grid">
                {(['horizontal','vertical'] as const).map(axis=>{
                  const line=current?.calibration?.[axis]
                  const key=active+':'+axis
                  const value=measureDraft[key]??(line?.cm?.toString()??'')
                  const valid=value.trim()!==''&&Number.isFinite(Number(value))&&Number(value)>=.1&&Number(value)<=500
                  return <div key={axis} className="mockup-calibration-axis">
                    <label className="mockup-field">{axis==='horizontal'?'Ancho de referencia (cm)':'Alto de referencia (cm)'}
                      <input type="number" min=".1" max="500" step=".1" value={value}
                        onChange={e=>{
                          const input=e.target.value
                          setMeasureDraft(old=>({...old,[key]:input}))
                          const cm=Number(input)
                          if(line&&input.trim()&&Number.isFinite(cm)&&cm>=.1&&cm<=500){
                            updateProduct(p=>({...p,views:{...p.views,[active]:{
                              ...p.views[active],
                              calibration:{...p.views[active].calibration,[axis]:{...line,cm}},
                            }}}))
                          }
                        }}/>
                    </label>
                    <button type="button" disabled={!models[active].photo||busy||!valid}
                      className={calibrationMode?.view===active&&calibrationMode.axis===axis?'is-marking':''}
                      onClick={()=>{setError('');setCalibrationMode({view:active,axis,first:null})}}>
                      {line?'Volver a marcar':'Marcar en foto'}
                    </button>
                    <small>{line?'Referencia marcada':'Sin referencia'}</small>
                  </div>
                })}
              </div>
              {calibrationMode?.view===active&&<div className="mockup-calibration-prompt" role="status">
                Marcá {calibrationMode.first?'el segundo':'el primer'} punto sobre la fotografía.
                <button type="button" onClick={()=>setCalibrationMode(null)}>Cancelar</button>
              </div>}
              <p className="mockup-note">{photoScale?'Dos referencias listas: ya podés usar centímetros.':'Completá ancho y alto para habilitar medidas en centímetros.'}</p>
            </div>
            <div className="mockup-divider"/>
            <h3>Zonas de estampado · {LABELS[active]}</h3>
            <button type="button" className="mockup-secondary-full" onClick={()=>{
              const z=newZone(active,'Zona '+(current!.zones.length+1))
              updateProduct(p=>({...p,views:{...p.views,[active]:{...p.views[active],zones:[...p.views[active].zones,z]}}}))
              setZoneId(z.id)
            }}><Plus size={16}/> Añadir zona</button>
          </>:<><h2>Estampados · {LABELS[active]}</h2><p className="mockup-note">Elegí una zona y añadí su PNG. Podés usar varios estampados por vista.</p></>}
          <div className="mockup-zone-tabs">{current?.zones.map(z=><button type="button" key={z.id} className={z.id===selectedZone?.id?'active':''} onClick={()=>setZoneId(z.id)}>{z.name}</button>)}</div>
          {selectedZone&&<div className="mockup-zone-controls">
            {screen==='setup'?<>
              <label className="mockup-field">Nombre de zona<input value={selectedZone.name} onChange={e=>updateZone(active,selectedZone.id,z=>({...z,name:e.target.value}))}/></label>
              <label className="mockup-adjustment"><span>Ancho relativo de la zona: {Math.round(selectedZone.placement.width*100)}%</span><input type="range" min="4" max="95" value={Math.round(selectedZone.placement.width*100)} onChange={e=>updateZone(active,selectedZone.id,z=>({...z,placement:{...z.placement,width:Number(e.target.value)/100}}))}/></label>
              <label className="mockup-adjustment"><span>Proporción (ancho/alto): {selectedZone.aspect.toFixed(2)}</span><input type="range" min="0.25" max="3" step=".05" value={selectedZone.aspect} onChange={e=>updateZone(active,selectedZone.id,z=>({...z,aspect:Number(e.target.value)}))}/></label>
              {zoneCm&&<p className="mockup-physical-summary">Zona estimada: <strong>{zoneCm.width.toFixed(1)} × {zoneCm.height.toFixed(1)} cm</strong></p>}
              <button type="button" className="mockup-danger-action" onClick={()=>{
                if(current!.zones.length<=1){setError('Cada vista debe conservar al menos una zona.');return}
                updateProduct(p=>({...p,views:{...p.views,[active]:{...p.views[active],zones:p.views[active].zones.filter(z=>z.id!==selectedZone.id)}}}))
                void removeMedia(artKey(product.id,active,selectedZone.id)).catch(()=>{})
                setZoneId('')
              }}><Trash2 size={15}/> Eliminar zona</button>
            </>:<>
              <div className="mockup-asset-status"><span>Diseño</span><strong>{selectedArt?.name||'Sin cargar'}</strong></div>
              <div className="mockup-upload-actions">
                <button type="button" disabled={busy||!models[active].photo} onClick={()=>openUpload('art',active,selectedZone.id)}><Upload size={15}/> PNG del arte</button>
                <button type="button" disabled={busy||!selectedArt} onClick={()=>removeAsset('art',active,selectedZone.id)}><Trash2 size={15}/> Quitar arte</button>
              </div>
              <label className="mockup-adjustment"><span>Ancho del estampado: {Math.round(placementFor(active,selectedZone).width*100)}%</span><input type="range" min="3" max="95" value={Math.round(placementFor(active,selectedZone).width*100)} disabled={!selectedArt} onChange={e=>editPlacement(active,selectedZone,p=>({...p,width:Number(e.target.value)/100}))}/></label>
              {printCm&&selectedArt&&photo&&<div className="mockup-print-centimeters">
                <h3>Tamaño del estampado · cm</h3>
                <div className="mockup-cm-inputs">
                  {(['horizontal','vertical'] as const).map(axis=>{
                    const length=axis==='horizontal'?printCm.width:printCm.height
                    return <label className="mockup-field" key={axis}>{axis==='horizontal'?'Ancho (cm)':'Alto (cm)'}
                      <input key={active+':'+selectedZone.id+':'+axis+':'+length.toFixed(2)}
                        type="number" min=".1" max="500" step=".1" defaultValue={length.toFixed(1)}
                        onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}}
                        onBlur={e=>{
                          const input=e.currentTarget.value
                          if(!input.trim())return
                          const newWidth=placementWidthForCm(photo,selectedArt,calibration,axis,Number(input))
                          if(newWidth===null){setError('Ingresá una medida válida de 0,1 a 500 cm.');return}
                          editPlacement(active,selectedZone,p=>({...p,width:newWidth}))
                        }}/>
                    </label>
                  })}
                </div>
                <p className="mockup-note">Escribí una medida y pulsá Enter. La otra se calcula automáticamente, sin deformar el PNG.</p>
              </div>}
              {!printFits&&selectedArt&&<p className="mockup-print-warning" role="status">El estampado sobresale de su zona. Reducilo o movelo antes de exportar.</p>}
              <label className="mockup-adjustment"><span>Rotación: {placementFor(active,selectedZone).rotation}°</span><input type="range" min="-45" max="45" value={placementFor(active,selectedZone).rotation} disabled={!selectedArt} onChange={e=>editPlacement(active,selectedZone,p=>({...p,rotation:Number(e.target.value)}))}/></label>
              <label className="mockup-adjustment"><span>Luces y sombras: {Math.round(placementFor(active,selectedZone).lighting*100)}%</span><input type="range" min="0" max="100" value={Math.round(placementFor(active,selectedZone).lighting*100)} disabled={!selectedArt} onChange={e=>editPlacement(active,selectedZone,p=>({...p,lighting:Number(e.target.value)/100}))}/></label>
            </>}
            <div className="mockup-controls-row">
              <button type="button" onClick={()=>{
                if(screen==='setup')editPlacement(active,selectedZone,()=>initialPlacement(active))
                else{
                  const photo=models[active].photo,art=models[active].arts[selectedZone.id]
                  if(photo&&art)editPlacement(active,selectedZone,()=>fitArt(selectedZone,photo,art))
                }
              }}><RotateCcw size={15}/> Restablecer</button>
              <label className="mockup-guides-toggle"><input type="checkbox" checked={guides} onChange={e=>setGuides(e.target.checked)}/> Guías</label>
            </div>
          </div>}
          <div className="mockup-divider"/>
          <div className="mockup-mode-toggle" role="group" aria-label="Modo de esquinas">
            <button type="button" className={!warpMode?'active':''} onClick={()=>setWarpMode(false)}>Escalar</button>
            <button type="button" className={warpMode?'active':''} onClick={()=>setWarpMode(true)}>Deformar</button>
          </div>
          <p className="mockup-note">{photoScale?'Escala estimada a partir de dos referencias marcadas en esta fotografía.':'Sin calibrar: las medidas de esta vista son relativas a la fotografía.'}</p>
          {screen==='mockup'?<div className="mockup-export-actions">
            <button type="button" disabled={busy||!models[active].photo} onClick={()=>void exportMockup(false)}><ArrowDownToLine size={16}/> Exportar {LABELS[active]}</button>
            <button type="button" className="mockup-primary" disabled={busy||loadedId!==selectedId||!enabled.some(v=>models[v].photo)} onClick={()=>void exportMockup(true)}><ArrowDownToLine size={16}/> Exportar todas las vistas</button>
          </div>:<button type="button" className="mockup-primary mockup-secondary-full" onClick={()=>setScreen('mockup')}>Crear mockup de este producto</button>}
        </aside>
      </div>
    </div>}
    {busy&&<p className="mockup-status" role="status">Procesando…</p>}
    {feedback&&<p className="mockup-status mockup-feedback" role="status">{feedback}</p>}
    {error&&<p className="mockup-status mockup-error" role="alert">{error}</p>}
    {selectedId&&loadedId!==selectedId&&<p className="mockup-status" role="status">Cargando fotografías del producto…</p>}
  </main>
}
