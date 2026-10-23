/** Deterministic, browser-local garment-photo compositor. */
/** Named garment angles are extensible; each product owns its supported views. */
export type ViewName = string
export type Point = { x: number; y: number }
export type Quad = [Point, Point, Point, Point]
/** Optional non-destructive cylinder projection used for sleeve artwork. */
export type SleeveCurve = { strength: number; axis: 'horizontal' | 'vertical'; direction: -1 | 1 }
export const defaultSleeveCurve = (): SleeveCurve => ({ strength: 28, axis: 'vertical', direction: 1 })
export function restoreSleeveCurve(raw: unknown): SleeveCurve | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const source = raw as Partial<SleeveCurve>
  return {
    strength: typeof source.strength === 'number' && Number.isFinite(source.strength)
      ? Math.min(100, Math.max(0, source.strength)) : 0,
    axis: source.axis === 'horizontal' ? 'horizontal' : 'vertical',
    direction: source.direction === -1 ? -1 : 1,
  }
}
export type Placement = {
  x: number
  y: number
  width: number
  rotation: number
  lighting: number
  corners: Quad
  sleeveCurve?: SleeveCurve
}
export type MockImage = { width: number; height: number; bitmap: ImageBitmap; name: string }

export const MAX_PHOTO_PIXELS = 20_000_000
export const MAX_PHOTO_EDGE = 8192
export const initialPlacement = (view: ViewName): Placement => ({
  x: .5, y: view === 'front' ? .36 : .48,
  width: view === 'front' ? .22 : .53, rotation: 0, lighting: .75,
  corners: [{x:0,y:0},{x:0,y:0},{x:0,y:0},{x:0,y:0}],
})
export const bound = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n))

export function restorePlacement(value: unknown, view: ViewName): Placement {
  const def = initialPlacement(view)
  if (!value || typeof value !== 'object') return def
  const state = value as Partial<Placement>
  const number = (v: unknown, fallback: number, lo: number, hi: number) =>
    typeof v === 'number' && Number.isFinite(v) ? bound(v,lo,hi) : fallback
  const offsets = Array.isArray(state.corners) && state.corners.length === 4
    ? state.corners.map((p) => ({
      x: number(p?.x,0,-.5,.5), y:number(p?.y,0,-.5,.5),
    })) as Quad : def.corners
  return {
    x:number(state.x,def.x,-.5,1.5),
    y:number(state.y,def.y,-.5,1.5),
    width:number(state.width,def.width,.025,1.5),
    rotation:number(state.rotation,def.rotation,-180,180),
    lighting:number(state.lighting,def.lighting,0,1),
    corners:offsets,
    sleeveCurve:restoreSleeveCurve(state.sleeveCurve),
  }
}

export function placementQuad(size: {width:number;height:number}, art: {width:number;height:number}, p:Placement): Quad {
  const width = p.width * size.width
  const height = width * art.height / art.width
  const rotate = p.rotation * Math.PI / 180
  const c = Math.cos(rotate), s = Math.sin(rotate)
  const points: [number,number][] = [[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]]
  return points.map(([x,y],i) => ({
    x:p.x + (x*width*c - y*height*s)/size.width + p.corners[i].x,
    y:p.y + (x*width*s + y*height*c)/size.height + p.corners[i].y,
  })) as Quad
}

