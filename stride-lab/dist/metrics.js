export const SOURCES = {
 economy: 'https://pubmed.ncbi.nlm.nih.gov/38446400/',
 cadence: 'https://link.springer.com/article/10.1186/s40798-026-01120-y',
 validation: 'https://pubmed.ncbi.nlm.nih.gov/41418503/'
};
export function oxygenCost(vo2, speed) {
 return Number.isFinite(vo2) && Number.isFinite(speed) && vo2 > 0 && vo2 <= 100 && speed >= 3 && speed <= 30 ? vo2 * 60 / speed : null;
}
const mean = xs => xs.reduce((a,b)=>a+b,0)/xs.length;
const quantile = (xs,q) => [...xs].sort((a,b)=>a-b)[Math.floor((xs.length-1)*q)];
export function cadenceFromSignal(samples) {
 // Require regular sampling and adequate duration. Do not compress missing frames.
 if(samples.length < 150 || samples.some(s=>!Number.isFinite(s.value))) return null;
 const dt = (samples.at(-1).t-samples[0].t)/(samples.length-1);
 if(dt<=0 || dt>0.055 || samples.some((s,i)=>i && Math.abs(s.t-samples[i-1].t-dt)>dt*.3)) return null;
 const center=mean(samples.map(s=>s.value)), x=samples.map(s=>s.value-center);
 if(Math.sqrt(mean(x.map(v=>v*v)))<0.025) return null;
 const lo=Math.ceil(120/240/dt), hi=Math.floor(120/100/dt);
 const correlation=lag=>{
  let ab=0,aa=0,bb=0;
  for(let i=lag;i<x.length;i++){ab+=x[i]*x[i-lag];aa+=x[i]**2;bb+=x[i-lag]**2;}
  return ab/Math.sqrt(aa*bb);
 };
 // Choose the first strong local peak with an opposite half-cycle. Global
 // maxima can incorrectly prefer the second harmonic at high cadences.
 for(let lag=lo+1;lag<hi;lag++) {
  const before=correlation(lag-1),r=correlation(lag),after=correlation(lag+1);
  if(r<.75 || r<before || r<after || correlation(Math.round(lag/2))>-.35)continue;
  const offset=.5*(before-after)/(before-2*r+after);
  const period=lag+(Number.isFinite(offset)?offset:0);
  return {spm:Math.round(120/(period*dt)),periodicity:r};
 }
 return null;
}
export function analyzeFrames(frames, angle, width, height) {
 const required=angle==='side'?[11,12,23,24,25,26,27,28]:[11,12,23,24,27,28];
 const valid=frames.filter(f=>f.points && required.every(i=>{const p=f.points[i];return p && p.visibility>=.65 && p.x>.01&&p.x<.99&&p.y>.01&&p.y<.99;}));
 const coverage=frames.length?valid.length/frames.length:0;
 const base={angle,coverage,sampledFrames:frames.length,usableFrames:valid.length,duration:frames.at(-1)?.t??0,cadence:null,trunk:null,pelvis:null};
 if(coverage<.8 || valid.length<150) return {...base,usable:false};
 const aspect=width/height;
 const tilt=valid.map(f=>{const p=f.points,sx=(p[11].x+p[12].x)/2,sy=(p[11].y+p[12].y)/2,hx=(p[23].x+p[24].x)/2,hy=(p[23].y+p[24].y)/2;return Math.atan2(Math.abs(sx-hx)*aspect,Math.abs(sy-hy))*180/Math.PI;});
 const pelvis=valid.map(f=>{const p=f.points;return Math.atan2(Math.abs(p[23].y-p[24].y),Math.abs(p[23].x-p[24].x)*aspect)*180/Math.PI;});
 // Cadence only from a continuous valid section of side-view footage.
 let longest=[],run=[];
 for(const f of frames){if(valid.includes(f)){run.push(f);if(run.length>longest.length)longest=[...run];}else run=[];}
 const signal=longest.map(f=>{const p=f.points,torso=Math.hypot(((p[11].x+p[12].x-p[23].x-p[24].x)/2)*aspect,(p[11].y+p[12].y-p[23].y-p[24].y)/2);return {t:f.t,value:(p[27].x-p[28].x)*aspect/Math.max(.05,torso)};});
 return {...base,usable:true,cadence:angle==='side'?cadenceFromSignal(signal):null,trunk:angle==='side'?quantile(tilt,.5):null,pelvis:angle!=='side'?quantile(pelvis,.5):null};
}
export function recommendations(report) {
 if(!report.usable)return [{title:'Fix the recording first',text:'Too few reliably tracked frames. Re-record 10–20 seconds in bright light with your full body and feet visible. Keep the camera still and avoid other people in frame.',source:SOURCES.validation}];
 const items=[];
 if(report.angle==='side') {
  items.push(report.cadence ? {title:'Establish your natural cadence',text:`Estimated cadence is ${report.cadence.spm} steps/min. Verify by manually counting foot contacts for 15 seconds and multiplying by four. There is no universal 180 target. Repeat at the same speed before considering a change.`,source:SOURCES.cadence} : {title:'Cadence is inconclusive',text:'A stable repeating stride signal was not found. Use a longer true side view with both ankles visible. Do not use this clip to set a cadence target.',source:SOURCES.validation});
  items.push({title:'Review posture in context',text:`Median projected torso tilt is ${report.trunk.toFixed(1)}° from vertical. This is not whole-body lean or a target to correct. Check the overlay and camera alignment; compare relaxed running at the same pace before changing posture.`,source:SOURCES.economy});
 } else items.push({title:'Check the camera before judging symmetry',text:`Median projected pelvis-line tilt is ${report.pelvis.toFixed(1)}°. Camera roll, rotation and landmark errors affect this value. It is not a diagnosis of hip drop. Re-record level and directly ${report.angle==='front'?'in front':'behind'} before drawing conclusions.`,source:SOURCES.validation});
 items.push({title:'Test one change only when there is a reason',text:'If a coach identifies a specific goal, compare a brief, comfortable cue with your usual form at the same speed, shoes and surface. Record perceived effort and repeat across sessions. Stop if pain develops. A visual change alone does not prove better economy.',source:SOURCES.cadence});
 return items;
}
