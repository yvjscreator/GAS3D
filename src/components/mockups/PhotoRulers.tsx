import { useEffect, useRef } from 'react'
import type { Point } from './mockupEngine'
import { rulerTicks } from './mockupCalibration'

export type PhotoFrame = { width:number;height:number;imageWidth:number;imageHeight:number;photoWidth:number;pan:Point;zoom:number }
export function PhotoRulers({frame,scale}:{frame:PhotoFrame;scale:{x:number;y:number}|null}){
  const horizontal=useRef<HTMLCanvasElement>(null),vertical=useRef<HTMLCanvasElement>(null)
  useEffect(()=>{
    const {width,height,imageWidth,imageHeight,pan,zoom}=frame
    const ratio=window.devicePixelRatio||1
    const draw=(canvas:HTMLCanvasElement|null,length:number,origin:number,pixelsPerUnit:number,rotated:boolean)=>{
      if(!canvas||length<=0)return
      canvas.width=Math.ceil((rotated?28:length)*ratio);canvas.height=Math.ceil((rotated?length:28)*ratio)
      const ctx=canvas.getContext('2d');if(!ctx)return
      ctx.scale(ratio,ratio);ctx.fillStyle='#101e2b';ctx.fillRect(0,0,rotated?28:length,rotated?length:28)
      ctx.fillStyle='#bdd4e6';ctx.strokeStyle='#60829c';ctx.font='11px sans-serif'
      for(const tick of rulerTicks(length,origin,pixelsPerUnit)){
        ctx.beginPath()
        if(rotated){ctx.moveTo(22,tick.position);ctx.lineTo(28,tick.position);ctx.stroke();ctx.save();ctx.translate(13,tick.position+3);ctx.rotate(-Math.PI/2);ctx.fillText(String(tick.value),0,0);ctx.restore()}
        else{ctx.moveTo(tick.position,22);ctx.lineTo(tick.position,28);ctx.stroke();ctx.fillText(String(tick.value),tick.position+3,14)}
      }
    }
    const factor=imageWidth*zoom/frame.photoWidth
    draw(horizontal.current,width,(width-imageWidth*zoom)/2+pan.x,factor*(scale?.x??1),false)
    draw(vertical.current,height,(height-imageHeight*zoom)/2+pan.y,factor*(scale?.y??1),true)
  },[frame,scale])
  return <><span className="mockup-ruler-unit">{scale?'cm':'px'}</span>
    <canvas className="mockup-ruler-top" ref={horizontal} aria-label={'Regla horizontal en '+(scale?'centímetros estimados':'píxeles')}/>
    <canvas className="mockup-ruler-left" ref={vertical} aria-label={'Regla vertical en '+(scale?'centímetros estimados':'píxeles')}/></>
}
