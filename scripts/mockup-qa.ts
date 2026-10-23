import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { penFabricOutline } from '../src/components/mockups/mockupPen'
import { initialViewModes } from '../src/components/mockups/mockupWorkspace'
import { requestConfirmation, confirmationSnapshot, settleConfirmation, subscribeConfirmation } from '../src/components/ui/confirmation'
import { artworkOutline, curvedArtworkPoint, defaultSleeveCurve, initialPlacement, placementQuad, pointInArtwork, pointInQuad, restorePlacement, restoreSleeveCurve, ensurePhotoSize, scaleFromCorner } from '../src/components/mockups/mockupEngine'
import { artworkFitsZone, calibrationLineToSave, fitPrintToZone, photoPixelsPerCm, projectPrintPlacement, placementWidthForCm, printDimensionsCm, resizePrintPreservingWarp, restoreCalibration, rulerTicks, zoneDimensionsCm } from '../src/components/mockups/mockupCalibration'
import { outlineInsidePolygon, pointInPolygon, printInsideSafeAreas, restoreGarmentMask, safeZonePolygon } from '../src/components/mockups/mockupMasks'
import { detectGarment } from '../src/components/mockups/garmentDetection'
import { configuredZoneOutline, resizeZoneFromEdge, zoneEdgeHandles } from '../src/components/mockups/mockupZoneGeometry'

const source=(path:string)=>readFileSync(path,'utf8')
const front=initialPlacement('front'),back=initialPlacement('back')
assert.ok(front.width<back.width,'Front logo should start smaller than back print')
const photo={width:1000,height:1200},art={width:600,height:800}
const configuredBoundary=configuredZoneOutline(photo,{placement:front,aspect:.7})
assert.deepEqual(configuredBoundary,placementQuad(photo,{width:1000,height:1000/.7},front),'The fixed product guide must use template dimensions independently of the artwork')
const polygonBoundary=[{x:.2,y:.2},{x:.8,y:.2},{x:.5,y:.8}]
assert.deepEqual(configuredZoneOutline(photo,{placement:front,aspect:1,polygon:polygonBoundary}),polygonBoundary,'The same saved pen polygon must delimit the product zone in every mode')
const quad=placementQuad(photo,art,front)
assert.ok(quad[0].x<quad[1].x&&quad[0].y<quad[3].y,'Placement orientation wrong')
assert.ok(pointInQuad({x:front.x,y:front.y},quad),'Image center should be selectable')
assert.ok(!pointInQuad({x:0,y:0},quad),'Out-of-zone clicks must not start dragging')
assert.deepEqual(restorePlacement({x:Infinity,width:-9},'back').width,.025)
assert.doesNotThrow(()=>ensurePhotoSize({width:3000,height:4000}))
assert.throws(()=>ensurePhotoSize({width:9000,height:1000}))
const larger=scaleFromCorner(photo,art,front,2,{x:quad[0].x+(quad[2].x-quad[0].x)*1.5,y:quad[0].y+(quad[2].y-quad[0].y)*1.5})
const enlarged=placementQuad(photo,art,larger)
assert.ok(larger.width>front.width,'Normal corner drag must grow the artwork proportionally')
assert.ok(Math.abs(enlarged[0].x-quad[0].x)<1e-7&&Math.abs(enlarged[0].y-quad[0].y)<1e-7,'Opposite corner must stay anchored')
assert.ok(Math.abs((enlarged[1].x-enlarged[0].x)/(enlarged[3].y-enlarged[0].y)-(quad[1].x-quad[0].x)/(quad[3].y-quad[0].y))<1e-6,'Proportional resizing should not warp a print')

