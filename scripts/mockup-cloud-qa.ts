import assert from 'node:assert/strict'
import { initialPlacement } from '../src/components/mockups/mockupEngine'
import { preferredZone, productFingerprint, productIsDirty, restoreProducts, VIEWS, type Product } from '../src/components/mockups/mockupProduct'
import { deleteCloudProduct, fetchCloudCatalogue, mergeCloudCatalogue, normalizeConnection, restoredCloudProduct, saveCloudProduct, type CloudRecord } from '../src/components/mockups/mockupCloud'

const local:Product={id:'test-product',name:'Remera',type:'Remera',views:Object.fromEntries(VIEWS.map(view=>[view,{
  enabled:view==='front',zones:[{id:'print-zone',name:'Zona',aspect:1,placement:initialPlacement(view)}],
}])) as Product['views']}
local.views.front.calibration={
  horizontal:{from:{x:.2,y:.4},to:{x:.8,y:.4},cm:54},
  vertical:{from:{x:.5,y:.2},to:{x:.5,y:.9},cm:70},scaleAxis:'horizontal',
}
const record:CloudRecord={product:structuredClone(local),revision:'first',cloudName:'test-cloud',photos:{},deleted:false,cleanupPending:false}
const remote=restoredCloudProduct(record)
assert.equal(remote.views.front.calibration?.scaleAxis,'horizontal','Cloud restoration must retain the selected uniform scale reference')
assert.equal(remote.views.front.calibration?.vertical?.cm,70,'Choosing one scale must preserve the other saved reference')
const secondZone={...local.views.front.zones[0],id:'suggested-zone',name:'Zona sugerida'}
const configuredView={...local.views.front,defaultZoneId:secondZone.id,zones:[...local.views.front.zones,secondZone]}
assert.equal(preferredZone(configuredView)?.id,secondZone.id,'Opening a new mockup must use the configured zone rather than always the first zone')
assert.equal(preferredZone(configuredView,'print-zone')?.id,'print-zone','Explicit mockup selection must remain independent of the product preference')
assert.equal(preferredZone({...configuredView,defaultZoneId:'removed'})?.id,'print-zone','Older products and removed defaults must fall back safely')
assert.equal(restoredCloudProduct({...record,product:{...local,views:{...local.views,front:configuredView}}}).views.front.defaultZoneId,secondZone.id,'The preferred zone must survive cloud synchronization')
assert.equal(productIsDirty(local),true,'Existing local products must be explicitly uploaded')
assert.equal(productIsDirty(remote),false,'A downloaded snapshot must start clean')
assert.equal(productFingerprint(remote),productFingerprint(restoreProducts([JSON.parse(JSON.stringify(remote))])[0]),'Reloading defaults cannot create false unsaved changes')
const edited={...remote,name:'Edición sin conexión'}
assert.equal(productIsDirty(edited),true)
const updated={...record,revision:'second',product:{...local,name:'Edición de otro dispositivo'}}
assert.deepEqual(mergeCloudCatalogue([edited],{cloudName:'test-cloud',records:[updated]})[0],edited,'Refresh must preserve offline edits and their stale revision for conflict detection')
assert.equal(mergeCloudCatalogue([remote],{cloudName:'test-cloud',records:[updated]})[0].name,updated.product.name,'Clean products must update from another device')
assert.equal(mergeCloudCatalogue([],{cloudName:'test-cloud',records:[record]})[0].id,local.id,'A new device must discover saved products')
assert.equal(mergeCloudCatalogue([local],{cloudName:'test-cloud',records:[]}).length,1,'Connecting must not erase local products')
assert.deepEqual(mergeCloudCatalogue([remote],{cloudName:'test-cloud',records:[{...record,deleted:true}]}),[],'A remote deletion must remove a clean cached product')
assert.deepEqual(mergeCloudCatalogue([edited],{cloudName:'test-cloud',records:[{...record,deleted:true}]}),[edited],'Deleted remote snapshots must not discard offline work')
assert.equal(mergeCloudCatalogue([],{cloudName:'test-cloud',records:[{...record,deleted:true,cleanupPending:true}]})[0].cloud?.deleting,true,'Incomplete photo deletion must remain retryable on another device')
assert.equal(mergeCloudCatalogue([remote],{cloudName:'other-cloud',records:[{...record,cloudName:'other-cloud'}]})[0].cloud?.cloudName,'test-cloud','Connecting another account cannot silently rebind existing products')
assert.equal(normalizeConnection({url:'https://example.com/',token:' clave '}).url,'https://example.com')
for(const url of ['https://user:secret@example.com','http://example.com','https://example.com/?token=secret'])assert.throws(()=>normalizeConnection({url,token:'clave'}),'Credentials must use a secure clean server origin')

const nativeFetch=globalThis.fetch
const requests:{url:string;options:RequestInit}[]=[]
const connection={url:'https://catalogue.example',token:'private-test-access',cloudName:'test-cloud'}
try{
  globalThis.fetch=async(input,options={})=>{
    requests.push({url:String(input),options})
    return new Response(JSON.stringify(String(input).endsWith('/products')?{cloudName:'test-cloud',records:[record]}:record),{status:200,headers:{'Content-Type':'application/json'}})
  }
  await fetchCloudCatalogue(connection)
  await saveCloudProduct(connection,remote)
  await deleteCloudProduct(connection,remote)
  assert.ok(requests.every(request=>(request.options.headers as Record<string,string>).Authorization==='Bearer private-test-access'),'Every catalogue operation must authenticate')
  assert.ok(requests.every(request=>!request.url.includes('private-test-access')),'Never put access credentials in query strings')
  const form=requests[1].options.body as FormData
  assert.equal(form.get('revision'),'first','Updates must submit the last known remote revision')
  assert.equal(JSON.parse(String(form.get('product'))).cloud,undefined,'The server snapshot must not contain client sync settings')
  assert.equal(requests[2].options.method,'DELETE')
  assert.equal((requests[2].options.headers as Record<string,string>)['X-Product-Revision'],'first','Deletes must check the product revision too')
  globalThis.fetch=async()=>new Response(JSON.stringify({detail:'Otro dispositivo modificó este producto.'}),{status:409})
  await assert.rejects(()=>saveCloudProduct(connection,remote),/Otro dispositivo/)
  await assert.rejects(()=>saveCloudProduct({...connection,cloudName:'other-cloud'},remote),/otra cuenta/)
}finally{globalThis.fetch=nativeFetch}
console.log('Mockup cloud QA passed: restoration, offline edits, tombstones, account isolation, authentication and request contract.')
