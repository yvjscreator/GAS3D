import { bound, restorePlacement, type Placement, type Point, type ViewName } from './mockupEngine'
import { restoreCalibration, type PhotoCalibration } from './mockupCalibration'
import { restoreGarmentMask } from './mockupMasks'

export type Zone = { id:string; name:string; aspect:number; placement:Placement; polygon?:Point[]; seamMarginCm?:number; clipToZone?:boolean }
export type ProductView = { enabled:boolean; photoName?:string; photoVersion?:string; defaultZoneId?:string; calibration?:PhotoCalibration; silhouette?:Point[]; zones:Zone[] }
export type CloudPhoto = { publicId:string; hash:string }
export type Product = {
  id:string; name:string; type:string; views:Record<ViewName,ProductView>
  cloud?:{ revision:string; fingerprint:string; cloudName:string; deleting?:boolean; photos:Partial<Record<ViewName,CloudPhoto>> }
}
export const VIEWS:ViewName[]=['front','back','left','right','leftSleeve','rightSleeve']
export const LIBRARY_KEY='gas3d.mockup-products.v2'
export const photoKey=(id:string,v:ViewName)=>'mockup-studio:v2:'+id+':'+v+':photo'

/** Read old local catalogues and remote snapshots through the same restoration path. */
export function restoreProducts(raw:unknown):Product[]{
  if(!Array.isArray(raw))return []
  return raw.filter((p):p is Product=>!!p&&typeof p==='object'&&typeof p.id==='string'&&typeof p.name==='string'&&typeof p.views==='object'&&p.views!==null)
    .map(p=>({...p,type:typeof p.type==='string'?p.type:'Remera',views:Object.fromEntries(VIEWS.map(v=>[v,{
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
  return {id:product.id,name:product.name,type:product.type,views:product.views}
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