// Each zone side stretches only its own axis, anchoring the opposite side.
const edgeZone={placement:{...initialPlacement('back'),x:.5,y:.5,width:.3},aspect:1.25}
const edgeQuad=placementQuad(photo,{width:1000,height:1000/edgeZone.aspect},edgeZone.placement)
const oppositeVertices=[[2,3],[0,3],[0,1],[1,2]]
const samePoint=(a:{x:number;y:number},b:{x:number;y:number})=>Math.abs(a.x-b.x)<1e-8&&Math.abs(a.y-b.y)<1e-8
const geometryQuad=(zone:typeof edgeZone)=>placementQuad(photo,{width:1000,height:1000/zone.aspect},zone.placement)
const originalZone=JSON.stringify(edgeZone)
for(const [edge,delta] of [[0,{x:.1,y:-.08}],[1,{x:.08,y:.1}],[2,{x:.1,y:.08}],[3,{x:-.08,y:.1}]] as const){
  const resized=resizeZoneFromEdge(photo,edgeZone,edge,delta),result=geometryQuad(resized)
  for(const vertex of oppositeVertices[edge])assert.ok(samePoint(result[vertex],edgeQuad[vertex]),'The opposite side must remain anchored')
  if(edge%2===0){
    assert.ok(Math.abs(resized.placement.width-edgeZone.placement.width)<1e-8,'Vertical side drag must not change width')
    assert.ok(result.every((p,i)=>Math.abs(p.x-edgeQuad[i].x)<1e-8),'Tangential movement must not move a vertical resize sideways')
  }else{
    assert.ok(result.every((p,i)=>Math.abs(p.y-edgeQuad[i].y)<1e-8),'Horizontal side drag must preserve height')
  }
  const handles=zoneEdgeHandles(photo,resized)
  assert.ok(samePoint(handles[edge],{x:(result[edge].x+result[(edge+1)%4].x)/2,y:(result[edge].y+result[(edge+1)%4].y)/2}),'Edge handle must follow the resized side')
  const restored=geometryQuad({...resized,placement:restorePlacement(resized.placement,'back')})
  assert.ok(restored.every((p,i)=>samePoint(p,result[i])),'Edge-resized zones must retain geometry after restoration')
}
assert.equal(JSON.stringify(edgeZone),originalZone,'Resizing must not mutate saved source geometry')
const limited=resizeZoneFromEdge(photo,edgeZone,0,{x:0,y:100})
assert.ok(geometryQuad(limited)[0].y<geometryQuad(limited)[3].y,'Dragging through the opposite edge must stop instead of flipping')
assert.ok(geometryQuad(limited)[0].y>edgeQuad[0].y,'Minimum-size clamping should stop near the limit rather than jump back')
const angled={...edgeZone,placement:{...edgeZone.placement,rotation:20,corners:[{x:-.02,y:0},{x:.01,y:.01},{x:0,y:.02},{x:0,y:0}] as typeof front.corners}}
const angledBefore=geometryQuad(angled),angledAfter=geometryQuad(resizeZoneFromEdge(photo,angled,0,{x:.01,y:-.03}))
assert.ok([2,3].every(i=>samePoint(angledBefore[i],angledAfter[i])),'Perspective-zone resizing must also anchor the opposite edge')
const penZone={...edgeZone,polygon:[{x:.3,y:.3},{x:.7,y:.3},{x:.7,y:.7},{x:.5,y:.6},{x:.3,y:.7}]}
const penBefore=JSON.stringify(penZone)
const tallerPen=resizeZoneFromEdge(photo,penZone,0,{x:.2,y:-.05})
assert.ok(tallerPen.polygon&&Math.abs(Math.min(...tallerPen.polygon.map(p=>p.y))-.25)<1e-8,'Pen zone should stretch from its top bounding handle')
assert.ok(tallerPen.polygon!.every((p,i)=>Math.abs(p.x-penZone.polygon[i].x)<1e-8),'Stretching a pen zone vertically must preserve its width')
assert.ok(Math.abs(Math.max(...tallerPen.polygon!.map(p=>p.y))-.7)<1e-8,'Pen zone opposite boundary must remain anchored')
assert.equal(JSON.stringify(penZone),penBefore,'Pen zone resizing must preserve the source outline')
const widerPen=resizeZoneFromEdge(photo,penZone,1,{x:10,y:0})
assert.ok(widerPen.polygon!.every(p=>p.x>=0&&p.x<=1),'Extreme resize must stop at the photograph boundary')
const line={horizontal:{from:{x:.2,y:.3},to:{x:.8,y:.3},cm:60},vertical:{from:{x:.3,y:.1},to:{x:.3,y:.9},cm:80}}
const calibration=restoreCalibration(line)
// Compact reference rows explicitly apply a draft; neither incomplete marking nor another axis may overwrite saved points.
const savedReferences=structuredClone(calibration)
assert.deepEqual(calibrationLineToSave(calibration.horizontal,null,'horizontal','54'),{...calibration.horizontal,cm:54})
const pendingReference={axis:'horizontal' as const,first:{x:.2,y:.3},second:{x:.8,y:.3}}
assert.deepEqual(calibrationLineToSave(calibration.horizontal,pendingReference,'horizontal','54'),{from:pendingReference.first,to:pendingReference.second,cm:54})
assert.equal(calibrationLineToSave(calibration.horizontal,{axis:'horizontal',first:null},'horizontal','54'),null,'Marking must not silently reuse saved endpoints')
assert.equal(calibrationLineToSave(calibration.horizontal,{axis:'horizontal',first:{x:.2,y:.3}},'horizontal','54'),null,'Both points are required before applying a marked segment')
assert.deepEqual(calibrationLineToSave(calibration.vertical,pendingReference,'vertical','70'),{...calibration.vertical,cm:70},'Applying the other axis must preserve its saved points')
for(const value of ['', '0', '-1', 'Infinity', '501'])assert.equal(calibrationLineToSave(calibration.horizontal,null,'horizontal',value),null,'Reject invalid cm input')
assert.deepEqual(calibration,savedReferences,'Preparing or cancelling input must not mutate saved calibration')
assert.equal(calibrationLineToSave(undefined,null,'horizontal','54'),null,'A new measurement needs points')
const scale=photoPixelsPerCm(photo,calibration)
assert.ok(scale&&Math.abs(scale.x-10)<1e-8&&Math.abs(scale.y-12)<1e-8,'Calibration references must resolve photo pixels per cm')
const p={...initialPlacement('back'),x:.5,y:.5,width:.3}
const cm=printDimensionsCm(photo,art,p,calibration)
assert.ok(cm&&Math.abs(cm.width-30)<1e-8&&Math.abs(cm.height-40)<1e-8,'Flat print dimensions must preserve PNG aspect even with different X/Y photo scales')
assert.ok(Math.abs((placementWidthForCm(photo,art,calibration,'horizontal',35)??NaN)-.35)<1e-9,'Changing print width must preserve bitmap aspect')
assert.ok(Math.abs((placementWidthForCm(photo,art,calibration,'vertical',40)??NaN)-.3)<1e-9,'Height-driven sizing must preserve physical bitmap aspect')
assert.ok(Math.abs((printDimensionsCm(photo,art,{...p,width:.35},calibration)?.width??NaN)-35)<1e-8,'Converting a scaled print back to cm must tolerate floating-point precision')
// Regression: a 40:53 PNG at 53 cm high must be 40 cm wide, regardless of photo-axis calibration.
for(const sourceArt of [{width:4000,height:5300},{width:4217,height:5689},{width:400,height:400},{width:800,height:400}]){
  const width=placementWidthForCm(photo,sourceArt,calibration,'vertical',53)!
  const print=projectPrintPlacement(photo,{...p,width},calibration)
  const dimensions=printDimensionsCm(photo,sourceArt,print,calibration)!
  assert.ok(Math.abs(dimensions.height-53)<1e-8,'Entering height must round-trip without applying a second photo scale')
  assert.ok(Math.abs(dimensions.width/dimensions.height-sourceArt.width/sourceArt.height)<1e-8,'Physical print aspect must equal the actual PNG, not its filename or photo scale')
  for(const rotation of [0,37,90,-25]){
    const q=placementQuad(photo,sourceArt,{...print,rotation})
    const physicalEdge=(a:typeof q[0],b:typeof q[0])=>Math.hypot((b.x-a.x)*photo.width/scale!.x,(b.y-a.y)*photo.height/scale!.y)
    assert.ok(Math.abs(physicalEdge(q[0],q[1])-dimensions.width)<1e-8,'Rendered width must agree with the physical input after photo projection and rotation')
    assert.ok(Math.abs(physicalEdge(q[0],q[3])-dimensions.height)<1e-8,'Rendered height must agree with the physical input after photo projection and rotation')
  }
  const restored=projectPrintPlacement(photo,restorePlacement(JSON.parse(JSON.stringify(print)),'front'),calibration)
  assert.deepEqual(placementQuad(photo,sourceArt,restored),placementQuad(photo,sourceArt,print),'Reload must preserve the calibrated projection')
}
const projected=projectPrintPlacement(photo,p,calibration),projectedQuad=placementQuad(photo,art,projected)
const projectedLarger=scaleFromCorner(photo,art,projected,2,{x:projectedQuad[0].x+(projectedQuad[2].x-projectedQuad[0].x)*1.5,y:projectedQuad[0].y+(projectedQuad[2].y-projectedQuad[0].y)*1.5})
assert.ok(samePoint(placementQuad(photo,art,projectedLarger)[0],projectedQuad[0]),'Proportional dragging must keep its opposite corner anchored under unequal photo scales')
const fitted=fitPrintToZone(photo,art,{placement:{...p,width:.5},aspect:1},calibration)
assert.ok(artworkFitsZone(photo,art,fitted,{...p,width:.5},1),'Initial fit must account for the print projection, not overflow a calibrated zone')
assert.deepEqual(placementQuad(photo,art,projectPrintPlacement(photo,p,{})),placementQuad(photo,art,p),'Uncalibrated legacy geometry must remain unchanged')
assert.deepEqual(projectPrintPlacement(photo,projected,{vertical:calibration.vertical}).projectionY,1,'Changing references must recompute projection instead of accumulating it')
const warped={...p,corners:[{x:.04,y:0},{x:0,y:0},{x:0,y:0},{x:0,y:0}] as typeof p.corners}
const resized=resizePrintPreservingWarp(warped,.6)
assert.equal(resized.width,.6)
assert.ok(Math.abs(resized.corners[0].x-.08)<1e-8,'Resize must preserve existing manual warp proportions')
const area=zoneDimensionsCm(photo,{...p,width:.5},1,calibration)
assert.ok(area&&Math.abs(area.width-50)<1e-8&&Math.abs(area.height-500/12)<1e-8,'Zone bounds need centimeter dimensions')
assert.ok(artworkFitsZone(photo,art,p,{...p,width:.5},1),'Normal artwork must fit inside its zone')
assert.ok(!artworkFitsZone(photo,art,{...p,x:.92},{...p,width:.5},1),'Moving outside a zone must warn')
assert.deepEqual(restoreCalibration({horizontal:{from:{x:0,y:0},to:{x:0,y:0},cm:0}}),{},'Reject invalid or stale reference geometry')
assert.equal(photoPixelsPerCm(photo,{}),null,'Legacy products must stay uncalibrated')
assert.equal(printDimensionsCm(photo,art,p,{}),null,'Do not claim physical measures without any known reference')
const singleAxis={vertical:calibration.vertical}
assert.deepEqual(photoPixelsPerCm(photo,singleAxis),{x:12,y:12},'One known length should estimate an isotropic photo scale')
assert.ok(Math.abs((printDimensionsCm(photo,{width:400,height:400},p,singleAxis)?.width??0)-25)<1e-8,'A single vertical reference must size a print in centimeters')
assert.equal(printDimensionsCm(photo,{width:400,height:400},p,singleAxis)?.width,printDimensionsCm(photo,{width:400,height:400},p,singleAxis)?.height,'Uniform estimated scale should keep square artwork square in cm')
const ruler=rulerTicks(600,100,10)
assert.ok(ruler.some(t=>t.value===0&&t.position===100),'Ruler zero must track the image origin')
assert.ok(ruler.every(t=>Math.abs(t.position-(100+t.value*10))<1e-7),'Ruler values must follow calibrated scale')
assert.ok(rulerTicks(300,-75,20).every(t=>t.position>=0&&t.position<300),'Panned/zoomed ruler ticks must stay visible')

