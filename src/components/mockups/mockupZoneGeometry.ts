import { placementQuad, type Placement, type Point, type Quad } from './mockupEngine'
import { restoreGarmentMask } from './mockupMasks'

export type ZoneGeometry = { placement:Placement; aspect:number; polygon?:Point[] }
export const ZONE_EDGE_NAMES = ['superior','derecho','inferior','izquierdo'] as const

/** The template boundary is independent of artwork presence, proportions or draft. */
export function configuredZoneOutline(photo:{width:number;height:number},zone:ZoneGeometry):Point[]{
  return zone.polygon?.length?zone.polygon:placementQuad(photo,{width:1000,height:1000/zone.aspect},zone.placement)
}

/** Pen zones use their enclosing box; rectangular/perspective zones use their actual quad. */
function resizeFrame(photo:{width:number;height:number},zone:ZoneGeometry):Quad {
  if(!zone.polygon?.length)return placementQuad(photo,{width:1000,height:1000/zone.aspect},zone.placement)
  const xs=zone.polygon.map(p=>p.x),ys=zone.polygon.map(p=>p.y)
  const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys)
  return [{x:left,y:top},{x:right,y:top},{x:right,y:bottom},{x:left,y:bottom}]
}
export function zoneEdgeHandles(photo:{width:number;height:number},zone:ZoneGeometry):Point[] {
  const frame=resizeFrame(photo,zone)
  return frame.map((p,i)=>({x:(p.x+frame[(i+1)%4].x)/2,y:(p.y+frame[(i+1)%4].y)/2}))
}

/** Move one edge along its normal; keep the opposite edge and the print PNG untouched. */
export function resizeZoneFromEdge(
  photo:{width:number;height:number},zone:ZoneGeometry,edge:number,delta:Point,
):ZoneGeometry {
  if(!Number.isInteger(edge)||edge<0||edge>3||!Number.isFinite(delta.x)||!Number.isFinite(delta.y)||photo.width<=0||photo.height<=0)return zone
  const frame=resizeFrame(photo,zone),next=(edge+1)%4
  const a=frame[edge],b=frame[next],dx=(b.x-a.x)*photo.width,dy=(b.y-a.y)*photo.height,length=Math.hypot(dx,dy)
  if(length<1e-8)return zone
  const normal={x:-dy/length,y:dx/length}
  const requested=delta.x*photo.width*normal.x+delta.y*photo.height*normal.y
  const candidate=(amount:number):ZoneGeometry|null=>{
    const quad=frame.map((p,i)=>i===edge||i===next
      ?{x:p.x+normal.x*amount/photo.width,y:p.y+normal.y*amount/photo.height}:{...p}) as Quad
    if(quad.some(p=>p.x<0||p.x>1||p.y<0||p.y>1))return null
    // Reject collapsed, flipped and crossed shapes before constructing saved geometry.
    for(let i=0;i<4;i++){
      const p=quad[i],q=quad[(i+1)%4],r=quad[(i+2)%4]
      if((q.x-p.x)*(r.y-q.y)-(q.y-p.y)*(r.x-q.x)<=1e-8)return null
    }
    const distance=(i:number,j:number)=>Math.hypot((quad[i].x-quad[j].x)*photo.width,(quad[i].y-quad[j].y)*photo.height)
    const width=(distance(0,1)+distance(2,3))/2,height=(distance(1,2)+distance(3,0))/2,aspect=width/height
    if(width/photo.width<.025||width/photo.width>1.5||aspect<.15||aspect>6)return null
    const placement:Placement={...zone.placement,x:quad.reduce((sum,p)=>sum+p.x,0)/4,
      y:quad.reduce((sum,p)=>sum+p.y,0)/4,width:width/photo.width,
      corners:[{x:0,y:0},{x:0,y:0},{x:0,y:0},{x:0,y:0}],
    }
    const base=placementQuad(photo,{width:1000,height:1000/aspect},placement)
    placement.corners=quad.map((p,i)=>({x:p.x-base[i].x,y:p.y-base[i].y})) as Quad
    if(placement.corners.some(p=>Math.abs(p.x)>.5||Math.abs(p.y)>.5))return null
    if(!zone.polygon?.length)return {placement,aspect}
    const oldWidth=frame[1].x-frame[0].x,oldHeight=frame[3].y-frame[0].y
    if(oldWidth<=0||oldHeight<=0)return null
    const polygon=restoreGarmentMask(zone.polygon.map(p=>({
      x:quad[0].x+(p.x-frame[0].x)*(quad[1].x-quad[0].x)/oldWidth,
      y:quad[0].y+(p.y-frame[0].y)*(quad[3].y-quad[0].y)/oldHeight,
    })))
    return polygon.length?{placement,aspect,polygon}:null
  }
  const result=candidate(requested)
  if(result)return result
  // Stop smoothly at the photo/minimum-size limits, rather than jumping back or flipping.
  let low=0,high=1,best:ZoneGeometry=zone
  for(let i=0;i<24;i++){
    const fraction=(low+high)/2,result=candidate(requested*fraction)
    if(result){low=fraction;best=result}else high=fraction
  }
  return best
}
