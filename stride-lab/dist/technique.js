import {cadenceFromSignal,SOURCES} from './metrics.js';
import {screenedPoints} from './tracking.js';
const q=(xs,p)=>[...xs].sort((a,b)=>a-b)[Math.floor((xs.length-1)*p)];
const good=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>.01&&p.x<.99&&p.y>.01&&p.y<.99&&p.visibility>=.65;
function longestRun(frames,ids){let best=[],run=[];for(const f of frames){if(f.points&&ids.every(i=>good(f.points[i]))){run.push(f);}else{if(run.length>best.length)best=run;run=[];}}return run.length>best.length?run:best;}
function region(frames,ids){const valid=frames.filter(f=>f.points&&ids.every(i=>good(f.points[i])));return {valid,coverage:frames.length?valid.length/frames.length:0,ready:valid.length>=150&&valid.length/frames.length>=.8};}
const moment=(rows,value)=>rows.reduce((a,b)=>Math.abs(b.value-value)<Math.abs(a.value-value)?b:a).t;
export function techniqueReport(raw,angle,width,height,context={}){
 const frames=raw.map(f=>({...f,points:screenedPoints(f.points,width,height)})),aspect=width/height;
 const torso=region(frames,[11,12,23,24]),left=region(frames,[23,25,27]),right=region(frames,[24,26,28]);
 const result={version:1,angle,context:{speedKmh:context.speedKmh??null,surface:context.surface??'unknown',averageHeartRateBpm:context.averageHeartRateBpm??null},duration:raw.at(-1)?.t??0,coverage:{torso:torso.coverage,leftLeg:left.coverage,rightLeg:right.coverage},findings:[],cadence:null,priority:null};
 if(angle==='side'){
  const candidates=[];
  for(const [name,hip,knee,ankle] of [['left',23,25,27],['right',24,26,28]]){
   const run=longestRun(frames,[11,12,23,24,hip,knee,ankle]);
   const signal=run.map(f=>{const p=f.points;const scale=Math.hypot((p[11].x+p[12].x-p[23].x-p[24].x)*aspect/2,(p[11].y+p[12].y-p[23].y-p[24].y)/2);return {t:f.t,value:(p[ankle].x-p[hip].x)*aspect/Math.max(.03,scale)};});
   const cadence=cadenceFromSignal(signal);if(cadence)candidates.push({...cadence,leg:name,start:run[0].t,end:run.at(-1).t,samples:run.length});
  }
  candidates.sort((a,b)=>b.samples-a.samples);
  if(candidates.length&&!(candidates.length===2&&Math.abs(candidates[0].spm-candidates[1].spm)>8))result.cadence=candidates[0];
  if(result.cadence){const c=result.cadence;result.findings.push({id:'cadence',title:'Your natural step rhythm',value:c.spm,unit:'steps/min',range:null,coverage:frames.length?c.samples/frames.length:0,time:c.start,explanation:`Estimated from repeating movement of the ${c.leg} leg over ${(c.end-c.start).toFixed(1)} seconds. Two steps per stride are assumed.`,meaning:'Use this as your baseline at this pace, not a score. A low or high number alone does not identify a fault.',action:'Replay the clip and count both feet: count intervals between the first and last contact. Verify before setting a metronome.',source:SOURCES.cadence});}
 }
 if(torso.ready){
  const rows=torso.valid.map(f=>{const p=f.points,sx=(p[11].x+p[12].x)/2,sy=(p[11].y+p[12].y)/2,hx=(p[23].x+p[24].x)/2,hy=(p[23].y+p[24].y)/2;return {t:f.t,value:angle==='side'?Math.atan2(Math.abs(sx-hx)*aspect,Math.abs(sy-hy))*180/Math.PI:Math.atan2(Math.abs(p[23].y-p[24].y),Math.abs(p[23].x-p[24].x)*aspect)*180/Math.PI};});
  const values=rows.map(r=>r.value),median=q(values,.5),low=q(values,.1),high=q(values,.9);
  result.findings.push({id:angle==='side'?'torso':'pelvis',title:angle==='side'?'Torso position through your stride':'Pelvis line from this camera',value:+median.toFixed(1),unit:'°',range:[+low.toFixed(1),+high.toFixed(1)],coverage:torso.coverage,time:moment(rows,median),explanation:`Median projected angle; the middle 80% of frames spans ${low.toFixed(1)}–${high.toFixed(1)}°. This range describes this recording, not an accuracy interval.`,meaning:angle==='side'?'This describes your torso relative to the image vertical. It does not measure whole-body lean or tell you to lean farther forward.':'Camera roll and body rotation can tilt this line. It cannot establish hip weakness or diagnose hip drop.',action:'Use the linked frame to check that shoulder and hip points sit on your body. Compare a second recording at the same pace and camera position before changing posture.',source:SOURCES.economy});
 }
 if(angle==='side'){
  const legs=[['left',[23,25,27]],['right',[24,26,28]]].map(([name,ids])=>({name,ids,...region(frames,ids)})).filter(r=>r.ready).sort((a,b)=>b.coverage-a.coverage);
  if(legs.length){const leg=legs[0],rows=leg.valid.map(f=>{const [a,b,c]=leg.ids.map(i=>f.points[i]);const u=[(a.x-b.x)*aspect,a.y-b.y],v=[(c.x-b.x)*aspect,c.y-b.y];const den=Math.hypot(...u)*Math.hypot(...v);return {t:f.t,value:den>1e-6?Math.acos(Math.max(-1,Math.min(1,(u[0]*v[0]+u[1]*v[1])/den)))*180/Math.PI:NaN};}).filter(r=>Number.isFinite(r.value));
   if(rows.length>=150){const values=rows.map(r=>r.value),lo=q(values,.1),hi=q(values,.9);result.findings.push({id:`knee-${leg.name}`,title:`${leg.name==='left'?'Left':'Right'} knee motion`,value:Math.round(hi)-Math.round(lo),unit:'° span',range:[+lo.toFixed(0),+hi.toFixed(0)],coverage:leg.coverage,time:moment(rows,lo),explanation:`Projected knee bend spans ${lo.toFixed(0)}–${hi.toFixed(0)}° in the middle 80% of tracked frames. 180° means straight. This includes the whole stride, not just landing.`,meaning:'This lets you inspect how that leg folds and extends. It is not a landing angle, a stiffness measure, or a target for more knee lift.',action:'Review a representative bent-knee frame. If the knee or ankle point slips off the leg, disregard this observation. A front or rear view adds context but does not create a 3D measurement.',source:SOURCES.validation});}
  }
 }
 result.priority=result.cadence?'Verify your rhythm, then compare one small change':result.findings.length?'Keep your natural stride and build a repeatable baseline':'Get a recording that can support useful feedback';
 result.limitations=['No impact force, ground-contact time, overstriding diagnosis, injury prediction or economy score is inferred.','Tracking checks are heuristic; verify the overlay. Independent angles are not synchronized 3D.'];
 return result;
}
export function compareTechnique(current,previous){
 if(!previous||previous.version!==1||previous.angle!==current.angle)return {compatible:false,reason:'Save a report from the same camera view first.'};
 if(!Number.isFinite(current.context.speedKmh)||!Number.isFinite(previous.context?.speedKmh))return {compatible:false,reason:'Record speed for both sessions to compare technique at a similar pace.'};
 if(Math.abs(current.context.speedKmh-previous.context.speedKmh)>.2||current.context.surface!==previous.context.surface)return {compatible:false,reason:'Match speed (within 0.2 km/h) and surface before comparing. This matching tolerance is a product rule, not physiological equivalence.'};
 const changes=current.findings.flatMap(f=>{const old=previous.findings?.find(p=>p.id===f.id);return old&&Number.isFinite(old.value)?[{title:f.title,delta:+(f.value-old.value).toFixed(1),unit:f.unit}]:[]});
 if(Number.isFinite(current.selfReport?.effort)&&Number.isFinite(previous.selfReport?.effort))changes.push({title:'Your reported effort',delta:current.selfReport.effort-previous.selfReport.effort,unit:'/10'});
 return {compatible:true,changes,reason:'Descriptive changes only. Match shoes, camera, warm-up and effort; differences do not establish improvement.'};
}