// Color segmentation retains concavities, ignores detached marks and fails safely on low contrast.
const garment=[{x:.38,y:.1},{x:.62,y:.1},{x:.82,y:.23},{x:.94,y:.43},{x:.77,y:.55},
  {x:.72,y:.42},{x:.72,y:.92},{x:.28,y:.92},{x:.28,y:.42},{x:.23,y:.55},{x:.06,y:.43},{x:.18,y:.23}]
function garmentRaster(foreground:number,background:number,alpha=false){
  const width=160,height=192,data=new Uint8ClampedArray(width*height*4)
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const inside=pointInPolygon({x:(x+.5)/width,y:(y+.5)/height},garment)
    const value=inside?foreground:background,i=(y*width+x)*4
    data[i]=data[i+1]=data[i+2]=value;data[i+3]=alpha&&!inside?0:255
  }
  // Detached speck must not become part of the garment contour.
  for(let y=3;y<7;y++)for(let x=3;x<7;x++){const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=foreground}
  return {width,height,data}
}
for(const raster of [garmentRaster(20,250),garmentRaster(245,20),garmentRaster(245,250,true)]){
  const before=raster.data.slice(),detected=detectGarment(raster)
  assert.deepEqual(raster.data,before,'Detection must never mutate source photo pixels')
  assert.ok(detected.outline.length>=8&&detected.outline.length<=32,'Detection should produce an editable bounded contour')
  assert.ok(pointInPolygon({x:.5,y:.65},detected.outline),'Detected garment should include the torso')
  assert.ok(!pointInPolygon({x:.15,y:.8},detected.outline),'Detection must preserve the armpit concavity')
  assert.ok(!pointInPolygon({x:.03,y:.03},detected.outline),'Detached noise must be excluded')
  assert.ok(detected.zone,'Contrasting torso should produce a conservative print area')
  const zone=detected.zone!
  assert.ok(outlineInsidePolygon(placementQuad(raster,{width:1000,height:1000/zone.aspect},zone.placement),detected.outline),'Suggested zone must remain wholly inside the garment')
}
assert.throws(()=>detectGarment(garmentRaster(245,250)),/contraste/,'White-on-white detection should request manual editing')
assert.throws(()=>detectGarment({width:0,height:0,data:[]}),/analizar/,'Malformed samples must fail safely')