export function pointInQuad(p: Point, quad: Quad): boolean {
  let inside=false
  for(let i=0,j=3;i<4;j=i++){
    const a=quad[i],b=quad[j]
    if (((a.y>p.y)!==(b.y>p.y)) && p.x < (b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside=!inside
  }
  return inside
}
const interpolate = (q:Quad,u:number,v:number):Point => ({
  x:(1-u)*(1-v)*q[0].x + u*(1-v)*q[1].x + u*v*q[2].x + (1-u)*v*q[3].x,
  y:(1-u)*(1-v)*q[0].y + u*(1-v)*q[1].y + u*v*q[2].y + (1-u)*v*q[3].y,
})

/** Cylindrical projection across one axis plus a gentle arched cloth contour.
 * Endpoints stay anchored to the manually positioned four corners.
 * The original artwork bitmap is untouched; only its rendered mesh is warped.
 */
export function curvedArtworkPoint(q: Quad, u: number, v: number, curve?: SleeveCurve): Point {
  const amount = curve && Number.isFinite(curve.strength) ? bound(curve.strength, 0, 100) / 100 : 0
  if (amount === 0) return interpolate(q,u,v)
  const vertical = curve?.axis !== 'horizontal'
  const transverse = vertical ? v : u
  const longitudinal = vertical ? u : v
  const angle = amount * 2.45
  const projected = .5 + Math.sin((transverse-.5)*angle)/(2*Math.sin(angle/2))
  const bulge = amount * .105 * (1-Math.pow(2*transverse-1,2)) * (curve?.direction===-1?-1:1)
  return vertical
    ? interpolate(q,longitudinal+bulge,projected)
    : interpolate(q,projected,longitudinal+bulge)
}

/** Ordered photo-relative visible boundary; also used to detect curve overflow. */
export function artworkOutline(photo: {width:number;height:number}, art: {width:number;height:number}, placement: Placement): Point[] {
  const quad = placementQuad(photo,art,placement)
  if (!placement.sleeveCurve?.strength) return quad
  const steps = 16, result: Point[] = []
  for (let i=0;i<steps;i++) result.push(curvedArtworkPoint(quad,i/steps,0,placement.sleeveCurve))
  for (let i=0;i<steps;i++) result.push(curvedArtworkPoint(quad,1,i/steps,placement.sleeveCurve))
  for (let i=0;i<steps;i++) result.push(curvedArtworkPoint(quad,1-i/steps,1,placement.sleeveCurve))
  for (let i=0;i<steps;i++) result.push(curvedArtworkPoint(quad,0,1-i/steps,placement.sleeveCurve))
  return result
}
export function pointInArtwork(point: Point, outline: ReadonlyArray<Point>): boolean {
  let inside = false
  for (let i=0,j=outline.length-1;i<outline.length;j=i++) {
    const a=outline[i],b=outline[j]
    if ((a.y>point.y)!==(b.y>point.y) && point.x < (b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x) inside=!inside
  }
  return inside
}

function paintTriangle(ctx:CanvasRenderingContext2D, art:ImageBitmap, sx:Point, sy:Point, sz:Point, dx:Point,dy:Point,dz:Point){
  const det=(sx.x*(sy.y-sz.y)+sy.x*(sz.y-sx.y)+sz.x*(sx.y-sy.y))
  if(Math.abs(det)<.0001)return
  const a=(dx.x*(sy.y-sz.y)+dy.x*(sz.y-sx.y)+dz.x*(sx.y-sy.y))/det
  const c=(dx.x*(sz.x-sy.x)+dy.x*(sx.x-sz.x)+dz.x*(sy.x-sx.x))/det
  const e=(dx.x*(sy.x*sz.y-sz.x*sy.y)+dy.x*(sz.x*sx.y-sx.x*sz.y)+dz.x*(sx.x*sy.y-sy.x*sx.y))/det
  const b=(dx.y*(sy.y-sz.y)+dy.y*(sz.y-sx.y)+dz.y*(sx.y-sy.y))/det
  const d=(dx.y*(sz.x-sy.x)+dy.y*(sx.x-sz.x)+dz.y*(sy.x-sx.x))/det
  const f=(dx.y*(sy.x*sz.y-sz.x*sy.y)+dy.y*(sz.x*sx.y-sx.x*sz.y)+dz.y*(sx.x*sy.y-sy.x*sx.y))/det
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(dx.x,dx.y);ctx.lineTo(dy.x,dy.y);ctx.lineTo(dz.x,dz.y);ctx.closePath();ctx.clip()
  ctx.transform(a,b,c,d,e,f)
  ctx.drawImage(art,0,0)
  ctx.restore()
}
function warpedArtwork(layer:CanvasRenderingContext2D, image:MockImage, quad:Quad, width:number,height:number,curve?:SleeveCurve){
  const q=quad.map(p=>({x:p.x*width,y:p.y*height})) as Quad
  // Higher tessellation only when a cylindrical sleeve effect is enabled.
  const curved=Boolean(curve?.strength)
  const nx=curved?16:5,ny=curved?16:6
  for(let row=0;row<ny;row++)for(let col=0;col<nx;col++){
    const u=col/nx,v=row/ny,U=(col+1)/nx,V=(row+1)/ny
    const p00=curvedArtworkPoint(q,u,v,curve),p10=curvedArtworkPoint(q,U,v,curve)
    const p11=curvedArtworkPoint(q,U,V,curve),p01=curvedArtworkPoint(q,u,V,curve)
    const s00={x:u*image.width,y:v*image.height},s10={x:U*image.width,y:v*image.height}
    const s11={x:U*image.width,y:V*image.height},s01={x:u*image.width,y:V*image.height}
    paintTriangle(layer,image.bitmap,s00,s10,s11,p00,p10,p11)
    paintTriangle(layer,image.bitmap,s00,s11,s01,p00,p11,p01)
  }
}

/** Same renderer is used for responsive preview and native-resolution export. */
export function renderGarmentLayers(canvas:HTMLCanvasElement,photo:MockImage,layers:ReadonlyArray<{art:MockImage;placement:Placement}>,maxEdge:number){
  const ratio=Math.min(1,maxEdge/Math.max(photo.width,photo.height))
  const width=Math.max(1,Math.round(photo.width*ratio))
  const height=Math.max(1,Math.round(photo.height*ratio))
  canvas.width=width;canvas.height=height
  const ctx=canvas.getContext('2d',{willReadFrequently:true,colorSpace:'srgb'})
  if(!ctx)throw new Error('No se pudo abrir el lienzo de mockups.')
  ctx.clearRect(0,0,width,height)
  ctx.drawImage(photo.bitmap,0,0,width,height)
  for(const {art,placement} of layers){
  const quad=placementQuad({width,height},art,placement)
  const outline=artworkOutline({width,height},art,placement)
  const x=bound(Math.floor(Math.min(...outline.map(p=>p.x))*width)-2,0,width)
  const y=bound(Math.floor(Math.min(...outline.map(p=>p.y))*height)-2,0,height)
  const right=bound(Math.ceil(Math.max(...outline.map(p=>p.x))*width)+2,0,width)
  const bottom=bound(Math.ceil(Math.max(...outline.map(p=>p.y))*height)+2,0,height)
  const w=right-x,h=bottom-y
  if(w<=0||h<=0)continue

  const overlay=document.createElement('canvas');overlay.width=width;overlay.height=height
  try{
    const layer=overlay.getContext('2d',{willReadFrequently:true})
    if(!layer)throw new Error('No se pudo preparar el estampado.')
    warpedArtwork(layer,art,quad,width,height,placement.sleeveCurve)
    if(placement.lighting>0){
      const fabric=ctx.getImageData(x,y,w,h)
      const print=layer.getImageData(x,y,w,h)
      const src=fabric.data,dst=print.data
      // Local relative luminance uses the actual fabric photo. Bright prints
      // on black cloth remain bright: the fabric color is NEVER multiplied into RGB.
      let total=0,samples=0
      for(let i=0;i<dst.length;i+=Math.max(4,4*Math.ceil(w*h/9000))){
        const px=Math.floor(i/4)*4
        if(dst[px+3]<3)continue
        total+=.2126*src[px]+.7152*src[px+1]+.0722*src[px+2]
        samples++
      }
      const reference=samples?total/samples:70
      for(let i=0;i<dst.length;i+=4){
        if(!dst[i+3])continue
        const local=.2126*src[i]+.7152*src[i+1]+.0722*src[i+2]
        const ratio=bound((local+35)/(reference+35),.56,1.30)
        const shade=1+(ratio-1)*placement.lighting
        dst[i]=bound(Math.round(dst[i]*shade),0,255)
        dst[i+1]=bound(Math.round(dst[i+1]*shade),0,255)
        dst[i+2]=bound(Math.round(dst[i+2]*shade),0,255)
      }
      layer.putImageData(print,x,y)
    }
    ctx.drawImage(overlay,0,0)
  }finally{
    overlay.width=0;overlay.height=0
  }
  }
}

export function renderGarment(canvas:HTMLCanvasElement,photo:MockImage,art:MockImage|null,placement:Placement,maxEdge:number){
  renderGarmentLayers(canvas,photo,art?[{art,placement}]:[],maxEdge)
}

/** Anchors the diagonally opposite corner while scaling artwork proportionally. */
export function scaleFromCorner(size:{width:number;height:number},art:{width:number;height:number},origin:Placement,corner:number,p:Point):Placement{
  const quad=placementQuad(size,art,origin)
  const opposite=quad[(corner+2)%4]
  const start=quad[corner]
  const vx=start.x-opposite.x,vy=start.y-opposite.y
  const denominator=vx*vx+vy*vy
  if(denominator<1e-10)return origin
  const factor=bound(((p.x-opposite.x)*vx+(p.y-opposite.y)*vy)/denominator,.1,6)
  const width=bound(origin.width*factor,.025,1.5)
  const scale=width/origin.width
  return {...origin,width,x:opposite.x+(origin.x-opposite.x)*scale,y:opposite.y+(origin.y-opposite.y)*scale,
    corners:origin.corners.map(offset=>({x:offset.x*scale,y:offset.y*scale})) as Quad}
}

export async function canvasPng(canvas:HTMLCanvasElement):Promise<Blob>{
  return new Promise((resolve,reject)=>canvas.toBlob(
    blob=>blob?resolve(blob):reject(new Error('No se pudo exportar el PNG. Intenta con una foto de menor resolución.')),
    'image/png',
  ))
}
export function ensurePhotoSize(size:{width:number;height:number}){
  if(size.width<1||size.height<1||size.width>MAX_PHOTO_EDGE||size.height>MAX_PHOTO_EDGE||size.width*size.height>MAX_PHOTO_PIXELS){
    throw new Error('La fotografía excede el límite del editor (20 MP, máximo 8192 px por lado). No se reducirá automáticamente.')
  }
}
