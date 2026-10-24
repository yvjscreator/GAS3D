import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { ArrowDownToLine, Copy, Hand, ImagePlus, Layers2, Maximize2, LogOut, PenTool, Plus, RotateCcw, Ruler, ScanLine, Shirt, Trash2, Upload, ZoomIn, ZoomOut, PanelRight, Scan, HelpCircle } from 'lucide-react'
import { AppLauncher } from '../navigation/AppLauncher'
import { loadMedia, removeMedia, storeMedia, storeMediaMetadata } from '../../utils/mediaStorage'
import { readPngSourceSize, assertStreamedDimensions } from '../images/largeImageExport'
import { artworkOutline, bound, canvasPng, defaultSleeveCurve, ensurePhotoSize, initialPlacement, placementQuad, pointInArtwork, pointInQuad, renderGarmentLayers, restorePlacement, scaleFromCorner, type MockImage, type Placement, type Point, type RenderLayer, type ViewName } from './mockupEngine'
import { pointInPolygon, printInsideSafeAreas, restoreGarmentMask, safeZonePolygon } from './mockupMasks'
import { artworkFitsZone, calibrationLineToSave, fitPrintToZone, photoPixelsPerCm, placementWidthForCm, printDimensionsCm, resizePrintPreservingWarp, withCalibrationReference, zoneDimensionsCm, type CalibrationAxis } from './mockupCalibration'
import { detectGarment, type GarmentDetection } from './garmentDetection'
import { PhotoRulers } from './PhotoRulers'
import { configuredZoneOutline, resizeZoneFromEdge, zoneEdgeHandles, ZONE_EDGE_NAMES, type ZoneGeometry } from './mockupZoneGeometry'
import { LIBRARY_KEY, photoKey, preferredZone, productIsDirty, restoreProducts, VIEWS, type Product, type ProductView, type Zone } from './mockupProduct'
import { loadProductPhoto, type CloudConnection } from './mockupCloud'
import { useMockupCloud } from './useMockupCloud'
import { CloudLibraryPanel } from './CloudLibraryPanel'
import { IconButton, InlineField } from '../ui/primitives'
import { PhotoCalibrationControls } from './PhotoCalibrationControls'
import { notify, useTaskNotice } from '../ui/notifications'
import { requestConfirmation } from '../ui/confirmation'
import { MockupLayers } from './MockupLayers'
import { initialViewModes, type ViewMode } from './mockupWorkspace'
import { penFabricOutline } from './mockupPen'
import './mockupStudio.css'

const setFeedback=(message:string)=>notify('success',message)
const setError=(message:string)=>notify('error',message)

