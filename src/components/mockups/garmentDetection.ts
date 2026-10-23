import { type Point, type Placement, initialPlacement } from './mockupEngine'
import { outlineInsidePolygon, pointInPolygon, restoreGarmentMask } from './mockupMasks'

export type GarmentDetection = { outline: Point[]; zone: { placement: Placement; aspect: number } | null }
type Raster = { width: number; height: number; data: ArrayLike<number> }
const distance = (a: number[], b: number[]) => Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2])
const median = (values: number[]) => values.sort((a,b)=>a-b)[Math.floor(values.length/2)]
const signedArea = (p: Point[]) => p.reduce((a,v,i)=>{const n=p[(i+1)%p.length];return a+v.x*n.y-n.x*v.y},0)/2

function simplifyLine(points: Point[], tolerance: number): Point[] {
  if(points.length<3)return points
  const a=points[0],b=points[points.length-1],dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy
  let greatest=0,index=0
  for(let i=1;i<points.length-1;i++){
    const p=points[i],t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0
    const d=Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)
    if(d>greatest){greatest=d;index=i}
  }
  return greatest>tolerance
    ?[...simplifyLine(points.slice(0,index+1),tolerance).slice(0,-1),...simplifyLine(points.slice(index),tolerance)]
    :[a,b]
}

/** Trace cell edges in order, keeping sleeve/armpit concavities instead of a convex hull. */
function traceOutline(mask: Uint8Array, width: number, height: number): Point[] {
  type Edge = { x: number; y: number; nx: number; ny: number; direction: number; used: boolean }
  const edges: Edge[]=[],outgoing=new Map<number,Edge[]>()
  const add=(x:number,y:number,nx:number,ny:number,direction:number)=>{
    const edge={x,y,nx,ny,direction,used:false},key=y*(width+1)+x
    edges.push(edge);outgoing.set(key,[...(outgoing.get(key)??[]),edge])
  }
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    if(!mask[y*width+x])continue
    if(y===0||!mask[(y-1)*width+x])add(x,y,x+1,y,0)
    if(x===width-1||!mask[y*width+x+1])add(x+1,y,x+1,y+1,1)
    if(y===height-1||!mask[(y+1)*width+x])add(x+1,y+1,x,y+1,2)
    if(x===0||!mask[y*width+x-1])add(x,y+1,x,y,3)
  }
  let largest:Point[]=[]
  for(const first of edges){
    if(first.used)continue
    const loop:Point[]=[]
    let edge:Edge|undefined=first
    while(edge&&!edge.used){
      edge.used=true;loop.push({x:edge.x/width,y:edge.y/height})
      if(edge.nx===first.x&&edge.ny===first.y)break
      const previousDirection:number=edge.direction
      const options:Edge[]=(outgoing.get(edge.ny*(width+1)+edge.nx)??[]).filter(e=>!e.used)
      // At diagonal pixel contacts keep the fabric on the right side of the path.
      edge=options.sort((a,b):number=>{
        const rank=(d:number):number=>[1,0,3,2][(d-previousDirection+4)%4]
        return rank(a.direction)-rank(b.direction)
      })[0]
    }
    if(Math.abs(signedArea(loop))>Math.abs(signedArea(largest)))largest=loop
  }
  if(largest.length<3)return []
  let split=1
  for(let i=2;i<largest.length;i++)if(Math.hypot(largest[i].x-largest[0].x,largest[i].y-largest[0].y)>
    Math.hypot(largest[split].x-largest[0].x,largest[split].y-largest[0].y))split=i
  for(let tolerance=.003;tolerance<=.04;tolerance*=1.35){
    const result=[...simplifyLine(largest.slice(0,split+1),tolerance).slice(0,-1),
      ...simplifyLine([...largest.slice(split),largest[0]],tolerance).slice(0,-1)]
    const valid=restoreGarmentMask(result)
    if(valid.length)return valid
  }
  return []
}

