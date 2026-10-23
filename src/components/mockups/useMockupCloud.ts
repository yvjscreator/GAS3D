import { notify, useTaskNotice } from '../ui/notifications'
import { requestConfirmation } from '../ui/confirmation'
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { deleteCloudProduct, fetchCloudCatalogue, mergeCloudCatalogue, normalizeConnection, readCloudConnection, rememberCloudConnection, restoredCloudProduct, saveCloudProduct, type CloudConnection } from './mockupCloud'
import { productIsDirty, type Product } from './mockupProduct'

const setMessage=(message:string)=>notify('success',message)
const setIssue=(message:string)=>notify('error',message)

export function useMockupCloud(setProducts:Dispatch<SetStateAction<Product[]>>){
  const [connection,setConnection]=useState<CloudConnection|null>(readCloudConnection)
  const [working,setWorking]=useState(false)
  useTaskNotice(working,'Sincronizando catálogo…')
  const running=useRef(false)
  const perform=useCallback(async<T,>(operation:()=>Promise<T>):Promise<T|undefined>=>{
    if(running.current)return
    running.current=true;setWorking(true);setIssue('')
    try{return await operation()}
    catch(error){setMessage('');setIssue(error instanceof Error?error.message:'No se pudo acceder a Cloudinary. Tus datos locales se conservan.')}
    finally{running.current=false;setWorking(false)}
  },[])
  const connect=useCallback(async(candidate:CloudConnection)=>perform(async()=>{
    const normalized=normalizeConnection(candidate)
    const catalogue=await fetchCloudCatalogue(normalized)
    const ready={...normalized,cloudName:catalogue.cloudName}
    setProducts(local=>mergeCloudCatalogue(local,catalogue))
    rememberCloudConnection(ready);setConnection(ready)
    setMessage(`Conectado a ${catalogue.cloudName}. Catálogo actualizado.`)
    return true
  }),[perform,setProducts])
  useEffect(()=>{
    const saved=readCloudConnection()
    if(saved)void connect(saved)
  },[connect])
  const refresh=()=>connection?connect(connection):Promise.resolve()
  const disconnect=()=>{
    if(running.current)return
    rememberCloudConnection(null);setConnection(null);setIssue('');setMessage('Desconectado. Los productos descargados siguen disponibles en este navegador.')
  }
  const save=(products:Product[])=>perform(async()=>{
    if(!connection)throw new Error('Conectá primero tu catálogo de Cloudinary.')
    let pendingCleanup=false
    for(let index=0;index<products.length;index++){
      const product=products[index]
      const saved=await saveCloudProduct(connection,product),restored=restoredCloudProduct(saved)
      pendingCleanup||=saved.cleanupPending
      // Edits made while the request was running stay dirty against the saved snapshot.
      setProducts(local=>local.map(item=>item.id===product.id?{...item,cloud:restored.cloud}:item))
    }
    setMessage(pendingCleanup?'Producto guardado. Cloudinary dejó fotos anteriores pendientes de limpieza; guardá de nuevo para reintentar.':'Guardado en Cloudinary. Ya podés abrir los productos desde otro dispositivo.')
    return true
  })
  const erase=async(product:Product)=>{
    if(!product.cloud)return
    if(running.current)throw new Error('Esperá a que termine la sincronización.')
    if(!connection)throw new Error('Conectá tu catálogo para eliminar también las fotografías de Cloudinary.')
    running.current=true;setWorking(true);setIssue('')
    try{
      const deleted=await deleteCloudProduct(connection,product)
      if(deleted.cleanupPending){
        setProducts(local=>local.map(item=>item.id===product.id?restoredCloudProduct(deleted):item))
        throw new Error('Cloudinary dejó fotos pendientes de eliminación. Reintentá «Eliminar» para completar el borrado.')
      }
      setMessage('Producto y fotografías eliminados de Cloudinary.')
    }finally{running.current=false;setWorking(false)}
  }
  const recover=(product:Product)=>perform(async()=>{
    if(!connection)throw new Error('Conectá primero tu catálogo.')
    if(productIsDirty(product)&&!await requestConfirmation({title:'Recuperar versión de la nube',description:'Se descartarán los cambios locales de «'+product.name+'» y se recuperará la versión guardada en la nube. Los estampados PNG locales se conservan.',accept:'Recuperar versión',destructive:true}))return
    const catalogue=await fetchCloudCatalogue(connection)
    const record=catalogue.records.find(item=>item.product.id===product.id)
    if(!record)throw new Error('No se encontró el producto en este catálogo.')
    setProducts(local=>record.deleted&&!record.cleanupPending?local.filter(item=>item.id!==product.id)
      :local.map(item=>item.id===product.id?restoredCloudProduct(record):item))
    setMessage('Versión de la nube recuperada.')
  })
  return {connection,working,connect,disconnect,refresh,save,erase,recover}
}