type Models = Record<ViewName,{photo:MockImage|null;arts:Record<string,MockImage>}>
type DraftValue = {placement:Placement;name:string}
type Draft = Partial<Record<ViewName,Record<string,DraftValue>>>
type Screen = 'library'|'setup'|'mockup'
type UploadTarget = {kind:'photo'|'art';view:ViewName;zoneId?:string}
type Drag = {view:ViewName;zoneId:string;pointerId:number;corner:number;edge?:number;originZone?:ZoneGeometry;kind:'move'|'scale'|'warp'|'edge';start:Point;origin:Placement;artSize:{width:number;height:number}}
const LABELS:Record<ViewName,string>={front:'Frente',back:'Espalda',left:'Lateral izquierdo',right:'Lateral derecho',leftSleeve:'Manga izquierda',rightSleeve:'Manga derecha'}
const TYPES=['Remera','Remera oversize','Hoodie','Campera','Gorra','Otro']
const draftKey=(id:string)=>'gas3d.mockup-draft.v2:'+id
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
    return restoreProducts(JSON.parse(localStorage.getItem(LIBRARY_KEY)||'[]'))
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
/** One layer builder for both preview and native-resolution export. */
function viewLayers(config:ProductView,photo:MockImage,arts:Record<string,MockImage>,draft?:Record<string,DraftValue>):RenderLayer[]{
  return config.zones.flatMap(zone=>{
    const art=arts[zone.id]
    if(!art)return []
    const placement=draft?.[zone.id]?.placement??fitPrintToZone(photo,art,zone)
    const clipPolygons:Point[][]=[]
    if(config.silhouette?.length)clipPolygons.push(config.silhouette)
    if(zone.clipToZone)clipPolygons.push(safeZonePolygon(photo,zone.placement,zone.aspect,config.calibration??{},zone.seamMarginCm??0,zone.polygon))
    return [{art,placement,clipPolygons}]
  })
}
function ProductThumbnail({product,connection}:{product:Product;connection:CloudConnection|null}){
  const [url,setUrl]=useState('')
  useEffect(()=>{
    let closed=false
    const selected=VIEWS.find(v=>product.views[v].enabled&&product.views[v].photoName)
    if(!selected){setUrl('');return}
    void loadProductPhoto(product,selected,connection).then(blob=>{
      if(!blob||closed)return
      const next=URL.createObjectURL(blob)
      setUrl(next)
    }).catch(()=>{})
    return ()=>{closed=true}
  },[product,connection])
  useEffect(()=>()=>{if(url)URL.revokeObjectURL(url)},[url])
  return <div className="mockup-product-image">{url?<img src={url} alt="Foto del producto"/>:<Shirt size={36}/>}</div>
}
export function ProductMockupStudio(){
  const [products,setProducts]=useState<Product[]>(readProducts)
  const cloud=useMockupCloud(setProducts)
  const [selectedId,setSelectedId]=useState<string|null>(null)
  const [screen,setScreen]=useState<Screen>('library')
  const [viewModes,setViewModes]=useState(()=>initialViewModes('setup'))
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
  const [calibrationMode,setCalibrationMode]=useState<{view:ViewName;axis:CalibrationAxis;first:Point|null;second?:Point}|null>(null)
  const [measureDraft,setMeasureDraft]=useState<Record<string,string>>({})
  const [maskEditing,setMaskEditing]=useState<ViewName|null>(null)
  const [maskDraft,setMaskDraft]=useState<Point[]>([])
  const [maskClosed,setMaskClosed]=useState(false)
  const [penTarget,setPenTarget]=useState<'fabric'|'zone'>('fabric')
  const [penZoneId,setPenZoneId]=useState('')
  const [selectedNode,setSelectedNode]=useState<number|null>(null)
  const [maskHistory,setMaskHistory]=useState<{points:Point[];closed:boolean}[]>([])
  const [detection,setDetection]=useState<(GarmentDetection & {view:ViewName})|null>(null)
  const [zen,setZen]=useState(false)
  const [zenTool,setZenTool]=useState<'zone'|'pen'|'hand'>('zone')
  const [inspector,setInspector]=useState<'calibration'|'pen'|'zone'|'product'>('zone')
  const [inspectorOpen,setInspectorOpen]=useState(true)
  const [zoom,setZoom]=useState(1)
  const [pan,setPan]=useState<Point>({x:0,y:0})
  const [viewport,setViewport]=useState({width:800,height:600})
  const viewportRef=useRef<HTMLDivElement>(null)
  const studioRef=useRef<HTMLElement>(null)
  const returnFocusRef=useRef<HTMLElement|null>(null)
  const panDragRef=useRef<{pointerId:number;start:Point;origin:Point}|null>(null)
  const spaceRef=useRef(false)
  const maskDragRef=useRef<{view:ViewName;index:number;pointerId:number}|null>(null)
  useTaskNotice(busy,'Procesando…')
  useTaskNotice(!!selectedId&&loadedId!==selectedId,'Cargando fotografías…')
  const inputRef=useRef<HTMLInputElement>(null)
  const targetRef=useRef<UploadTarget>({kind:'photo',view:'front'})
  const canvasRefs=useRef<Partial<Record<ViewName,HTMLCanvasElement|null>>>({})
  const dragRef=useRef<Drag|null>(null)
  const modelsRef=useRef(models)
  useEffect(()=>{modelsRef.current=models},[models])
  useEffect(()=>{setMeasureDraft({});setCalibrationMode(null);setMaskEditing(null);setMaskDraft([]);setDetection(null);setZen(!!selectedId)},[selectedId])
  const product=products.find(p=>p.id===selectedId)
  const enabled=product?VIEWS.filter(v=>product.views[v].enabled):[]
  const current=product?.views[active]
  const selectedZone=current?preferredZone(current,zoneId):undefined
  const selectedArt=selectedZone?models[active].arts[selectedZone.id]:null
  const photo=models[active].photo
  const calibration=current?.calibration??{}
  const photoScale=photo?photoPixelsPerCm(photo,calibration):null
  const zoneCm=photo&&selectedZone?zoneDimensionsCm(photo,selectedZone.placement,selectedZone.aspect,calibration):null
  const currentPrint=photo&&selectedZone&&selectedArt
    ?draft[active]?.[selectedZone.id]?.placement??fitPrintToZone(photo,selectedArt,selectedZone):null
  const printCm=photo&&selectedArt&&currentPrint
    ?printDimensionsCm(photo,selectedArt,currentPrint,calibration):null
  const safeBoundary=photo&&selectedZone
    ?safeZonePolygon(photo,selectedZone.placement,selectedZone.aspect,calibration,selectedZone.seamMarginCm??0,selectedZone.polygon):null
  const printFits=photo&&selectedZone&&selectedArt&&currentPrint
    ?(selectedZone.seamMarginCm||selectedZone.polygon?.length
      ?printInsideSafeAreas(photo,selectedArt,currentPrint,[safeBoundary??[]])
      :artworkFitsZone(photo,selectedArt,currentPrint,selectedZone.placement,selectedZone.aspect)):true
  const fabricFits=photo&&selectedArt&&currentPrint&&current?.silhouette?.length
    ?printInsideSafeAreas(photo,selectedArt,currentPrint,[current.silhouette]):true
  const fittedWidth=photo?Math.max(1,Math.min(viewport.width-32,(viewport.height-32)*photo.width/photo.height)):1
  const fittedHeight=photo?fittedWidth*photo.height/photo.width:1

  useEffect(()=>{
    if(!zen)return
    const target=viewportRef.current
    if(!target)return
    const observer=new ResizeObserver(entries=>{
      const rect=entries[0].contentRect;setViewport({width:rect.width,height:rect.height})
    })
    observer.observe(target)
    return ()=>observer.disconnect()
  },[zen,active,photo])
  useEffect(()=>{
    if(!zen)return
    const overflow=document.body.style.overflow
    document.body.style.overflow='hidden'
    studioRef.current?.querySelector<HTMLButtonElement>('.mockup-zen-exit')?.focus()
    const onKey=(event:KeyboardEvent)=>{
      const editing=event.target instanceof HTMLElement&&!!event.target.closest('input,textarea,select,button,summary,a,[contenteditable=true]')
      if(document.querySelector('.gas-app-launcher-dialog,.gas-confirmation[open]'))return
      if(event.key==='Escape'&&!event.defaultPrevented){
        setInspectorOpen(false);event.preventDefault()
      }
      if(event.code==='Space'&&!editing){spaceRef.current=true;event.preventDefault()}

    }
    const onUp=(event:KeyboardEvent)=>{if(event.code==='Space')spaceRef.current=false}
    const blur=()=>{spaceRef.current=false}
    window.addEventListener('keydown',onKey);window.addEventListener('keyup',onUp);window.addEventListener('blur',blur)
    return ()=>{
      document.body.style.overflow=overflow;spaceRef.current=false
      window.removeEventListener('keydown',onKey);window.removeEventListener('keyup',onUp);window.removeEventListener('blur',blur)
      returnFocusRef.current?.focus()
    }
  },[zen])
  useEffect(()=>{setZoom(1);setPan({x:0,y:0})},[active])
  useEffect(()=>{const panel=studioRef.current?.querySelector('.mockup-properties');if(panel)panel.scrollTop=0},[active,screen,inspector])

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
    if(!selectedId||!product){setLoadedId(null);setModels(blank());setDraft({});return}
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
          const blob=await loadProductPhoto(product,view,cloud.connection)
          if(blob){const asset=await decode(blob,product.views[view].photoName||'Foto', 'photo');opened.push(asset.bitmap);next[view].photo=asset}
        }catch(e){if(!disposed)setError(e instanceof Error?e.message:'No se pudo recuperar una fotografía del producto.')}
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
        const layers=screen==='mockup'
          ?viewLayers(product.views[view],photo,models[view].arts,draft[view]):[]
        try{renderGarmentLayers(canvas,photo,layers,1050)}
        catch(e){setError(e instanceof Error?e.message:'Error al mostrar el mockup.')}
      }
    })
    return ()=>cancelAnimationFrame(frame)
  },[models,draft,product,screen,loadedId,zen,active])

  const updateProduct=(edit:(p:Product)=>Product)=>{
    setProducts(all=>all.map(p=>p.id===selectedId?edit(p):p))
  }
  const updateZone=(view:ViewName,zid:string,edit:(z:Zone)=>Zone)=>{
    updateProduct(p=>({...p,views:{...p.views,[view]:{...p.views[view],zones:p.views[view].zones.map(z=>z.id===zid?edit(z):z)}}}))
  }
  const placementFor=(view:ViewName,zone:Zone)=>{
    const photo=models[view].photo,art=models[view].arts[zone.id]
    return photo&&art?draft[view]?.[zone.id]?.placement??fitPrintToZone(photo,art,zone):zone.placement
  }
  const editPlacement=(view:ViewName,zone:Zone,edit:(p:Placement)=>Placement)=>{
    if(screen==='setup')updateZone(view,zone.id,z=>{
      const placement=edit(z.placement)
      if(!z.polygon?.length)return {...z,placement}
      const ratio=placement.width/z.placement.width
      const polygon=restoreGarmentMask(z.polygon.map(p=>({
        x:placement.x+(p.x-z.placement.x)*ratio,y:placement.y+(p.y-z.placement.y)*ratio,
      })))
      return polygon.length?{...z,placement,polygon}:z
    })
    else setDraft(previous=>({...previous,[view]:{...previous[view],[zone.id]:{
      placement:edit(placementFor(view,zone)),name:previous[view]?.[zone.id]?.name??models[view].arts[zone.id]?.name??'Diseño',
    }}}))
  }
  const openZen=(view:ViewName,showPanel?:boolean)=>{
    if(!zen){
      returnFocusRef.current=document.activeElement instanceof HTMLElement?document.activeElement:null
      setInspectorOpen(showPanel??window.innerWidth>760)
    }
    if(!zen||view!==active){setZoom(1);setPan({x:0,y:0})}
    setActive(view);setZen(true);setGuides(true)
    requestAnimationFrame(()=>{const panel=studioRef.current?.querySelector('.mockup-properties');if(panel)panel.scrollTop=0})
  }
  const beginMask=(view:ViewName,target:'fabric'|'zone'='fabric')=>{
    if(!product)return
    if(maskEditing===view&&penTarget!==target){setInspector('pen');setInspectorOpen(true);setError('Guardá o cancelá el contorno actual antes de cambiar entre silueta y zona.');return}
    if(target==='zone'&&!selectedZone){setError('Añadí una zona de estampado primero.');return}
    if(maskEditing!==view){
      const zone=preferredZone(product.views[view],zoneId)
      const outline=target==='zone'&&zone&&models[view].photo
        ?zone.polygon?.length?zone.polygon:placementQuad(models[view].photo!,zoneSize(zone),zone.placement).map(p=>({x:bound(p.x,0,1),y:bound(p.y,0,1)}))
        :product.views[view].silhouette??[]
      setMaskDraft(outline.map(p=>({...p})));setPenTarget(target);setPenZoneId(zone?.id??'')
      setMaskClosed(Boolean(outline.length));setMaskHistory([]);setSelectedNode(null)
    }
    setMaskEditing(view);setCalibrationMode(null);setZenTool('pen');setInspector('pen');setInspectorOpen(true);setError('');openZen(view)
  }
  const detectPhoto=(image:MockImage,view:ViewName)=>{
    if(maskEditing===view&&penTarget==='zone'){
      setError('Guardá o cancelá la zona que estás trazando antes de detectar la prenda.');return
    }
    try{
      const ratio=Math.min(1,384/Math.max(image.width,image.height)),canvas=document.createElement('canvas')
      canvas.width=Math.max(1,Math.round(image.width*ratio));canvas.height=Math.max(1,Math.round(image.height*ratio))
      const ctx=canvas.getContext('2d',{willReadFrequently:true})
      if(!ctx)throw new Error('No se pudo analizar la fotografía.')
      ctx.drawImage(image.bitmap,0,0,canvas.width,canvas.height)
      const result=detectGarment(ctx.getImageData(0,0,canvas.width,canvas.height),view)
      setDetection({...result,view});setMaskDraft(result.outline);setMaskClosed(true);setMaskHistory([]);setSelectedNode(null)
      setPenTarget('fabric')
      setMaskEditing(view);setCalibrationMode(null);setZenTool('pen');setInspector('pen');setInspectorOpen(true);setError('');openZen(view)
      setFeedback('Contorno detectado. Revisalo con la Pluma y guardalo. La zona sugerida es editable y no identifica costuras.')
    }catch(e){
      notify('info',e instanceof Error?e.message:'No se pudo detectar la prenda. Usá la Pluma.')
    }
  }
  const rememberMask=()=>setMaskHistory(history=>[...history.slice(-29),{points:maskDraft.map(p=>({...p})),closed:maskClosed}])
  const undoMask=()=>{
    const previous=maskHistory[maskHistory.length-1]
    if(!previous)return
    setMaskDraft(previous.points);setMaskClosed(previous.closed);setMaskHistory(history=>history.slice(0,-1));setSelectedNode(null)
  }
  const clearMeasureDraft=(axis:CalibrationAxis)=>setMeasureDraft(old=>{
    const next={...old};delete next[active+':'+axis];return next
  })
  const saveCalibration=(axis:CalibrationAxis,primary:boolean)=>{
    const pending=calibrationMode?.view===active?calibrationMode:null
    const value=measureDraft[active+':'+axis]??calibration[axis]?.cm.toString()??''
    const line=calibrationLineToSave(calibration[axis],pending,axis,value)
    if(!line){setError('Marcá dos puntos y asigná una medida válida entre 0,1 y 500 cm.');return}
    updateProduct(p=>({...p,views:{...p.views,[active]:{...p.views[active],calibration:withCalibrationReference(p.views[active].calibration??{},axis,line,primary)}}}))
    if(pending?.axis===axis)setCalibrationMode(null)
    clearMeasureDraft(axis);setFeedback(primary?'Medida principal guardada. La misma escala se usa en ambas direcciones.':'Comprobación guardada. La escala principal se mantiene.')
  }
  const cancelCalibration=(axis:CalibrationAxis)=>{
    if(calibrationMode?.view===active&&calibrationMode.axis===axis)setCalibrationMode(null)
    clearMeasureDraft(axis)
  }
  const openUpload=(kind:'photo'|'art',view:ViewName,zid?:string)=>{
    if(busy||cloud.working||loadedId!==selectedId)return
    targetRef.current={kind,view,zoneId:zid}
    if(inputRef.current){
      inputRef.current.accept=kind==='art'?'image/png':'image/png,image/jpeg,image/webp'
      inputRef.current.click()
    }
  }
  const onSelect=(event:ChangeEvent<HTMLInputElement>)=>{
    const file=event.currentTarget.files?.[0]
    event.currentTarget.value=''
    if(!file||busy||cloud.working||!selectedId||loadedId!==selectedId)return
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
        const photoVersion=kind==='photo'?uid():undefined
        if(kind==='photo')await storeMediaMetadata(key,{version:photoVersion})
        setModels(old=>({...old,[view]:{
          ...old[view],photo:kind==='photo'?image:old[view].photo,
          arts:kind==='art'?{...old[view].arts,[zid||'']:image}:old[view].arts,
        }}))
        if(kind==='photo'){
          // A replacement photo invalidates previously marked references.
          updateProduct(p=>({...p,views:{...p.views,[view]:{...p.views[view],photoName:file.name,photoVersion,calibration:{},silhouette:[]}}}))
          setMeasureDraft(old=>Object.fromEntries(Object.entries(old).filter(([key])=>!key.startsWith(view+':'))))
          setCalibrationMode(null)
          if(maskEditing===view){setMaskEditing(null);setMaskDraft([]);maskDragRef.current=null}
          setDetection(null)
        }
        else if(zid){
          setDraft(old=>({...old,[view]:{...old[view],[zid]:{
            placement:old[view]?.[zid]?.placement??{
              ...fitPrintToZone(modelsRef.current[view].photo!,image,product!.views[view].zones.find(z=>z.id===zid)!),
              ...(view.endsWith('Sleeve')?{sleeveCurve:defaultSleeveCurve()}:{})
            },
            name:file.name,
          }}}))
        }
        if(kind==='photo')detectPhoto(image,view)
        else setFeedback('Archivo guardado en este navegador.')
      }catch(e){setError(e instanceof Error?e.message:'No se pudo cargar el archivo.')}
      finally{setBusy(false)}
    })()
  }
  const removeAsset=(kind:'photo'|'art',view:ViewName,zid?:string)=>{
    if(!selectedId||busy||cloud.working)return
    const key=kind==='photo'?photoKey(selectedId,view):artKey(selectedId,view,zid||'')
    setModels(old=>({...old,[view]:{
      photo:kind==='photo'?null:old[view].photo,
      arts:kind==='art'?Object.fromEntries(Object.entries(old[view].arts).filter(([id])=>id!==zid)):old[view].arts,
    }}))
    if(kind==='photo'){
      updateProduct(p=>({...p,views:{...p.views,[view]:{...p.views[view],photoName:undefined,photoVersion:undefined,calibration:{},silhouette:[]}}}))
      if(maskEditing===view){setMaskEditing(null);setMaskDraft([]);maskDragRef.current=null}
      setDetection(null)
    }
    void removeMedia(key).catch(()=>setError('No se pudo borrar el archivo del navegador.'))
  }
  const position=(e:ReactPointerEvent<HTMLDivElement>):Point=>{
    const r=e.currentTarget.getBoundingClientRect()
    return {x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height}
  }
  const onPointerDown=(e:ReactPointerEvent<HTMLDivElement>,view:ViewName)=>{
    if(busy||cloud.working||loadedId!==selectedId||!product)return
    if(zen&&(zenTool==='hand'||spaceRef.current||e.button===1)){
      e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId)
      panDragRef.current={pointerId:e.pointerId,start:{x:e.clientX,y:e.clientY},origin:pan};return
    }
    if(e.button!==0)return
    if(screen==='setup'&&maskEditing&&(!zen||zenTool==='pen')){
      if(maskEditing!==view)return
      const p=position(e),r=e.currentTarget.getBoundingClientRect()
      let index=-1,closest=22
      maskDraft.forEach((vertex,i)=>{
        const distance=Math.hypot((vertex.x-p.x)*r.width,(vertex.y-p.y)*r.height)
        if(distance<closest){closest=distance;index=i}
      })
      if(index>=0){
        if(index===0&&maskDraft.length>=3&&!maskClosed){rememberMask();setMaskClosed(true);return}
        rememberMask();setSelectedNode(index)
        maskDragRef.current={view,index,pointerId:e.pointerId}
        e.currentTarget.setPointerCapture(e.pointerId)
      }else if(maskDraft.length<32){
        if(maskClosed){
          let insertion=-1,nearest=16
          for(let i=0;i<maskDraft.length;i++){
            const a=maskDraft[i],b=maskDraft[(i+1)%maskDraft.length]
            const dx=(b.x-a.x)*r.width,dy=(b.y-a.y)*r.height,length=dx*dx+dy*dy
            const t=length?bound(((p.x-a.x)*r.width*dx+(p.y-a.y)*r.height*dy)/length,0,1):0
            const d=Math.hypot((p.x-a.x)*r.width-t*dx,(p.y-a.y)*r.height-t*dy)
            if(d<nearest){insertion=i+1;nearest=d}
          }
          if(insertion>=0){rememberMask();setMaskDraft(points=>[...points.slice(0,insertion),p,...points.slice(insertion)]);setSelectedNode(insertion)}
        }else{
          rememberMask();setMaskDraft(points=>[...points,{x:bound(p.x,0,1),y:bound(p.y,0,1)}]);setSelectedNode(maskDraft.length)
        }
      }
      return
    }
    if(screen==='setup'&&calibrationMode&&calibrationMode.view!==view)return
    if(screen==='setup'&&calibrationMode?.view===view){
      const pointOnPhoto=position(e)
      if(!calibrationMode.first){setCalibrationMode({...calibrationMode,first:pointOnPhoto});return}
      const axis=calibrationMode.axis,first=calibrationMode.first
      const delta=Math.abs(axis==='horizontal'?pointOnPhoto.x-first.x:pointOnPhoto.y-first.y)
      if(delta<.005){setError('Los puntos están demasiado cerca. Volvé a marcar la referencia.');return}
      setCalibrationMode({...calibrationMode,second:pointOnPhoto});setError('')
      setFeedback('Tramo marcado. Revisá su medida en el panel Calibrar.')
      return
    }
    const zone=view===active?selectedZone:product.views[view].zones[0]
    const photo=modelsRef.current[view].photo
    if(!zone||!photo)return
    const art=screen==='setup'?zoneSize(zone):modelsRef.current[view].arts[zone.id]
    if(!art)return
    const placement=screen==='setup'?zone.placement:placementFor(view,zone)
    const p=position(e),quad=placementQuad(photo,art,placement),r=e.currentTarget.getBoundingClientRect()
    let corner=-1,edge=-1,closest=24
    for(let i=0;i<4&&!(screen==='setup'&&zone.polygon?.length);i++){
      const distance=Math.hypot((quad[i].x-p.x)*r.width,(quad[i].y-p.y)*r.height)
      if(distance<closest){corner=i;closest=distance}
    }
    if(screen==='setup'&&guides)zoneEdgeHandles(photo,zone).forEach((point,i)=>{
      const distance=Math.hypot((point.x-p.x)*r.width,(point.y-p.y)*r.height)
      if(distance<Math.min(22,closest)){edge=i;corner=-1;closest=distance}
    })
    if(edge<0&&corner<0&&!(screen==='mockup'?pointInArtwork(p,artworkOutline(photo,art,placement)):
      zone.polygon?.length?pointInPolygon(p,zone.polygon):pointInQuad(p,quad)))return
    e.currentTarget.setPointerCapture(e.pointerId)
    setActive(view);setZoneId(zone.id)
    dragRef.current={view,zoneId:zone.id,pointerId:e.pointerId,corner,edge,originZone:zone,
      kind:edge>=0?'edge':corner<0?'move':(warpMode||e.ctrlKey||e.metaKey?'warp':'scale'),start:p,origin:placement,artSize:art}
  }
  const onPointerMove=(e:ReactPointerEvent<HTMLDivElement>,view:ViewName)=>{
    const panDrag=panDragRef.current
    if(panDrag?.pointerId===e.pointerId){setPan({x:panDrag.origin.x+e.clientX-panDrag.start.x,y:panDrag.origin.y+e.clientY-panDrag.start.y});return}
    const marker=maskDragRef.current
    if(marker&&marker.view===view&&marker.pointerId===e.pointerId&&maskEditing===view){
      const p=position(e)
      setMaskDraft(points=>points.map((point,i)=>
        i===marker.index?{x:bound(p.x,0,1),y:bound(p.y,0,1)}:point))
      return
    }
    const drag=dragRef.current
    if(!drag||drag.pointerId!==e.pointerId||drag.view!==view||!product)return
    const photo=modelsRef.current[view].photo,zone=product.views[view].zones.find(z=>z.id===drag.zoneId)
    if(!photo||!zone)return
    const p=position(e),dx=p.x-drag.start.x,dy=p.y-drag.start.y
    if(drag.kind==='edge'&&drag.originZone&&drag.edge!==undefined){
      const geometry=resizeZoneFromEdge(photo,drag.originZone,drag.edge,{x:dx,y:dy})
      updateZone(view,zone.id,z=>({...z,...geometry}));return
    }
    const next=drag.kind==='move'?{...drag.origin,x:bound(drag.origin.x+dx,-.4,1.4),y:bound(drag.origin.y+dy,-.4,1.4)}:
      drag.kind==='scale'?scaleFromCorner(photo,drag.artSize,drag.origin,drag.corner,p):
      {...drag.origin,corners:drag.origin.corners.map((v,i)=>i===drag.corner?{x:bound(v.x+dx,-.5,.5),y:bound(v.y+dy,-.5,.5)}:v) as Placement['corners']}
    editPlacement(view,zone,()=>next)
  }
  const onPointerEnd=(e:ReactPointerEvent<HTMLDivElement>)=>{
    if(panDragRef.current?.pointerId===e.pointerId)panDragRef.current=null
    if(maskDragRef.current?.pointerId===e.pointerId)maskDragRef.current=null
    if(dragRef.current?.pointerId===e.pointerId)dragRef.current=null
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)
  }
  const saveSilhouette=()=>{
    if(!product||!maskEditing)return
    const outline=restoreGarmentMask(maskDraft)
    if(outline.length<3){setError('El contorno necesita al menos tres puntos sin cruces.');return}
    const view=maskEditing
    if(penTarget==='zone'){
      const xs=outline.map(p=>p.x),ys=outline.map(p=>p.y)
      const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys)
      const image=models[view].photo
      if(!image)return
      updateZone(view,penZoneId,z=>({...z,polygon:outline,clipToZone:true,
        placement:{...z.placement,x:(left+right)/2,y:(top+bottom)/2,width:right-left,rotation:0,corners:initialPlacement(view).corners},
        aspect:(right-left)*image.width/((bottom-top)*image.height),
      }))
    }
    else updateProduct(p=>({...p,views:{...p.views,[view]:{...p.views[view],silhouette:outline}}}))
    setMaskEditing(null);setMaskDraft([]);maskDragRef.current=null
    setSelectedNode(null);setZenTool('zone')
    if(penTarget==='zone')setInspector('zone')
    setError('');setFeedback((penTarget==='zone'?'Contorno de zona guardado; recorte activado en ':'Contorno de la prenda guardado en ')+LABELS[view]+'.')
  }
  const addProduct=()=>{
    if(!newName.trim())return
    const p=makeProduct(newName.trim(),newType)
    setProducts(all=>[...all,p]);openProduct(p,'setup');setInspector('product')
    setNewName('');setFeedback('Producto creado. Ahora configurá sus vistas y zonas de estampado.')
  }
  const duplicate=async(p:Product)=>{
    if(busy||cloud.working)return
    setBusy(true)
    try{
      const copy:Product={...p,id:uid(),cloud:undefined,name:p.name+' (copia)',views:structuredClone(p.views)}
      for(const view of VIEWS){
        const src=await loadProductPhoto(p,view,cloud.connection)
        if(src){
          await storeMedia(photoKey(copy.id,view),src)
          await storeMediaMetadata(photoKey(copy.id,view),{version:p.views[view].photoVersion??null})
        }
      }
      setProducts(all=>[...all,copy]);setFeedback('Producto duplicado con sus fotografías y zonas.')
    }catch{setError('No se pudo duplicar el producto completo.')}
    finally{setBusy(false)}
  }
  const erase=async(p:Product)=>{
    if(busy||cloud.working)return
    if(!await requestConfirmation({title:'Eliminar producto',description:'Se eliminará «'+p.name+'»'+(p.cloud?' y sus fotografías de Cloudinary para todos los dispositivos':'')+'. También se borrarán sus fotos y estampados de este navegador.',accept:'Eliminar producto',destructive:true}))return
    setBusy(true)
    try{
      await cloud.erase(p)
      for(const view of VIEWS){
        await removeMedia(photoKey(p.id,view))
        for(const zone of p.views[view].zones)await removeMedia(artKey(p.id,view,zone.id))
      }
      localStorage.removeItem(draftKey(p.id))
      setProducts(all=>all.filter(item=>item.id!==p.id))
      if(selectedId===p.id){setSelectedId(null);setScreen('library')}
      setFeedback('Producto eliminado.')
    }catch(e){setError(e instanceof Error?e.message:'No se pudo completar la eliminación. Los datos locales se conservan.')}
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
        const layers=viewLayers(product.views[view],photo,models[view].arts,draft[view])
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

  const cancelPen=()=>{
    setMaskEditing(null);setMaskDraft([]);setDetection(null);setZenTool('zone');maskDragRef.current=null;setInspector('zone')
  }
  const canLeavePen=async()=>{
    if(!maskEditing)return true
    if(!await requestConfirmation({title:'Descartar el trazo sin guardar',description:'Los cambios del contorno actual todavía no están guardados. Podés cancelar para seguir editándolo.',accept:'Descartar trazo',destructive:true}))return false
    cancelPen();return true
  }
  const openProduct=(item:Product,mode:ViewMode)=>{
    returnFocusRef.current=document.activeElement instanceof HTMLElement?document.activeElement:null
    setViewModes(initialViewModes(mode));setSelectedId(item.id);setScreen(mode)
    setActive(VIEWS.find(v=>item.views[v].enabled)||'front');setZoneId('');setInspector('zone');setZenTool('zone')
    setInspectorOpen(window.innerWidth>760)
  }
  const selectLayer=async(view:ViewName,mode:ViewMode=viewModes[view])=>{
    if(view===active&&mode===screen)return
    if((view!==active||mode!==screen)&&!await canLeavePen())return
    setActive(view);setScreen(mode);setViewModes(old=>({...old,[view]:mode}));setZoneId('')
    setCalibrationMode(null);setDetection(null);setZenTool('zone');setInspector('zone')
  }
  const leaveEditor=async()=>{
    if(!await canLeavePen())return
    setSelectedId(null);setScreen('library');setZen(false)
  }
  const chooseZoneTool=async()=>{
    if(!await canLeavePen())return
    setZenTool('zone');setInspector('zone');setCalibrationMode(null)
  }

  return <main ref={studioRef} className={'mockup-studio'+(zen?' mockup-zen'+(!inspectorOpen?' is-panel-hidden':''):'')}
    style={zen?{'--mockup-node-radius':600/(fittedWidth*zoom)} as CSSProperties:undefined}
    aria-label={zen?'Editor de mockups':undefined}
    onKeyDown={e=>{
      if(!zen||(e.target instanceof HTMLElement&&e.target.closest('input,textarea,select')))return
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&maskEditing===active){e.preventDefault();undoMask()}
      if(e.key==='Delete'&&maskEditing===active&&selectedNode!==null){
        e.preventDefault();rememberMask();setMaskDraft(points=>points.filter((_,i)=>i!==selectedNode));setSelectedNode(null)
        if(maskDraft.length<=3)setMaskClosed(false)
      }
    }}>
    <input ref={inputRef} className="mockup-file" type="file" onChange={onSelect} aria-label="Seleccionar archivo"/>
    <header className="mockup-header">
      <AppLauncher active="mockups"/>
      <div className="mockup-header-title"><h1>Mockup <span>Studio</span></h1>{!zen&&<p>Biblioteca de productos y estampados reutilizables</p>}</div>
      {zen&&product&&<>
        <strong className="mockup-header-product" title={product.name}>{product.name}</strong>
        <button type="button" className="mockup-nav-button" aria-label={inspectorOpen?'Ocultar panel de controles':'Mostrar panel de controles'} aria-expanded={inspectorOpen} onClick={()=>setInspectorOpen(value=>!value)}><PanelRight size={16}/><span>Panel</span></button>
        <button type="button" className="mockup-nav-button mockup-zen-exit" aria-label="Salir a productos" disabled={busy||cloud.working} onClick={()=>void leaveEditor()}><LogOut size={16}/><span>Salir</span></button>
      </>}
    </header>
    {screen==='library'||!product?<section className="mockup-library">
      <div className="mockup-library-intro"><div><h2>Productos</h2><p>Guardá cada prenda una sola vez. Después creá todos los mockups que necesites, sin volver a cargar las fotos.</p></div><span>{products.length} productos</span></div>
      <CloudLibraryPanel cloud={cloud} pending={products.filter(p=>productIsDirty(p)&&!p.cloud?.deleting).length} disabled={busy} onSave={()=>void cloud.save(products.filter(p=>productIsDirty(p)&&!p.cloud?.deleting))}/>
      <form className="mockup-new-product" onSubmit={e=>{e.preventDefault();addProduct()}}>
        <label>Nombre del producto<input required value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Ej. Remera oversize negra 24/1"/></label>
        <label>Tipo de producto<select value={newType} onChange={e=>setNewType(e.target.value)}>{TYPES.map(t=><option key={t}>{t}</option>)}</select></label>
        <button type="submit" className="mockup-primary"><Plus size={17}/> Crear producto</button>
      </form>
      <div className="mockup-product-grid">
        {products.map(p=><article key={p.id} className="mockup-product-card">
          <ProductThumbnail product={p} connection={cloud.connection}/>
          <div className="mockup-product-info"><small>{p.type} · {VIEWS.filter(v=>p.views[v].enabled).length} vistas</small><h3>{p.name}</h3><span className="mockup-cloud-badge">{p.cloud?.deleting?'Eliminación pendiente':productIsDirty(p)?'Cambios locales sin subir':'Guardado en Cloudinary'}</span></div>
          <div className="mockup-product-actions">
            <button type="button" disabled={busy||cloud.working||p.cloud?.deleting} onClick={()=>openProduct(p,'mockup')}>Nuevo mockup</button>
            <button type="button" disabled={busy||cloud.working||p.cloud?.deleting} onClick={()=>openProduct(p,'setup')}>Editar</button>
            <button type="button" disabled={busy||cloud.working||p.cloud?.deleting} onClick={()=>void duplicate(p)} aria-label={'Duplicar '+p.name}><Copy size={15}/></button>
            <button type="button" disabled={busy||cloud.working} onClick={()=>void erase(p)} aria-label={'Eliminar '+p.name}><Trash2 size={15}/></button>
          </div>
          {cloud.connection&&<div className="mockup-product-cloud-actions">
            <button type="button" className="mockup-nav-button" disabled={busy||cloud.working||p.cloud?.deleting} onClick={()=>void cloud.save([p])}>Guardar en nube</button>
            {p.cloud&&<button type="button" className="mockup-nav-button" disabled={busy||cloud.working} onClick={()=>void cloud.recover(p)}>Recuperar de nube</button>}
          </div>}
        </article>)}
        {!products.length&&<div className="mockup-library-empty"><Shirt size={32}/><strong>Aún no hay productos.</strong><p>Creá el primero para configurar sus fotos, vistas y zonas de estampado.</p></div>}
      </div>
      <p className="mockup-note">Las ediciones se conservan en este navegador. Usá «Guardar en nube» para sincronizar el producto y sus fotos originales. En otro dispositivo, conectá el mismo catálogo y pulsá «Actualizar catálogo».</p>
    </section>:<div className="mockup-editor-shell">
      <div className="mockup-layout">
        <nav className="mockup-tool-rail" role="toolbar" aria-label="Herramientas del lienzo" aria-orientation="vertical">
          <IconButton icon={Maximize2} label={screen==='setup'?'Mover y redimensionar zona':'Mover y escalar estampado'} aria-pressed={zenTool==='zone'&&!calibrationMode} onClick={()=>void chooseZoneTool()}/>
          {screen==='setup'&&<>
            <IconButton icon={PenTool} label="Pluma · zona de estampado" disabled={!photo||busy} aria-pressed={zenTool==='pen'&&penTarget==='zone'} onClick={()=>beginMask(active,'zone')}/>
            <IconButton icon={Shirt} label="Pluma · silueta de la prenda" disabled={!photo||busy} aria-pressed={zenTool==='pen'&&penTarget==='fabric'} onClick={()=>beginMask(active,'fabric')}/>
            <IconButton icon={Ruler} label="Calibrar medidas" disabled={!photo||busy} aria-pressed={inspector==='calibration'} onClick={()=>{
              if(maskEditing){setInspector('pen');setInspectorOpen(true);setError('Guardá o cancelá el trazo antes de calibrar.');return}
              setZenTool('zone');setInspector('calibration');setInspectorOpen(true)
            }}/>
          </>}
          <IconButton icon={Hand} label="Mano · desplazar lienzo" shortcut="Espacio" aria-pressed={zenTool==='hand'} onClick={()=>setZenTool('hand')}/>
          <span className="mockup-tool-divider"/>
          <IconButton icon={ZoomIn} label="Acercar" disabled={zoom>=5} onClick={()=>setZoom(value=>bound(value*1.25,.5,5))}/>
          <IconButton icon={ZoomOut} label="Alejar" disabled={zoom<=.5} onClick={()=>setZoom(value=>bound(value/1.25,.5,5))}/>
          <IconButton icon={Scan} label="Encajar imagen" onClick={()=>{setZoom(1);setPan({x:0,y:0})}}/>
          <output aria-label="Zoom del lienzo">{Math.round(zoom*100)}%</output>
          <details className="mockup-tool-help"><summary aria-label="Ayuda de herramientas"><HelpCircle size={18}/></summary><div>Pluma: arrastrá nodos; tocá un borde para añadir. Cerrá el contorno tocando el primer punto. Ctrl + arrastrar una esquina deforma; sin Ctrl escala. Espacio + arrastrar desplaza. Las guías no se exportan.</div></details>
        </nav>
        <section className="mockup-workspace" aria-label={'Mesa de trabajo · '+LABELS[active]}>
          {maskEditing===active&&<div className="mockup-pen-context" role="group" aria-label="Trazo en edición"><strong>Pluma · {penTarget==='zone'?'Zona de estampado':'Silueta de la prenda'}</strong><span>{maskDraft.length} nodos</span><button type="button" className="mockup-primary" disabled={!maskClosed||restoreGarmentMask(maskDraft).length<3} onClick={saveSilhouette}>{penTarget==='zone'?'Guardar zona':'Guardar silueta'}</button><button type="button" onClick={cancelPen}>Cancelar</button></div>}
          <div className="mockup-view-grid">
            {enabled.filter(v=>v===active).map(view=>{
              const photo=models[view].photo
              const z=view===active?selectedZone:preferredZone(product.views[view])
              const art=z?(screen==='setup'?zoneSize(z):models[view].arts[z.id]):null
              const placement=z?(screen==='setup'?z.placement:placementFor(view,z)):null
              const quad=photo&&art&&placement?placementQuad(photo,art,placement):null
              const outline=photo&&art&&placement&&screen==='mockup'?artworkOutline(photo,art,placement):quad
              const productZone=photo&&z?configuredZoneOutline(photo,z):null
              const editingPen=maskEditing===view
              const editingFabric=editingPen&&penTarget==='fabric'
              const silhouette=penFabricOutline(product.views[view].silhouette??[],maskDraft,penTarget,editingPen)
              const safeGuide=photo&&z&&(z.seamMarginCm??0)>0
                ?safeZonePolygon(photo,z.placement,z.aspect,product.views[view].calibration??{},z.seamMarginCm??0,z.polygon):null
              return <div className={'mockup-view'+(active===view?' is-active':'')} key={view}>
                <div className="mockup-view-title"><strong>{LABELS[view]}</strong><span>{photo?.name||'Sin fotografía'}</span></div>
                {photo?<div className={zen?'mockup-photo-frame':'mockup-photo-frame is-compact'}>
                  {zen&&<PhotoRulers frame={{...viewport,imageWidth:fittedWidth,imageHeight:fittedHeight,photoWidth:photo.width,pan,zoom}} scale={photoScale}/>}
                  <div ref={zen?viewportRef:undefined} className={zen?'mockup-photo-viewport':'mockup-photo-viewport is-compact'}
                    onPointerDown={e=>{if(zen&&e.target===e.currentTarget)onPointerDown(e,view)}}
                    onPointerMove={e=>{if(panDragRef.current&&e.target===e.currentTarget)onPointerMove(e,view)}} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
                  <div className="mockup-stage" style={{aspectRatio:photo.width+'/'+photo.height,
                    ...(zen?{width:fittedWidth,height:fittedHeight,transform:`translate(${pan.x}px, ${pan.y}px) scale(${zoom})`}:{}),
                    cursor:zen&&zenTool==='hand'?'grab':calibrationMode?.view===view||(maskEditing===view&&(!zen||zenTool==='pen'))?'crosshair':undefined}}
                  onPointerDown={e=>onPointerDown(e,view)} onPointerMove={e=>onPointerMove(e,view)} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
                  <canvas ref={node=>{canvasRefs.current[view]=node}} aria-label={'Vista '+LABELS[view]}/>
                  {guides&&productZone&&!(editingPen&&penTarget==='zone')&&<svg className="mockup-product-zone-guides" data-zone-id={z?.id} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    <polygon points={productZone.map(p=>p.x*100+','+p.y*100).join(' ')}/>
                  </svg>}
                  {guides&&quad&&!editingPen&&<svg className="mockup-guides" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    {screen==='mockup'&&<polygon points={(outline??quad).map(p=>p.x*100+','+p.y*100).join(' ')}/>}
                    {!(screen==='setup'&&z?.polygon?.length)&&quad.map((p,i)=><circle key={i} cx={p.x*100} cy={p.y*100} r="1.15"/>)}
                  </svg>}
                  {screen==='setup'&&guides&&z&&!calibrationMode&&!maskEditing&&
                    zoneEdgeHandles(photo,z).map((point,edge)=><button key={edge} type="button"
                      className={'mockup-zone-edge-handle '+(edge%2===0?'is-horizontal':'is-vertical')}
                      aria-label={'Redimensionar zona desde el lado '+ZONE_EDGE_NAMES[edge]}
                      title={'Arrastrá el centro del lado '+ZONE_EDGE_NAMES[edge]+' para ajustar '+(edge%2===0?'el alto':'el ancho')}
                      data-zone-edge={edge}
                      style={{left:point.x*100+'%',top:point.y*100+'%',transform:`translate(-50%, -50%) scale(${zen?1/zoom:1})`}}
                      onKeyDown={e=>{
                        if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return
                        e.preventDefault();e.stopPropagation()
                        const rect=e.currentTarget.closest('.mockup-stage')!.getBoundingClientRect(),step=e.shiftKey?10:1
                        const delta={x:(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0)/rect.width,
                          y:(e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0)/rect.height}
                        updateZone(view,z.id,current=>({...current,...resizeZoneFromEdge(photo,current,edge,delta)}))
                      }}/>) }
                  {guides&&safeGuide&&safeGuide.length>2&&
                    <svg className="mockup-seam-guides" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                      <polygon points={safeGuide.map(p=>p.x*100+','+p.y*100).join(' ')}/>
                    </svg>}
                  {screen==='setup'&&guides&&detection?.view===view&&detection.zone&&<svg className="mockup-suggestion-guides" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    <polygon points={placementQuad(photo,{width:1000,height:1000/detection.zone.aspect},detection.zone.placement).map(p=>p.x*100+','+p.y*100).join(' ')}/>
                  </svg>}
                  {screen==='setup'&&(guides||maskEditing===view)&&silhouette.length>0&&
                    <svg className={'mockup-mask-guides'+(editingFabric?' is-editing':'')} data-pen-target="fabric"
                      viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                      {silhouette.length>=3&&<path fillRule="evenodd"
                        d={'M0 0H100V100H0Z M'+silhouette.map(p=>(p.x*100)+','+(p.y*100)).join(' L')+' Z'}/>}
                      {silhouette.length>=3&&(!editingFabric||maskClosed)&&<polygon points={silhouette.map(p=>p.x*100+','+p.y*100).join(' ')}/>}
                      {editingFabric&&<>
                        {silhouette.length>1&&<polyline points={silhouette.map(p=>p.x*100+','+p.y*100).join(' ')}/>}
                        {silhouette.map((p,i)=><circle key={i} className={i===selectedNode?'is-selected':i===0?'is-start':''} cx={p.x*100} cy={p.y*100} r="1.15"/>)}
                      </>}
                    </svg>}
                  {screen==='setup'&&editingPen&&penTarget==='zone'&&<svg className="mockup-pen-zone-guides mockup-mask-guides is-editing" data-pen-target="zone" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    {maskClosed&&<polygon points={maskDraft.map(p=>p.x*100+','+p.y*100).join(' ')}/>}
                    <polyline points={maskDraft.map(p=>p.x*100+','+p.y*100).join(' ')}/>
                    {maskDraft.map((p,i)=><circle key={i} className={i===selectedNode?'is-selected':i===0?'is-start':''} cx={p.x*100} cy={p.y*100} r="1.15"/>)}
                  </svg>}
                  {screen==='setup'&&(guides||calibrationMode?.view===view)&&<svg className="mockup-calibration-guides" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
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
                    {calibrationMode?.view===view&&calibrationMode.first&&calibrationMode.second&&<g className={calibrationMode.axis==='horizontal'?'horizontal':'vertical'}>
                      <line x1={calibrationMode.first.x*100} y1={calibrationMode.first.y*100} x2={calibrationMode.second.x*100} y2={calibrationMode.second.y*100}/>
                      <circle cx={calibrationMode.second.x*100} cy={calibrationMode.second.y*100} r="1.1"/>
                    </g>}
                  </svg>}
                </div></div></div>:<button type="button" className="mockup-empty" disabled={screen!=='setup'} onClick={()=>openUpload('photo',view)}><Shirt size={32}/><strong>{screen==='setup'?'Añadir fotografía':'Falta configurar la fotografía'}</strong><small>{LABELS[view]}</small></button>}
                <div className="mockup-view-actions">
                  {screen==='setup'?<button type="button" disabled={busy} onClick={()=>openUpload('photo',view)}><ImagePlus size={15}/>{photo?'Cambiar foto':'Añadir foto'}</button>:
                    <button type="button" disabled={busy||!z||!photo} onClick={()=>openUpload('art',view,z?.id)}><Layers2 size={15}/>{z&&models[view].arts[z.id]?'Cambiar PNG':'Añadir PNG'}</button>}
                  {screen==='setup'&&photo&&<button type="button" className="mockup-remove" onClick={()=>removeAsset('photo',view)} aria-label="Quitar foto"><Trash2 size={15}/></button>}
                  {!zen&&photo&&<button type="button" onClick={()=>{setZenTool('zone');setInspector('zone');openZen(view)}}><Maximize2 size={15}/> Editar en grande</button>}
                </div>
              </div>
            })}
          </div>
          {guides&&<div className="mockup-guide-legend" aria-label="Leyenda de las guías"><span className="is-zone">Zona del producto</span>{screen==='mockup'&&<span className="is-art">Estampado PNG</span>}{screen==='setup'&&detection?.zone&&<span className="is-suggestion">Propuesta automática sin añadir</span>}</div>}

        </section>
        <aside className={'mockup-controls'+(zen?' tool-'+zenTool+' inspector-'+inspector+(screen==='setup'?' is-setup':''):'')}>
          <MockupLayers product={product} active={active} modes={viewModes} labels={LABELS} photos={Object.fromEntries(VIEWS.map(view=>[view,models[view].photo])) as Record<ViewName,MockImage|null>} disabled={busy||cloud.working}
            onSelect={view=>void selectLayer(view)} onMode={(view,mode)=>void selectLayer(view,mode)} onManage={()=>{
              if(maskEditing){setInspector('pen');setInspectorOpen(true);setError('Guardá o cancelá el trazo antes de gestionar las vistas.');return}
              setScreen('setup');setViewModes(old=>({...old,[active]:'setup'}));setInspector('product');setInspectorOpen(true)
            }}/>
          <div className="mockup-properties">
          <div className="mockup-properties-heading"><strong>{inspector==='product'?'Producto y vistas':LABELS[active]}</strong><span>{screen==='setup'?'Configuración':'MockUp'}</span></div>
          {screen==='setup'?<>
            <div className="mockup-inspector-tabs" role="group" aria-label="Propiedades de configuración">
              <button type="button" className={inspector==='zone'?'active':''} onClick={()=>{if(maskEditing){setInspector('pen');return}setInspector('zone')}}>Zona</button>
              <button type="button" className={inspector==='pen'?'active':''} onClick={()=>{setInspector('pen')}}>Pluma</button>
              <button type="button" className={inspector==='calibration'?'active':''} disabled={!!maskEditing} onClick={()=>setInspector('calibration')}>Calibrar</button>
            </div>
            <div className="mockup-product-settings">
            <h2>Configuración del producto</h2>
            <label className="mockup-field">Nombre<input value={product.name} onChange={e=>updateProduct(p=>({...p,name:e.target.value}))}/></label>
            <label className="mockup-field">Tipo<select value={product.type} onChange={e=>updateProduct(p=>({...p,type:e.target.value}))}>{TYPES.map(t=><option key={t}>{t}</option>)}</select></label>
            <div className="mockup-divider"/>
            <h3>Vistas disponibles</h3>
            <div className="mockup-views-picker">{VIEWS.map(v=><label key={v}><input type="checkbox" checked={product.views[v].enabled} onChange={e=>{
              const enabledNow=e.target.checked
              if(!enabledNow&&enabled.length<=1){setError('Conservá al menos una vista activa.');return}
              updateProduct(p=>({...p,views:{...p.views,[v]:{...p.views[v],enabled:enabledNow}}}))
              if(enabledNow){setActive(v);setScreen('setup');setViewModes(old=>({...old,[v]:'setup'}));setZoneId('')}else if(v===active){const next=VIEWS.find(k=>k!==v&&product.views[k].enabled)||'front';setActive(next);setScreen('setup');setViewModes(old=>({...old,[next]:'setup'}));setZoneId('')}
              setMaskEditing(null);setMaskDraft([]);setCalibrationMode(null)
            }}/>{LABELS[v]}</label>)}</div>
            </div>
            <div className="mockup-divider"/>
            <PhotoCalibrationControls key={selectedId+':'+active+':'+(current?.photoVersion??'')} calibration={calibration} photo={photo}
              values={{horizontal:measureDraft[active+':horizontal'],vertical:measureDraft[active+':vertical']}}
              pending={calibrationMode?.view===active?calibrationMode:null} disabled={!photo||busy||cloud.working}
              onValue={(axis,value)=>setMeasureDraft(old=>({...old,[active+':'+axis]:value}))}
              onMark={axis=>{setZenTool('zone');setInspector('calibration');setCalibrationMode({view:active,axis,first:null});openZen(active,true)}}
              onSave={saveCalibration} onCancel={cancelCalibration}
              onScaleAxis={axis=>updateProduct(p=>({...p,views:{...p.views,[active]:{...p.views[active],calibration:{...p.views[active].calibration,scaleAxis:axis}}}}))}/>
            <div className="mockup-divider"/>
            <section className="mockup-mask-editor" aria-label="Pluma de silueta o zona">
              <h3>{maskEditing===active&&penTarget==='zone'?'Contorno de zona':'Silueta de la prenda'} · {LABELS[active]}</h3>
              <details className="mockup-control-help"><summary>Cómo usar la Pluma</summary><p>Elegí la silueta de tela o la zona de estampado. Tocá para añadir nodos, arrastrá para moverlos y tocá el primero para cerrar. Guardar aplica el recorte al mockup y conserva el PNG original.</p></details>
              <div className="mockup-pen-targets" role="group" aria-label="Objetivo de la Pluma">
                <button type="button" aria-pressed={maskEditing===active&&penTarget==='zone'} disabled={!photo||busy} aria-label="Zona de estampado" onClick={()=>beginMask(active,'zone')}><PenTool size={16}/> Zona</button>
                <button type="button" aria-pressed={maskEditing===active&&penTarget==='fabric'} disabled={!photo||busy} aria-label="Silueta de la prenda" onClick={()=>beginMask(active,'fabric')}><Shirt size={16}/> Silueta</button>
              </div>
              {!(maskEditing===active&&penTarget==='zone')&&<div className="mockup-mask-buttons">
                <button type="button" disabled={!photo||busy} onClick={()=>{if(photo)detectPhoto(photo,active)}}><ScanLine size={16}/> Detectar prenda</button>
              </div>}
              {maskEditing===active?<div className="mockup-mask-actions">
                <p role="status">{penTarget==='fabric'?'Silueta':current?.zones.find(z=>z.id===penZoneId)?.name??'Zona'} · {maskDraft.length}/32 nodos · {maskClosed?'Cerrado':'Tocá el primer nodo para cerrar'}</p>
                <div className="mockup-mask-buttons">
                  <button type="button" disabled={!maskHistory.length} onClick={undoMask}>Deshacer</button>
                  <button type="button" disabled={selectedNode===null} onClick={()=>{
                    rememberMask();setMaskDraft(points=>points.filter((_,i)=>i!==selectedNode));setSelectedNode(null);if(maskDraft.length<=3)setMaskClosed(false)
                  }}>Eliminar nodo</button>
                  {!maskClosed&&<button type="button" disabled={maskDraft.length<3} onClick={()=>{rememberMask();setMaskClosed(true)}}>Cerrar contorno</button>}
                  <button type="button" onClick={()=>{rememberMask();setMaskDraft([]);setMaskClosed(false);setSelectedNode(null)}}>Nuevo contorno</button>
                  <button type="button" className="mockup-primary" disabled={!maskClosed||restoreGarmentMask(maskDraft).length<3}
                    onClick={saveSilhouette}>{penTarget==='zone'?'Guardar zona':'Guardar contorno'}</button>
                  <button type="button" onClick={cancelPen}>Cancelar</button>
                </div>
                {maskDraft.length>=3&&restoreGarmentMask(maskDraft).length<3&&
                  <p className="mockup-print-warning">El contorno tiene cruces o es demasiado pequeño. Mové los puntos para corregirlo.</p>}
              </div>:<div className="mockup-mask-actions">
                <p>{current?.silhouette?.length?current.silhouette.length+' puntos guardados · recorte activo':'Sin silueta: el estampado puede salir del borde de la tela.'}</p>
                <div className="mockup-mask-buttons">
                  <button type="button" disabled={!photo||busy} onClick={()=>{
                    beginMask(active)
                  }}>{current?.silhouette?.length?'Editar silueta':'Dibujar silueta'}</button>
                  {Boolean(current?.silhouette?.length)&&<button type="button" className="mockup-remove"
                    onClick={()=>updateProduct(p=>({...p,views:{...p.views,[active]:{...p.views[active],silhouette:[]}}}))}>
                    Quitar máscara
                  </button>}
                </div>
              </div>}
            </section>
            {detection?.view===active&&detection.zone&&<section className="mockup-zone-suggestion">
              <h3>Zona central sugerida</h3><p className="mockup-note">El trazo violeta propone un área inicial. Revisá su posición; el color no detecta costuras ni medidas físicas.</p>
              <button type="button" className="mockup-secondary-full" disabled={!!maskEditing} onClick={()=>{
                if(!detection.zone)return
                const zone={...newZone(active,'Zona sugerida'),...detection.zone}
                updateProduct(p=>({...p,views:{...p.views,[active]:{...p.views[active],defaultZoneId:zone.id,zones:[...p.views[active].zones,zone]}}}))
                setZoneId(zone.id);setDetection(null);setZenTool('zone');setInspector('zone')
              }}>Añadir zona sugerida</button>
            </section>}
            <div className="mockup-divider"/>
            <div className="mockup-zone-heading"><h3>Zonas de estampado</h3>
            <button type="button" className="mockup-add-zone" aria-label="Añadir zona" title="Añadir zona de estampado" onClick={()=>{
              const z=newZone(active,'Zona '+(current!.zones.length+1))
              updateProduct(p=>({...p,views:{...p.views,[active]:{...p.views[active],defaultZoneId:z.id,zones:[...p.views[active].zones,z]}}}))
              setZoneId(z.id)
            }}><Plus size={16}/></button></div>
          </>:<details className="mockup-control-help"><summary>Cómo colocar un estampado</summary><p>Elegí una zona y añadí su PNG. Podés usar varios estampados por vista.</p></details>}
          <section className="mockup-zone-inspector">
          <div className="mockup-zone-tabs">{current?.zones.map(z=><button type="button" key={z.id} className={z.id===selectedZone?.id?'active':''} onClick={()=>{
            if(maskEditing){setInspector('pen');setError('Guardá o cancelá el trazo antes de cambiar de zona.');return}
            setZoneId(z.id)
            if(screen==='setup')updateProduct(p=>({...p,views:{...p.views,[active]:{...p.views[active],defaultZoneId:z.id}}}))
          }}>{z.name}</button>)}</div>
          {selectedZone&&<div className="mockup-zone-controls">
            {screen==='setup'?<>
              <InlineField label="Nombre de zona" htmlFor="mockup-zone-name">
                <input id="mockup-zone-name" value={selectedZone.name} onChange={e=>updateZone(active,selectedZone.id,z=>({...z,name:e.target.value}))}/>
                <IconButton icon={PenTool} label="Editar zona con Pluma" title="Editar zona con Pluma" onClick={()=>beginMask(active,'zone')}/>
              </InlineField>
              {Boolean(selectedZone.polygon?.length)&&<div className="mockup-inline-summary"><span>{selectedZone.polygon!.length} nodos · zona personalizada</span>
                <IconButton icon={RotateCcw} label="Volver a zona rectangular" title="Volver a zona rectangular" onClick={()=>updateZone(active,selectedZone.id,z=>({...z,polygon:[]}))}/></div>}
              <label className="mockup-adjustment"><span>Ancho relativo de la zona: {Math.round(selectedZone.placement.width*100)}%</span><input type="range" min="4" max="95" value={Math.round(selectedZone.placement.width*100)} onChange={e=>editPlacement(active,selectedZone,p=>({...p,width:Number(e.target.value)/100}))}/></label>
              {!selectedZone.polygon?.length&&<label className="mockup-adjustment"><span>Proporción (ancho/alto): {selectedZone.aspect.toFixed(2)}</span><input type="range" min="0.25" max="3" step=".05" value={selectedZone.aspect} onChange={e=>updateZone(active,selectedZone.id,z=>({...z,aspect:Number(e.target.value)}))}/></label>}
              {zoneCm&&<p className="mockup-physical-summary">Zona estimada: <strong>{zoneCm.width.toFixed(1)} × {zoneCm.height.toFixed(1)} cm</strong></p>}
              <div className="mockup-seam-settings">
                <label className="mockup-field mockup-field-inline">Margen a costuras (cm)
                  <input type="number" min="0" max="8" step=".1"
                    value={selectedZone.seamMarginCm??0}
                    onChange={e=>updateZone(active,selectedZone.id,z=>({...z,seamMarginCm:bound(Number(e.target.value)||0,0,8)}))}/>
                </label>
                <label className="mockup-option-toggle">
                  <input type="checkbox" checked={Boolean(selectedZone.clipToZone)}
                    onChange={e=>updateZone(active,selectedZone.id,z=>({...z,clipToZone:e.target.checked}))}/>
                  Recortar visualmente el estampado a la zona segura
                </label>
                {!photoScale&&<p className="mockup-note">Calibrá la foto para usar márgenes en cm.</p>}
                {safeBoundary?.length===0&&<p className="mockup-print-warning">
                  El margen no es válido: reducí su tamaño o usá un contorno convexo para aplicar un margen positivo.
                </p>}
              </div>
              <button type="button" className="mockup-danger-action" onClick={()=>{
                if(current!.zones.length<=1){setError('Cada vista debe conservar al menos una zona.');return}
                updateProduct(p=>{
                  const zones=p.views[active].zones.filter(z=>z.id!==selectedZone.id)
                  return {...p,views:{...p.views,[active]:{...p.views[active],zones,defaultZoneId:p.views[active].defaultZoneId===selectedZone.id?zones[0]?.id:p.views[active].defaultZoneId}}}
                })
                void removeMedia(artKey(product.id,active,selectedZone.id)).catch(()=>{})
                setZoneId('')
              }}><Trash2 size={15}/> Eliminar zona</button>
            </>:<>
              <div className="mockup-asset-status"><span>Diseño</span><strong>{selectedArt?.name||'Sin cargar'}</strong></div>
              <details className="mockup-control-help"><summary>Encaje y borradores</summary><p>Las medidas corresponden al PNG plano, antes de deformación manual o curvatura. La referencia elegida en Calibrar define una escala uniforme para reglas y estampados; la calibración conserva la forma original del PNG. Se restaura su borrador local si existe. «Encajar en zona del producto» vuelve a la referencia configurada.</p></details>
              <div className="mockup-upload-actions">
                <button type="button" disabled={busy||!models[active].photo} onClick={()=>openUpload('art',active,selectedZone.id)}><Upload size={15}/> PNG del arte</button>
                <button type="button" disabled={busy||!selectedArt} onClick={()=>removeAsset('art',active,selectedZone.id)}><Trash2 size={15}/> Quitar arte</button>
              </div>
              <label className="mockup-adjustment"><span>Ancho del estampado: {Math.round(placementFor(active,selectedZone).width*100)}%</span><input type="range" min="3" max="95" value={Math.round(placementFor(active,selectedZone).width*100)} disabled={!selectedArt} onChange={e=>editPlacement(active,selectedZone,p=>resizePrintPreservingWarp(p,Number(e.target.value)/100))}/></label>
              {printCm&&selectedArt&&photo&&<div className="mockup-print-centimeters">
                <h3>Tamaño del PNG plano · cm</h3>
                <div className="mockup-cm-inputs">
                  {(['horizontal','vertical'] as const).map(axis=>{
                    const length=axis==='horizontal'?printCm.width:printCm.height
                    return <label className="mockup-field" key={axis}>{axis==='horizontal'?'Ancho':'Alto'}
                      <input key={active+':'+selectedZone.id+':'+axis+':'+length.toFixed(2)}
                        aria-label={axis==='horizontal'?'Ancho (cm)':'Alto (cm)'}
                        type="number" min=".1" max="500" step=".1" defaultValue={length.toFixed(1)}
                        onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}}
                        onBlur={e=>{
                          const input=e.currentTarget.value
                          if(!input.trim())return
                          const newWidth=placementWidthForCm(photo,selectedArt,calibration,axis,Number(input))
                          if(newWidth===null){setError('Ingresá una medida válida de 0,1 a 500 cm.');return}
                          editPlacement(active,selectedZone,p=>resizePrintPreservingWarp(p,newWidth))
                        }}/>
                    </label>
                  })}
                </div>
                <p className="mockup-note">Enter aplica · proporción original del PNG.</p>
              </div>}
              {!printFits&&selectedArt&&<p className="mockup-print-warning" role="status">El estampado excede la zona segura o su margen de costura. Reducilo o movelo.</p>}
              {!fabricFits&&selectedArt&&<p className="mockup-print-warning" role="status">Parte del estampado queda fuera de la silueta de tela y será recortada visualmente en el mockup.</p>}
              {selectedArt&&<section className="mockup-sleeve-controls" aria-label="Adaptación curva para mangas">
                <h3>Adaptación a mangas</h3>
                <details className="mockup-control-help"><summary>Cómo funciona la curvatura</summary><p>Adapta el estampado al volumen de la tela, también en vistas laterales. Los cm se calculan antes de la proyección.</p></details>
                <div className="mockup-sleeve-toggle" role="group" aria-label="Superficie de impresión">
                  <button type="button" className={!placementFor(active,selectedZone).sleeveCurve?.strength?'active':''}
                    aria-pressed={!placementFor(active,selectedZone).sleeveCurve?.strength}
                    onClick={()=>editPlacement(active,selectedZone,p=>({...p,sleeveCurve:undefined}))}>Plano</button>
                  <button type="button" className={placementFor(active,selectedZone).sleeveCurve?.strength?'active':''}
                    aria-pressed={Boolean(placementFor(active,selectedZone).sleeveCurve?.strength)}
                    onClick={()=>editPlacement(active,selectedZone,p=>({...p,sleeveCurve:p.sleeveCurve?.strength?p.sleeveCurve:defaultSleeveCurve()}))}>Manga curva</button>
                </div>
                {placementFor(active,selectedZone).sleeveCurve&&<div className="mockup-sleeve-options">
                  <label className="mockup-adjustment">
                    <span>Intensidad de curvatura: {Math.round(placementFor(active,selectedZone).sleeveCurve?.strength??0)}%</span>
                    <input type="range" min="0" max="100" step="1" value={placementFor(active,selectedZone).sleeveCurve?.strength??0}
                      onChange={e=>editPlacement(active,selectedZone,p=>({...p,sleeveCurve:{...(p.sleeveCurve??defaultSleeveCurve()),strength:Number(e.target.value)}}))}/>
                  </label>
                  <div className="mockup-sleeve-presets" role="group" aria-label="Curvatura predeterminada">
                    {([{label:'Suave',value:25},{label:'Media',value:50},{label:'Fuerte',value:75}] as const).map(preset=>
                      <button type="button" key={preset.value} onClick={()=>editPlacement(active,selectedZone,p=>({...p,sleeveCurve:{...(p.sleeveCurve??defaultSleeveCurve()),strength:preset.value}}))}>
                        {preset.label}
                      </button>)}
                  </div>
                  <label className="mockup-field mockup-field-inline">Orientación
                    <select value={placementFor(active,selectedZone).sleeveCurve?.axis??'vertical'}
                      onChange={e=>editPlacement(active,selectedZone,p=>({...p,sleeveCurve:{...(p.sleeveCurve??defaultSleeveCurve()),axis:e.target.value==='horizontal'?'horizontal':'vertical'}}))}>
                      <option value="vertical">Vertical</option>
                      <option value="horizontal">Horizontal</option>
                    </select>
                  </label>
                  <div className="mockup-sleeve-direction" role="group" aria-label="Dirección de curvatura">
                    {([-1,1] as const).map(direction=>
                      <button type="button" key={direction}
                        className={(placementFor(active,selectedZone).sleeveCurve?.direction??1)===direction?'active':''}
                        aria-pressed={(placementFor(active,selectedZone).sleeveCurve?.direction??1)===direction}
                        onClick={()=>editPlacement(active,selectedZone,p=>({...p,sleeveCurve:{...(p.sleeveCurve??defaultSleeveCurve()),direction}}))}>
                        {(placementFor(active,selectedZone).sleeveCurve?.axis??'vertical')==='vertical'
                          ?(direction===-1?'Curvar a izquierda':'Curvar a derecha')
                          :(direction===-1?'Curvar arriba':'Curvar abajo')}
                      </button>)}
                  </div>
                </div>}
              </section>}
              <label className="mockup-adjustment"><span>Rotación: {placementFor(active,selectedZone).rotation}°</span><input type="range" min="-45" max="45" value={placementFor(active,selectedZone).rotation} disabled={!selectedArt} onChange={e=>editPlacement(active,selectedZone,p=>({...p,rotation:Number(e.target.value)}))}/></label>
              <label className="mockup-adjustment"><span>Luces y sombras: {Math.round(placementFor(active,selectedZone).lighting*100)}%</span><input type="range" min="0" max="100" value={Math.round(placementFor(active,selectedZone).lighting*100)} disabled={!selectedArt} onChange={e=>editPlacement(active,selectedZone,p=>({...p,lighting:Number(e.target.value)/100}))}/></label>
            </>}
            <div className="mockup-controls-row">
              <button type="button" onClick={()=>{
                if(screen==='setup')editPlacement(active,selectedZone,()=>initialPlacement(active))
                else{
                  const photo=models[active].photo,art=models[active].arts[selectedZone.id]
                  if(photo&&art)editPlacement(active,selectedZone,()=>fitPrintToZone(photo,art,selectedZone))
                }
              }}><RotateCcw size={15}/> {screen==='setup'?'Restablecer':'Encajar en zona del producto'}</button>
              <label className="mockup-guides-toggle"><input type="checkbox" checked={guides} onChange={e=>setGuides(e.target.checked)}/> Guías</label>
            </div>
          </div>}
          <div className="mockup-divider"/>
          <div className="mockup-mode-toggle" role="group" aria-label="Modo de esquinas">
            <button type="button" className={!warpMode?'active':''} onClick={()=>setWarpMode(false)}>Escalar</button>
            <button type="button" className={warpMode?'active':''} onClick={()=>setWarpMode(true)}>Deformar</button>
          </div>
          <p className="mockup-note">{photoScale?'Escala estimada a partir de referencias marcadas en esta fotografía.':'Sin calibrar: las medidas de esta vista son relativas a la fotografía.'}</p>
          {screen==='setup'&&<button type="button" className="mockup-primary mockup-secondary-full" onClick={()=>void selectLayer(active,'mockup')}>Crear mockup de este producto</button>}
          </section>
          </div>
          {screen==='mockup'&&<div className="mockup-export-actions">
            <button type="button" disabled={busy||!models[active].photo} onClick={()=>void exportMockup(false)}><ArrowDownToLine size={16}/> Exportar {LABELS[active]}</button>
            <button type="button" className="mockup-primary" disabled={busy||loadedId!==selectedId||!enabled.some(v=>models[v].photo)} onClick={()=>void exportMockup(true)}><ArrowDownToLine size={16}/> Exportar todas las vistas</button>
          </div>}
          {screen==='setup'&&<div className="mockup-save-product"><small>{productIsDirty(product)?'Cambios guardados en este navegador':'Producto sincronizado'}</small><button type="button" className="mockup-primary mockup-secondary-full" disabled={busy||cloud.working||!!maskEditing||!cloud.connection||product.cloud?.deleting} onClick={()=>void cloud.save([product])}>{cloud.working?'Guardando…':'Guardar en nube'}</button></div>}
        </aside>
      </div>
    </div>}
  </main>
}
