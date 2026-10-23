import { loadMedia, loadMediaMetadata, storeMedia, storeMediaMetadata } from '../../utils/mediaStorage'
import type { ViewName } from './mockupEngine'
import { photoKey, productFingerprint, productIsDirty, productSnapshot, restoreProducts, VIEWS, type CloudPhoto, type Product } from './mockupProduct'

export type CloudConnection = { url:string; token:string; cloudName?:string }
export type CloudRecord = { product:Product; revision:string; cloudName:string; photos:Partial<Record<ViewName,CloudPhoto>>; deleted:boolean; cleanupPending:boolean }
export type CloudCatalogue = { cloudName:string; records:CloudRecord[] }
const CONNECTION_KEY='gas3d.mockup-cloud.session.v1'
export const defaultCloudUrl=()=>String(import.meta.env.VITE_MOCKUP_API_URL??import.meta.env.VITE_SUBTITLE_API_URL??'').replace(/\/$/,'')
export function readCloudConnection():CloudConnection|null{
  try{
    const value=JSON.parse(sessionStorage.getItem(CONNECTION_KEY)??'null') as CloudConnection|null
    return value&&typeof value.url==='string'&&typeof value.token==='string'?value:null
  }catch{return null}
}
export function rememberCloudConnection(connection:CloudConnection|null){
  try{if(connection)sessionStorage.setItem(CONNECTION_KEY,JSON.stringify(connection));else sessionStorage.removeItem(CONNECTION_KEY)}catch{/* Session memory still works. */}
}
export function normalizeConnection(connection:CloudConnection):CloudConnection{
  const url=connection.url.trim().replace(/\/$/,'')
  if(url){
    const parsed=new URL(url)
    if(parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=='/'
      ||(parsed.protocol!=='https:'&&!(parsed.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)))){
      throw new Error('Usá la URL HTTPS del servidor de GAS3D (o localhost en desarrollo).')
    }
  }
  if(!connection.token.trim())throw new Error('Ingresá la clave privada del catálogo.')
  return {...connection,url,token:connection.token.trim()}
}
async function cloudRequest(connection:CloudConnection,path:string,options:RequestInit={}):Promise<Response>{
  const response=await fetch(`${connection.url}/api/mockups${path}`,{
    ...options,cache:'no-store',signal:AbortSignal.timeout(300_000),
    headers:{...options.headers,Authorization:`Bearer ${connection.token}`},
  })
  if(!response.ok){
    const body=await response.json().catch(()=>null) as {detail?:unknown}|null
    throw new Error(typeof body?.detail==='string'?body.detail:response.status===404?'El servidor no tiene habilitado el catálogo de Cloudinary.':`No se pudo acceder al catálogo (${response.status}).`)
  }
  return response
}
export async function fetchCloudCatalogue(connection:CloudConnection):Promise<CloudCatalogue>{
  return (await cloudRequest(connection,'/products')).json() as Promise<CloudCatalogue>
}
export function restoredCloudProduct(record:CloudRecord):Product{
  const product=restoreProducts([record.product])[0]
  if(!product||!record.revision||!record.cloudName)throw new Error('El catálogo remoto contiene un producto inválido.')
  return {...product,cloud:{revision:record.revision,fingerprint:productFingerprint(product),cloudName:record.cloudName,photos:record.photos,deleting:record.deleted}}
}
/** Merge clean snapshots only. Offline edits never silently overwrite another device. */
export function mergeCloudCatalogue(local:Product[],catalogue:CloudCatalogue):Product[]{
  const remote=new Map(catalogue.records.map(record=>[record.product.id,record]))
  const merged=local.flatMap(product=>{
    const record=remote.get(product.id)
    remote.delete(product.id)
    if(!record||!product.cloud||product.cloud.cloudName!==catalogue.cloudName||productIsDirty(product))return [product]
    return record.deleted&&!record.cleanupPending?[]:[restoredCloudProduct(record)]
  })
  for(const record of remote.values())if(!record.deleted||record.cleanupPending)merged.push(restoredCloudProduct(record))
  return merged
}
export async function loadProductPhoto(product:Product,view:ViewName,connection:CloudConnection|null):Promise<Blob|null>{
  if(!product.views[view].photoName)return null
  const key=photoKey(product.id,view),blob=await loadMedia(key)
  const metadata=await loadMediaMetadata<{version:string|null}>(key)
  const photo=product.cloud?.photos[view]
  if(blob&&(!photo||(metadata?.version??null)===(product.views[view].photoVersion??null)))return blob
  if(!photo)throw new Error('Falta una fotografía original del producto en este navegador.')
  if(!connection||connection.cloudName!==product.cloud?.cloudName)throw new Error('Conectá tu catálogo para descargar las fotografías de este producto.')
  const response=await cloudRequest(connection,`/products/${encodeURIComponent(product.id)}/photos/${view}?digest=${photo.hash}`)
  const original=await response.blob()
  await storeMedia(key,original)
  await storeMediaMetadata(key,{version:product.views[view].photoVersion??null})
  return original
}
export async function saveCloudProduct(connection:CloudConnection,product:Product):Promise<CloudRecord>{
  if(product.cloud&&product.cloud.cloudName!==connection.cloudName)throw new Error('Este producto pertenece a otra cuenta de Cloudinary. Duplicalo para guardarlo en esta cuenta.')
  const body=new FormData(),photoViews:ViewName[]=[]
  body.set('product',JSON.stringify(productSnapshot(product)))
  body.set('revision',product.cloud?.revision??'')
  for(const view of VIEWS){
    if(!product.views[view].photoName)continue
    const blob=await loadProductPhoto(product,view,connection)
    if(!blob)throw new Error('Faltan fotografías originales; no se guardó un producto incompleto.')
    photoViews.push(view);body.append('photos',blob,product.views[view].photoName)
  }
  body.set('photo_views',JSON.stringify(photoViews))
  return (await cloudRequest(connection,`/products/${encodeURIComponent(product.id)}`,{method:'PUT',body})).json() as Promise<CloudRecord>
}
export async function deleteCloudProduct(connection:CloudConnection,product:Product):Promise<CloudRecord>{
  if(!product.cloud||product.cloud.cloudName!==connection.cloudName)throw new Error('Conectá el catálogo original antes de eliminar este producto de la nube.')
  return (await cloudRequest(connection,`/products/${encodeURIComponent(product.id)}`,{
    method:'DELETE',headers:{'X-Product-Revision':product.cloud.revision},
  })).json() as Promise<CloudRecord>
}