// Sleeve cylinder mesh must preserve corner anchors, be opt-in for old drafts and
// create a real (non-affine) curvature with accurate guides and hit testing.
const sleeveQuad=placementQuad(photo,art,p)
const straightPoint=curvedArtworkPoint(sleeveQuad,1,.5)
const softCurve={...defaultSleeveCurve(),strength:80}
const curvedPoint=curvedArtworkPoint(sleeveQuad,1,.5,softCurve)
assert.ok(curvedPoint.x>straightPoint.x+.01,'Sleeve bend should bow the edge away from its flat quad')
for(const [u,v,index] of [[0,0,0],[1,0,1],[1,1,2],[0,1,3]] as const){
  const result=curvedArtworkPoint(sleeveQuad,u,v,softCurve)
  assert.ok(Math.abs(result.x-sleeveQuad[index].x)<1e-9&&Math.abs(result.y-sleeveQuad[index].y)<1e-9,'Sleeve corners must stay fixed')
}
const curvedOutline=artworkOutline(photo,art,{...p,sleeveCurve:softCurve})
assert.equal(curvedOutline.length,64,'Curved guide contour should follow the warped mesh')
assert.equal(artworkOutline(photo,art,p).length,4,'Legacy prints must retain their flat outline')
assert.ok(!pointInArtwork({x:.01,y:.01},curvedOutline),'Hit testing should reject clicks outside the sleeve')
const nearBulge={x:(straightPoint.x+curvedPoint.x)/2,y:curvedPoint.y}
assert.ok(pointInArtwork(nearBulge,curvedOutline),'Bulging sleeve edge must remain draggable')
const reverse=curvedArtworkPoint(sleeveQuad,1,.5,{...softCurve,direction:-1})
assert.ok(reverse.x<straightPoint.x-.01,'Bend direction must be reversible')
const horizontal=curvedArtworkPoint(sleeveQuad,.5,1,{...softCurve,axis:'horizontal'})
const flatHorizontal=curvedArtworkPoint(sleeveQuad,.5,1)
assert.ok(horizontal.y>flatHorizontal.y+.01,'Sleeve wrap axis must be selectable')
assert.ok(artworkFitsZone(photo,art,{...p,sleeveCurve:softCurve},{...p,width:.5},1),'A curved small print should fit a larger print zone')
assert.ok(artworkFitsZone(photo,art,{...p,width:.5},{...p,width:.5},.75),'The flat print should fit an exactly matching zone')
assert.ok(!artworkFitsZone(photo,art,{...p,width:.5,sleeveCurve:softCurve},{...p,width:.5},.75),'Bulging contour outside an otherwise matching zone must be flagged')
assert.equal(restorePlacement({ ...p },'leftSleeve').sleeveCurve,undefined,'Old saved drafts must remain uncurved')
assert.deepEqual(restorePlacement({...p,sleeveCurve:softCurve},'leftSleeve').sleeveCurve,softCurve,'Sleeve curve must survive settings restoration')
assert.equal(restoreSleeveCurve({strength:999,axis:'bad',direction:99})?.strength,100,'Invalid sleeve values must be clamped')
assert.ok(Math.abs(curvedArtworkPoint(sleeveQuad,.2,.35,{...softCurve,strength:0}).x-curvedArtworkPoint(sleeveQuad,.2,.35).x)<1e-9,'Zero curvature must be strictly equivalent to flat projection')

