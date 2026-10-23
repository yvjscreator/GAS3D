import { useState } from 'react'
import { Cloud, RefreshCw, Upload } from 'lucide-react'
import { defaultCloudUrl, type CloudConnection } from './mockupCloud'
import type { useMockupCloud } from './useMockupCloud'

export function CloudLibraryPanel({cloud,pending,disabled,onSave}:{
  cloud:ReturnType<typeof useMockupCloud>;pending:number;disabled:boolean;onSave:()=>void
}){
  const [url,setUrl]=useState(()=>cloud.connection?.url??defaultCloudUrl())
  const [token,setToken]=useState('')
  const unavailable=disabled||cloud.working
  const connect=(connection:CloudConnection)=>{void cloud.connect(connection).then(connected=>{if(connected)setToken('')})}
  return <section className="mockup-cloud-panel" aria-label="Catálogo de Cloudinary">
    <div className="mockup-cloud-heading"><Cloud size={21}/><div><h3>Catálogo en Cloudinary</h3><p>{cloud.connection
      ?`Cuenta: ${cloud.connection.cloudName??'conectando…'}. ${pending} productos con cambios sin subir.`
      :'Conectá tu catálogo para abrir tus productos desde cualquier dispositivo.'}</p></div></div>
    {cloud.connection?<div className="mockup-cloud-actions">
      <button type="button" className="mockup-nav-button" disabled={unavailable} onClick={()=>void cloud.refresh()}><RefreshCw size={16}/> Actualizar catálogo</button>
      <button type="button" className="mockup-nav-button mockup-primary" disabled={unavailable||!pending} onClick={onSave}><Upload size={16}/> Subir pendientes ({pending})</button>
      <button type="button" className="mockup-nav-button" disabled={unavailable} onClick={cloud.disconnect}>Desconectar</button>
    </div>:<form className="mockup-cloud-connect" onSubmit={event=>{event.preventDefault();connect({url,token})}}>
      <label className="mockup-field">Servidor del catálogo<input type="url" value={url} onChange={event=>setUrl(event.target.value)} placeholder="https://gas3d-subtitle-api.onrender.com"/></label>
      <label className="mockup-field">Clave privada del catálogo<input type="password" required autoComplete="current-password" value={token} onChange={event=>setToken(event.target.value)} placeholder="Tu clave de acceso"/></label>
      <button type="submit" className="mockup-nav-button mockup-primary" disabled={unavailable}>Conectar catálogo</button>
    </form>}
    <p className="mockup-note">Se sincronizan las fotos originales, vistas, zonas y calibraciones al guardar en nube. Los estampados PNG y sus borradores siguen en este dispositivo. La conexión se recuerda durante esta sesión.</p>
  </section>
}
