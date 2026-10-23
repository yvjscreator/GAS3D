import { artworkOutline, placementQuad, type Placement, type Point } from './mockupEngine'
import { photoPixelsPerCm, type PhotoCalibration, type PhotoSize } from './mockupCalibration'

const CROSS_EPS = 1e-10
const cross = (a:Point,b:Point,c:Point) =>
  (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)
const area = (poly:ReadonlyArray<Point>) => poly.reduce((sum,p,i) => {
  const q=poly[(i+1)%poly.length]
  return sum+p.x*q.y-q.x*p.y
},0)/2

function onSegment(p:Point,a:Point,b:Point):boolean {
  return Math.abs(cross(a,b,p))<1e-8 &&
    p.x>=Math.min(a.x,b.x)-1e-8 && p.x<=Math.max(a.x,b.x)+1e-8 &&
    p.y>=Math.min(a.y,b.y)-1e-8 && p.y<=Math.max(a.y,b.y)+1e-8
}
function properIntersection(a:Point,b:Point,c:Point,d:Point):boolean {
  const c1=cross(a,b,c),c2=cross(a,b,d),c3=cross(c,d,a),c4=cross(c,d,b)
  return ((c1>CROSS_EPS&&c2< -CROSS_EPS)||(c1< -CROSS_EPS&&c2>CROSS_EPS)) &&
    ((c3>CROSS_EPS&&c4< -CROSS_EPS)||(c3< -CROSS_EPS&&c4>CROSS_EPS))
}
function segmentsIntersect(a:Point,b:Point,c:Point,d:Point):boolean {
  return properIntersection(a,b,c,d)||onSegment(a,c,d)||onSegment(b,c,d)||
    onSegment(c,a,b)||onSegment(d,a,b)
}
function goodPoint(value:unknown):value is Point {
  if (!value||typeof value!=='object') return false
  const p=value as Partial<Point>
  return typeof p.x==='number' && Number.isFinite(p.x) && p.x>=0 && p.x<=1 &&
    typeof p.y==='number' && Number.isFinite(p.y) && p.y>=0 && p.y<=1
}

/** Reject malformed, zero-area, self-crossing or partially saved masks. */
export function restoreGarmentMask(raw:unknown):Point[] {
  if (!Array.isArray(raw)||raw.length<3||raw.length>32||!raw.every(goodPoint)) return []
  const points:Point[]=raw.map(p=>({x:p.x,y:p.y}))
  if (Math.abs(area(points))<.0005) return []
  for(let i=0;i<points.length;i++) {
    const a=points[i],b=points[(i+1)%points.length]
    if (Math.hypot(a.x-b.x,a.y-b.y)<.005) return []
    for(let j=i+1;j<points.length;j++) {
      if (j===i || j===(i+1)%points.length || i===(j+1)%points.length) continue
      if(segmentsIntersect(a,b,points[j],points[(j+1)%points.length])) return []
    }
  }
  return points
}

/** Boundary points are considered inside to avoid rejecting matching silhouettes. */
export function pointInPolygon(p:Point,polygon:ReadonlyArray<Point>):boolean {
  if(polygon.length<3) return false
  let inside=false
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[j],b=polygon[i]
    if(onSegment(p,a,b))return true
    if ((a.y>p.y)!==(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside
  }
  return inside
}

/** Detect a print crossing a concave silhouette as well as vertices outside it. */
export function outlineInsidePolygon(outline:ReadonlyArray<Point>,polygon:ReadonlyArray<Point>):boolean {
  if (polygon.length<3||outline.length<3) return false
  for(let i=0;i<outline.length;i++) {
    const a=outline[i],b=outline[(i+1)%outline.length]
    if (!pointInPolygon(a,polygon)||!pointInPolygon({x:(a.x+b.x)/2,y:(a.y+b.y)/2},polygon)) return false
    for(let j=0;j<polygon.length;j++) {
      if(properIntersection(a,b,polygon[j],polygon[(j+1)%polygon.length])) return false
    }
  }
  return true
}

function lineIntersection(a:Point,b:Point,c:Point,d:Point):Point|null {
  const dx=b.x-a.x,dy=b.y-a.y,ex=d.x-c.x,ey=d.y-c.y
  const det=dx*ey-dy*ex
  if(Math.abs(det)<1e-9)return null
  const t=((c.x-a.x)*ey-(c.y-a.y)*ex)/det
  return {x:a.x+t*dx,y:a.y+t*dy}
}

/** Insets convex zone quads in real cm, respecting different X and Y photo scales. */
export function safeZonePolygon(
  photo:PhotoSize, zone:Placement, aspect:number, calibration:PhotoCalibration, seamMarginCm:number,
):Point[] {
  if(!Number.isFinite(aspect)||aspect<=0||photo.width<=0||photo.height<=0)return []
  const quad=placementQuad(photo,{width:1000,height:1000/aspect},zone)
  const margin=Number.isFinite(seamMarginCm)?Math.max(0,Math.min(8,seamMarginCm)):0
  if(!margin)return quad
  const scale=photoPixelsPerCm(photo,calibration)
  if(!scale)return quad // Uncalibrated: never pretend centimeters are accurate.
  const toCm=(p:Point):Point=>({x:p.x*photo.width/scale.x,y:p.y*photo.height/scale.y})
  const fromCm=(p:Point):Point=>({x:p.x*scale.x/photo.width,y:p.y*scale.y/photo.height})
  const points=quad.map(toCm),signed=area(points)
  if(Math.abs(signed)<CROSS_EPS)return []
  const orientation=Math.sign(signed)
  // Only convex print zones admit a reliable inward offset.
  for(let i=0;i<4;i++) {
    if(cross(points[i],points[(i+1)%4],points[(i+2)%4])*orientation<=CROSS_EPS)return []
  }
  const edges=points.map((a,i)=>{
    const b=points[(i+1)%4],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)
    if(length<1e-8)return null
    const shift={x:-dy*orientation*margin/length,y:dx*orientation*margin/length}
    return {a:{x:a.x+shift.x,y:a.y+shift.y},b:{x:b.x+shift.x,y:b.y+shift.y}}
  })
  if(edges.some(edge=>edge===null))return []
  const inset:Point[]=[]
  for(let i=0;i<4;i++) {
    const last=edges[(i+3)%4]!,next=edges[i]!
    const point=lineIntersection(last.a,last.b,next.a,next.b)
    if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))return []
    inset.push(point)
  }
  if(Math.abs(area(inset))<CROSS_EPS || Math.sign(area(inset))!==orientation) return []
  const result=inset.map(fromCm)
  return outlineInsidePolygon(result,quad)?result:[]
}

export function printInsideSafeAreas(
  photo:PhotoSize,art:PhotoSize,placement:Placement,
  allowed:ReadonlyArray<ReadonlyArray<Point>>,
):boolean {
  const outline=artworkOutline(photo,art,placement)
  return allowed.every(polygon=>outlineInsidePolygon(outline,polygon))
}