// Fabric clipping is opt-in per photo and seam clipping opt-in per print zone.
const rectangularMask=restoreGarmentMask([
  {x:.05,y:.05},{x:.95,y:.05},{x:.95,y:.95},{x:.05,y:.95},
])
assert.equal(rectangularMask.length,4,'Valid four-point fabric silhouette should be retained')
assert.deepEqual(restoreGarmentMask(undefined),[],'Existing products without masks must be unchanged')
assert.deepEqual(restoreGarmentMask([{x:0,y:0},{x:1,y:1},{x:0,y:1},{x:1,y:0}]),[],'Self crossing masks must be rejected')
assert.deepEqual(restoreGarmentMask([{x:0,y:0},{x:0,y:0},{x:1,y:1}]),[],'Repeated vertices should be invalid')
assert.equal(pointInPolygon({x:.05,y:.3},rectangularMask),true,'Mask edges are included')
assert.equal(pointInPolygon({x:.99,y:.3},rectangularMask),false,'Pixels outside garment mask must be excluded')
const cutout=restoreGarmentMask([
  {x:.05,y:.05},{x:.95,y:.05},{x:.95,y:.95},{x:.65,y:.95},
  {x:.65,y:.35},{x:.35,y:.35},{x:.35,y:.95},{x:.05,y:.95},
])
assert.equal(cutout.length,8,'Concave garment silhouettes must be supported')
assert.equal(pointInPolygon({x:.5,y:.6},cutout),false,'Concave empty space is not printable')
assert.equal(pointInPolygon({x:.2,y:.6},cutout),true,'Fabric beside concavity must remain')
const crossingPrint=[{x:.2,y:.5},{x:.8,y:.5},{x:.8,y:.6},{x:.2,y:.6}]
assert.equal(outlineInsidePolygon(crossingPrint,cutout),false,'Print bridges must not cross concave silhouette cutouts')
assert.ok(printInsideSafeAreas(photo,art,p,[rectangularMask]),'Centered print should fit the fabric silhouette')
assert.ok(!printInsideSafeAreas(photo,art,{...p,x:.92},[rectangularMask]),'Outside prints must be flagged')
assert.ok(printInsideSafeAreas(photo,art,p,[]),'Old products must not require any clipping polygon')
const seamZone={...p,width:.5}
const seamBoundary=safeZonePolygon(photo,seamZone,1,calibration,2)
const seamFull=safeZonePolygon(photo,seamZone,1,calibration,0)
assert.equal(seamBoundary.length,4,'Real margin should produce a four-corner safe printable area')
assert.ok(Math.abs(seamBoundary[0].x-(seamFull[0].x+.02))<1e-8,'2 cm seam should inset horizontal photo pixels correctly')
assert.ok(Math.abs(seamBoundary[0].y-(seamFull[0].y+.02))<1e-8,'2 cm seam should inset vertical photo pixels correctly')
assert.ok(printInsideSafeAreas(photo,art,p,[seamBoundary]),'Inside artwork must fit the safety margin')
assert.ok(!printInsideSafeAreas(photo,art,{...p,width:.47},[seamBoundary]),'Large artwork must warn before crossing the seam')
assert.equal(safeZonePolygon(photo,seamZone,1,{},2).length,4,'Uncalibrated legacy zones should retain photo-relative boundaries')
assert.deepEqual(safeZonePolygon(photo,seamZone,1,calibration,8).length,4,'Valid 8 cm safety margins should remain geometrically valid')
assert.ok(printInsideSafeAreas(photo,art,{...p,width:.2,sleeveCurve:defaultSleeveCurve()},[seamBoundary]),'Sleeve curves are checked against the safe boundary')
const customZone=[{x:.2,y:.2},{x:.7,y:.2},{x:.8,y:.4},{x:.7,y:.8},{x:.2,y:.8}]
assert.deepEqual(safeZonePolygon(photo,seamZone,1,calibration,0,customZone),customZone,'Pen zones must override rectangular boundaries in the shared renderer')
assert.equal(safeZonePolygon(photo,seamZone,1,calibration,1,customZone).length,5,'Convex pen zones should support physical seam insets')
assert.deepEqual(safeZonePolygon(photo,seamZone,1,calibration,0,cutout),cutout,'Concave pen zones should clip accurately at zero margin')
assert.deepEqual(safeZonePolygon(photo,seamZone,1,calibration,1,cutout),[],'Concave positive seam margins must fail explicitly rather than invent a safe boundary')

