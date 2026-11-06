import { bound, restorePlacement, type Placement, type Point, type ViewName } from './mockupEngine'
import { restoreCalibration, type PhotoCalibration } from './mockupCalibration'
import { restoreGarmentMask } from './mockupMasks'

export type Zone = { id:string; name:string; aspect:number; placement:Placement; polygon?:Point[]; seamMarginCm?:number; clipToZone?:boolean }
export type PhotoSource = { photoName?:string; photoVersion?:string }
export type ProductView = PhotoSource & { enabled:boolean; defaultZoneId?:string; calibration?:PhotoCalibration; silhouette?:Point[]; zones:Zone[] }
type ProductColor = { id:string; name:string; photos:Partial<Record<ViewName,PhotoSource>> }
export type CloudPhoto = { publicId:string; hash:string }
export type Product = {
  id:string; name:string; type:string; views:Record<ViewName,ProductView>
  baseColorName?:string; colors?:ProductColor[]
  cloud?:{ revision:string; fingerprint:string; cloudName:string; deleting?:boolean; photos:Record<string,CloudPhoto|undefined> }
}
export const VIEWS:ViewName[]=['front','back','left','right','leftSleeve','rightSleeve']
export const LIBRARY_KEY='gas3d.mockup-products.v2'
export const BASE_COLOR='base'
export const MAX_COLORS=12
const COLOR_ID=/^[a-f0-9]{32}$/
export const colorSuffix=(color:string)=>color===BASE_COLOR?'':':color:'+color
export const photoSlot=(view:ViewName,color:string)=>color===BASE_COLOR?view:color+'--'+view
export const photoKey=(id:string,v:ViewName,color=BASE_COLOR)=>'mockup-studio:v2:'+id+':'+v+':photo'+colorSuffix(color)
export const productColors=(p:Product)=>[{id:BASE_COLOR,name:p.baseColorName||'Color base'},...(p.colors??[])]
export const productPhoto=(p:Product,view:ViewName,color:string):PhotoSource|undefined=>
  color===BASE_COLOR?p.views[view]:p.colors?.find(item=>item.id===color)?.photos[view]

export function withProductPhoto(p:Product,view:ViewName,color:string,source:PhotoSource):Product{
  if(color!==BASE_COLOR){
    return {...p,colors:p.colors?.map(item=>{
      if(item.id!==color)return item
      const photos={...item.photos}
      if(source.photoName)photos[view]=source
      else delete photos[view]
      return {...item,photos}
    })}
  }
  const shared=p.colors?.some(item=>item.photos[view]?.photoName)
  const geometry=shared?{}:{calibration:{},silhouette:[]}
  return {...p,views:{...p.views,[view]:{...p.views[view],...geometry,...source}}}
}

function restoreColors(colors:Product['colors']){
  if(!Array.isArray(colors))return undefined
  const ids=new Set<string>()
  const valid=colors.flatMap(color=>{
    if(!color||typeof color.id!=='string'||!COLOR_ID.test(color.id)||ids.has(color.id)||typeof color.name!=='string'||!color.name.trim())return []
    ids.add(color.id)
    const photos:ProductColor['photos']={}
    for(const view of VIEWS){
      const source=color.photos?.[view]
      if(typeof source?.photoName==='string'&&source.photoName)photos[view]={
        photoName:source.photoName,photoVersion:typeof source.photoVersion==='string'?source.photoVersion:undefined,
      }
    }
    return [{id:color.id,name:color.name.trim().slice(0,80),photos}]
  }).slice(0,MAX_COLORS-1)
  return valid.length?valid:undefined
}

/** Read old local catalogues and remote snapshots through the same restoration path. */
export function restoreProducts(raw:unknown):Product[]{
  if(!Array.isArray(raw))return []
  return raw.filter((p):p is Product=>!!p&&typeof p==='object'&&typeof p.id==='string'&&typeof p.name==='string'&&typeof p.views==='object'&&p.views!==null)
    .map(p=>({...p,type:typeof p.type==='string'?p.type:'Remera',
      baseColorName:typeof p.baseColorName==='string'?p.baseColorName.trim().slice(0,80)||undefined:undefined,
      colors:restoreColors(p.colors),views:Object.fromEntries(VIEWS.map(v=>[v,{
      enabled:Boolean(p.views[v]?.enabled),
      photoName:typeof p.views[v]?.photoName==='string'?p.views[v].photoName:undefined,
      photoVersion:typeof p.views[v]?.photoVersion==='string'?p.views[v].photoVersion:undefined,
      defaultZoneId:typeof p.views[v]?.defaultZoneId==='string'?p.views[v].defaultZoneId:undefined,
      calibration:restoreCalibration(p.views[v]?.calibration),
      silhouette:restoreGarmentMask(p.views[v]?.silhouette),
      zones:Array.isArray(p.views[v]?.zones)?p.views[v].zones.filter(z=>z&&typeof z.id==='string').map(z=>({
        id:z.id,name:typeof z.name==='string'?z.name:'Zona',aspect:bound(Number(z.aspect)||1,.15,6),placement:restorePlacement(z.placement,v),
        seamMarginCm:bound(Number(z.seamMarginCm)||0,0,8),clipToZone:z.clipToZone===true,
        polygon:restoreGarmentMask(z.polygon),
      })):[],
    }])) as Product['views']}))
}

export function productSnapshot(product:Product){
  return {id:product.id,name:product.name,type:product.type,views:product.views,baseColorName:product.baseColorName,colors:product.colors}
}
// Stable key order and normalized defaults prevent false conflicts after a reload.
export function productFingerprint(product:Product):string{
  const normalized=productSnapshot(restoreProducts([product])[0])
  const stable=(value:unknown):unknown=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'
    ?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,stable(item)])):value
  return JSON.stringify(stable(normalized))
}
export const productIsDirty=(product:Product)=>!product.cloud||productFingerprint(product)!==product.cloud.fingerprint

export function preferredZone(view:ProductView,selectedId?:string):Zone|undefined{
  return view.zones.find(zone=>zone.id===selectedId)??view.zones.find(zone=>zone.id===view.defaultZoneId)??view.zones[0]
}