/** Conservative central rectangle, never presented as automatic seam recognition. */
export function suggestPrintZone(outline: Point[], photo: {width:number;height:number}, view: string) {
  if(outline.length<3)return null
  const xs=outline.map(p=>p.x),ys=outline.map(p=>p.y)
  const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys)
  const y1=top+(bottom-top)*(view.endsWith('Sleeve')?.20:.28),y2=bottom-(bottom-top)*.14
  let x1=left,x2=right
  const center=(left+right)/2
  for(let row=0;row<=32;row++){
    const y=y1+(y2-y1)*row/32
    if(!pointInPolygon({x:center,y},outline))return null
    let lo=center,hi=center
    const step=(right-left)/160
    while(lo-step>left&&pointInPolygon({x:lo-step,y},outline))lo-=step
    while(hi+step<right&&pointInPolygon({x:hi+step,y},outline))hi+=step
    x1=Math.max(x1,lo);x2=Math.min(x2,hi)
  }
  const cx=(x1+x2)/2,cy=(y1+y2)/2
  for(let factor=.8;factor>=.35;factor-=.1){
    const w=(x2-x1)*factor,h=(y2-y1)*factor
    if(w<.025||h<.025)continue
    const rect=[{x:cx-w/2,y:cy-h/2},{x:cx+w/2,y:cy-h/2},{x:cx+w/2,y:cy+h/2},{x:cx-w/2,y:cy+h/2}]
    if(outlineInsidePolygon(rect,outline))return {
      placement:{...initialPlacement(view),x:cx,y:cy,width:w},aspect:w*photo.width/(h*photo.height),
    }
  }
  return null
}

/** Bounded browser-local color segmentation. Never reads or changes source artwork. */
export function detectGarment(raster: Raster, view='front'): GarmentDetection {
  const {width,height,data}=raster,total=width*height
  if(width<16||height<16||total>600_000||data.length<total*4)throw new Error('No se pudo analizar esta fotografía.')
  const border:number[][]=[]
  const sample=(x:number,y:number)=>{const i=(y*width+x)*4;border.push([data[i],data[i+1],data[i+2],data[i+3]])}
  const step=Math.max(1,Math.floor(Math.min(width,height)/80))
  for(let x=0;x<width;x+=step){sample(x,0);sample(x,height-1)}
  for(let y=0;y<height;y+=step){sample(0,y);sample(width-1,y)}
  const transparent=border.filter(p=>p[3]<32).length/border.length>.65
  const opaque=border.filter(p=>p[3]>=32)
  const background=opaque.length?[0,1,2].map(c=>median(opaque.map(p=>p[c]))):[255,255,255]
  if(!transparent&&border.filter(p=>distance(p,background)<55).length/border.length<.72)
    throw new Error('El fondo tiene demasiadas variaciones. Usá la Pluma para marcar la silueta.')
  const candidate=new Uint8Array(total)
  for(let i=0;i<total;i++){
    const offset=i*4
    candidate[i]=data[offset+3]>=40&&(transparent||distance([data[offset],data[offset+1],data[offset+2]],background)>55)?1:0
  }
  // Largest 4-connected subject discards detached shadows, specks and background marks.
  const seen=new Uint8Array(total),queue=new Int32Array(total)
  let largest:Int32Array=new Int32Array(0)
  for(let start=0;start<total;start++){
    if(!candidate[start]||seen[start])continue
    let head=0,tail=1;queue[0]=start;seen[start]=1
    while(head<tail){
      const i=queue[head++],x=i%width,y=Math.floor(i/width)
      for(const next of [x?i-1:-1,x<width-1?i+1:-1,y?i-width:-1,y<height-1?i+width:-1]){
        if(next>=0&&candidate[next]&&!seen[next]){seen[next]=1;queue[tail++]=next}
      }
    }
    if(tail>largest.length)largest=queue.slice(0,tail)
  }
  if(largest.length<total*.04||largest.length>total*.94)
    throw new Error('No hay suficiente contraste entre la prenda y el fondo. Podés dibujar el contorno con la Pluma.')
  const mask=new Uint8Array(total)
  for(const i of largest)mask[i]=1
  const outline=traceOutline(mask,width,height)
  if(!outline.length)throw new Error('No se encontró un contorno fiable. Ajustalo manualmente con la Pluma.')
  return {outline,zone:suggestPrintZone(outline,{width,height},view)}
}