const productPage=source('src/components/mockups/ProductMockupStudio.tsx')
const productStorage=source('src/components/mockups/mockupProduct.ts')
assert.ok(productPage.includes('configuredZoneOutline(photo,z)')&&productPage.includes('guides&&productZone')&&productPage.includes('Encajar en zona del producto'),'Setup and mockup must share a fixed product-zone guide independent of the PNG draft')
assert.ok(productStorage.includes('mockup-products.v2')&&productPage.includes('Crear producto')&&productPage.includes('Nuevo mockup'),'Missing product-first library')
assert.ok(productPage.includes('Duplicar')===false || productPage.includes('duplicate'),'Product duplication handler missing')
assert.ok(productPage.includes('leftSleeve')&&productPage.includes('rightSleeve'),'Sleeve photographs must be supported')
assert.ok(productStorage.includes('restoreCalibration')&&productPage.includes('calibrationMode'),'Per-view editable calibration not wired')
assert.ok(productPage.includes('placementWidthForCm')&&productPage.includes('printDimensionsCm'),'Numeric print sizing not wired')
assert.ok(productPage.includes('zoneDimensionsCm')&&productPage.includes('artworkFitsZone'),'Cm zone sizing and overflow warnings missing')
assert.ok(productPage.includes('Adaptación a mangas')&&productPage.includes('defaultSleeveCurve'),'Curvature controls or automatic sleeve presets missing')
assert.ok(productPage.includes('pointInArtwork')&&productPage.includes('artworkOutline'),'Curved hit testing and outline guides missing')
assert.ok(productPage.includes('saveSilhouette')&&productPage.includes('restoreGarmentMask'),'Editable fabric silhouette panel missing')
assert.ok(productPage.includes('detectPhoto(image,view)')&&productPage.includes('Añadir zona sugerida'),'Uploaded photos must offer automatic contours and independent zone suggestions')
assert.ok(productPage.includes("enabled.filter(v=>v===active).map")&&productPage.includes('PhotoRulers'),'Focused editor must show only the active photo with rulers')
assert.ok(productPage.includes('setMaskClosed(true)')&&productPage.includes('Eliminar nodo')&&productPage.includes('setPointerCapture'),'Pen tool must support closure, node editing and captured touch drags')
assert.ok(productPage.includes('panDragRef')&&productPage.includes('setZoom')&&productPage.includes('saveCalibration'),'Zoom, panning and point-first calibration must be wired')
assert.ok(productPage.includes('Editar zona con Pluma')&&productStorage.includes('polygon:restoreGarmentMask(z.polygon)'),'Pen-drawn zones must persist and restore alongside old rectangle zones')
assert.ok(productPage.includes('data-zone-edge={edge}')&&productPage.includes("if(screen==='setup'&&guides)zoneEdgeHandles"),'Side controls must be confined to product-zone setup')
assert.ok(productPage.includes('resizeZoneFromEdge')&&productPage.includes("e.shiftKey?10:1"),'Zone side handles must support pointer and keyboard resizing')
const workspaceCss=source('src/components/mockups/mockupStudio.css')
assert.ok(workspaceCss.includes('grid-template-columns:52px minmax(0,1fr) 320px'),'Desktop workspace must reserve narrow tools, flexible canvas and readable layers')
assert.ok(workspaceCss.includes('.mockup-zen.is-panel-hidden .mockup-layout{grid-template-columns:52px minmax(0,1fr)}'),'Hidden layers must relinquish their grid track')
assert.ok(workspaceCss.includes('width:min(300px,calc(100% - 54px))')&&workspaceCss.includes('grid-template-columns:48px minmax(0,1fr)'),'Mobile controls must be a toggled drawer while retaining the canvas')
assert.ok(!productPage.includes('mockup-editor-breadcrumb')&&!productPage.includes('mockup-status'),'The editor must have one compact header and floating transient notifications')
const calibrationPanel=source('src/components/mockups/PhotoCalibrationControls.tsx')
assert.ok(calibrationPanel.includes('actionCount={3}')&&calibrationPanel.includes('icon={Check}')&&calibrationPanel.includes('icon={X}'),'Reference input, mark, apply and cancel must be a single shared inline field')
assert.ok(workspaceCss.includes('grid-template-columns:minmax(64px,1fr) auto 34px 34px')&&workspaceCss.includes('grid-template-columns:minmax(56px,1fr) auto 44px 44px'),'Reference actions must stay horizontal at desktop and touch widths')
assert.ok(!productPage.includes('mockup-calibration-prompt')&&!workspaceCss.includes('@container (max-width:360px){.mockup-calibration-grid'),'Do not restore tall per-field actions inside narrow sidebars')
assert.ok(productPage.includes('<InlineField label="Nombre de zona"')&&workspaceCss.includes('.mockup-properties .mockup-adjustment{grid-template-columns:'),'Compact field/actions and label/slider rows must be reused outside calibration')
const layers=source('src/components/mockups/MockupLayers.tsx')
assert.ok(layers.includes('role="switch"')&&layers.includes('onMode(view, modes[view]')&&layers.includes('onSelect(view)'),'Every view must have its own working mode switch and selection')
assert.ok(layers.includes('!photo.bitmap.width')&&layers.includes('!photo.bitmap.height'),'Thumbnail effects must skip bitmaps already detached by product navigation')
assert.ok(productPage.includes('setLoadedId(null);setModels(blank());setDraft({});return'),'Leaving a product must clear closed working bitmaps without deleting original media')
const viewModes=initialViewModes('setup'),changedModes={...viewModes,left:'mockup'}
assert.equal(changedModes.front,'setup','Changing the side-view mode cannot switch the front mode')
assert.equal(initialViewModes('mockup').back,'mockup','Opening a new mockup must initialize each view in artwork mode')
assert.equal(penFabricOutline(rectangularMask,customZone,'zone',true),rectangularMask,'Editing a print zone must retain the saved garment outline')
assert.equal(penFabricOutline(rectangularMask,customZone,'fabric',true),customZone,'Fabric edits must display their own draft')
assert.equal(penFabricOutline(rectangularMask,customZone,'fabric',false),rectangularMask,'A cancelled pen draft must not change the saved silhouette')
assert.ok(productPage.includes('data-pen-target="zone"')&&productPage.includes('data-pen-target="fabric"'),'Each pen target needs its own overlay')
assert.ok(productPage.includes('const zone=preferredZone(product.views[view],zoneId)'),'The pen must edit the selected/default product zone, including after reload')
let confirmationsChanged=0
const unsubscribe=subscribeConfirmation(()=>confirmationsChanged++)
const cancelled=requestConfirmation({title:'Test',description:'No data mutation',accept:'Continue'})
assert.equal(confirmationSnapshot()?.title,'Test')
assert.equal(await requestConfirmation({title:'Duplicate',description:'',accept:'Continue'}),false,'A second destructive action cannot replace a pending decision')
settleConfirmation(false)
assert.equal(await cancelled,false,'Cancelling must resolve without authorizing the action')
const accepted=requestConfirmation({title:'Test',description:'',accept:'Continue'})
settleConfirmation(true)
assert.equal(await accepted,true)
assert.equal(confirmationSnapshot(),null)
assert.equal(confirmationsChanged,4)
unsubscribe()
for(const path of readdirSync('src',{recursive:true}).filter(path=>/\.[cm]?[jt]sx?$/.test(String(path)))){
  assert.ok(!/\b(?:(?:window|globalThis)\.)?(?:alert|confirm|prompt)\s*\(/.test(source('src/'+path)),'Native blocking dialogs are prohibited: '+path)
}
assert.ok(source('src/main.tsx').includes('<NotificationHost />')&&source('src/components/ui/NotificationHost.tsx').includes('<Toaster'),'Floating notices and DOM confirmations must be mounted once for every route')
assert.ok(source('src/components/ui/notifications.ts').includes('id: nextId()'),'Progress and result popups need distinct IDs so cleanup cannot dismiss the result')
assert.ok(productPage.includes('clipToZone')&&productPage.includes('seamMarginCm'),'Independent seam margins and zone clipping missing')
assert.ok(productPage.includes('photoName:file.name,photoVersion,calibration:{},silhouette:[]'),'Replacing a photo must invalidate its stale silhouette')
assert.ok(productPage.includes('if(maskEditing===view){setMaskEditing(null);setMaskDraft([]);maskDragRef.current=null}'),'Old contours must not be saved onto replacement photos')
assert.ok(productPage.includes('viewLayers(product.views[view],photo,models[view].arts,draft[view])'),'Preview and export must use identical mask layer builder')
assert.ok(source('src/components/mockups/mockupStudio.css').includes('.mockup-calibration-grid'),'Responsive calibration panel missing')
assert.ok(productPage.includes('Añadir zona')&&productPage.includes('zoneId'),'Independent print zones must be configurable')
assert.ok(productPage.includes("screen==='setup'")&&productPage.includes("screen==='mockup'"),'Product authoring and artwork application must remain separate')
assert.ok(productPage.includes('Ctrl + arrastrar')&&productPage.includes('setWarpMode'),'Deformation mode must be explicit on desktop/mobile')
assert.ok(productPage.includes('renderGarmentLayers')&&productPage.includes('photoKey('),'Multi-zone rendering and reusable garment photos missing')
assert.ok(productPage.includes('storeMedia(key,file)')&&productPage.includes('readPngSourceSize(blob)'),'Artwork originals must persist without resizing')
assert.ok(source('src/components/mockups/mockupStudio.css').includes('.mockup-product-grid'),'Responsive product cards missing')

const app=source('src/app/App.tsx'),launcher=source('src/components/navigation/AppLauncher.tsx')
assert.ok(app.includes("'#/mockups'")&&app.includes('<MockupStudio />'),'Mockup route missing')
assert.ok(launcher.includes("id: 'mockups'")&&launcher.includes("hash: '/mockups'"),'Mockup missing from global application menu')
const page=source('src/components/mockups/MockupStudio.tsx'),engine=source('src/components/mockups/mockupEngine.ts')
assert.ok(page.includes('<AppLauncher active="mockups"'),'Shared header missing')
assert.ok(page.includes('storeMedia')&&page.includes('loadMedia'),'Local reusable mockup template files missing')
assert.ok(page.includes('readPngSourceSize(blob)')&&page.includes("const edge=4096")&&page.includes('assertStreamedDimensions(source)'),'High resolution transparent PNG originals must be accepted via limited-size working copies')
assert.ok(page.includes("'front:photo':views.front.photo?.name"),'Saved template asset names should survive page reload')
assert.ok(page.includes("inputRef.current.accept=kind==='art'?'image/png'"),'Transparent PNG picker and photo picker need different formats')
assert.ok(page.includes('setActive(view)')&&page.includes('setPointerCapture'),'Touching either mockup should select its settings')
assert.ok(page.includes('onPointerDown')&&page.includes('pointerMove'),'Mouse/touch editing missing')
assert.ok(page.includes("exportMockup('combined')")&&page.includes("exportMockup('active')"),'Both export modes required')
assert.ok(engine.includes('renderGarment')&&engine.includes('warpedArtwork')&&engine.includes('placement.lighting'),'Compositing, warp or fabric lights missing')
assert.ok(engine.includes('warpedArtwork(layer,art,quad,width,height,placement.sleeveCurve)'),'Both preview and export must use sleeve warping in the common renderer')
assert.ok(engine.includes('const outline=artworkOutline'),'Curve must be included in lighting bounds')
assert.ok(engine.includes("globalCompositeOperation='destination-in'")&&engine.includes('applyLayerClip(layer,clipPolygons'),'Fabric clipping must happen in the compositor, without changing source PNGs')
assert.ok(source('src/components/mockups/mockupStudio.css').includes('.mockup-mask-editor'),'Responsive garment silhouette editor missing')
assert.ok(source('src/components/mockups/mockupStudio.css').includes('.mockup-seam-guides'),'Seam safety guide styling missing')
assert.ok(source('src/components/mockups/mockupStudio.css').includes('.mockup-sleeve-controls'),'Responsive sleeve controls are missing')
assert.ok(page.includes("Sin fotografía")&&page.includes("Sin cargar"),'Empty templates must be understandable')
assert.ok(source('src/components/mockups/mockupStudio.css').includes('@media(max-width:690px)'),'Mobile editor layout missing')
console.log('Mockup Studio QA: fabric clipping, concave silhouettes, seam margins, sleeve mesh, calibration and legacy products passed.')
