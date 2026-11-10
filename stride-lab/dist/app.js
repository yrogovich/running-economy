import {analyzeFrames, recommendations, oxygenCost, SOURCES} from './metrics.js';
import {validationBundle} from './validation.js';
import {captureRunContext} from './context.js';
const $=s=>document.querySelector(s), angles=['side','front','rear'];
const clips=new Map();let busy=false,loadingClip=false,cancelled=false,model=null,connections=[],reports=[],active=null,stamp=0,analysisContext=null,sessionId=null;
const video=$('#video'),canvas=$('#overlay'),ctx=canvas.getContext('2d');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function uploads(){
 $('#uploads').innerHTML=angles.map((a,i)=>`<div class="upload ${clips.has(a)?'active':''}"><label><span class="angle-icon">${['↔','↓','↑'][i]}</span><strong>${a[0].toUpperCase()+a.slice(1)} view</strong><small>${esc(clips.get(a)?.file.name || (i===0?'Recommended':'Optional'))}</small><input aria-label="Upload ${a} view video" data-angle="${a}" type="file" accept="video/*" ${busy||loadingClip?'disabled':''}></label>${clips.has(a)?`<button class="remove" data-preview="${a}" ${busy||loadingClip?'disabled':''}>Preview</button> <button class="remove" data-remove="${a}" ${busy||loadingClip?'disabled':''}>Remove</button>`:''}</div>`).join('');
 $('#analyze').disabled=busy||loadingClip||!clips.size;
}
function invalidate(){reports=[];analysisContext=null;sessionId=null;$('#paired-lab').checked=false;$('#validation-status').textContent='';$('#results').hidden=true;}
$('#uploads').addEventListener('change',async e=>{
 const file=e.target.files?.[0],angle=e.target.dataset.angle;if(!file||busy||loadingClip)return;
 if(!file.type.startsWith('video/') && !/\.(mp4|mov|webm|m4v)$/i.test(file.name)){status('Choose a video file such as MP4, MOV, or WebM.');return;}
 if(file.size>300*1024*1024){status('This prototype accepts clips up to 300 MB. Trim the clip to 5–20 seconds.');return;}
 if(clips.has(angle))URL.revokeObjectURL(clips.get(angle).url);
 clips.set(angle,{file,url:URL.createObjectURL(file),frames:[]});invalidate();uploads();
 try{await preview(angle);status('Ready. Analysis uses the first 20 seconds of each clip.');}catch(err){status(err.message);}
});
$('#uploads').addEventListener('click',async e=>{
 if(busy||loadingClip)return;
 if(e.target.dataset.preview){try{await preview(e.target.dataset.preview);}catch(err){status(err.message);}}
 const a=e.target.dataset.remove;if(!a)return;
 URL.revokeObjectURL(clips.get(a).url);clips.delete(a);invalidate();uploads();
 if(active===a){active=null;video.pause();video.removeAttribute('src');video.load();video.hidden=true;canvas.hidden=true;$('#placeholder').hidden=false;$('#viewer-label').textContent='AWAITING VIDEO';}
 status(clips.size?'Ready to analyze.':'Add at least one video to get started.');
});
function status(text){$('#status').textContent=text;}
function mediaEvent(target,event,action){return new Promise((resolve,reject)=>{
 let timer;const clean=()=>{clearTimeout(timer);target.removeEventListener(event,ok);target.removeEventListener('error',bad);};
 const ok=()=>{clean();resolve();},bad=()=>{clean();reject(new Error('This video could not be decoded. Try an H.264 MP4 clip.'));};
 target.addEventListener(event,ok,{once:true});target.addEventListener('error',bad,{once:true});timer=setTimeout(()=>{clean();reject(new Error('Video loading timed out. Try a shorter H.264 MP4 clip.'));},15000);action();
});}
async function preview(angle){
 loadingClip=true;uploads();active=angle;video.pause();canvas.hidden=true;
 try{
  await mediaEvent(video,'loadeddata',()=>{video.src=clips.get(angle).url;video.load();});
  video.hidden=false;$('#placeholder').hidden=true;$('#viewer-label').textContent=angle.toUpperCase()+' VIEW';
  canvas.width=video.videoWidth;canvas.height=video.videoHeight;draw();
 }finally{loadingClip=false;uploads();}
}

async function loadModel(){
 if(model)return;
 status('Loading pose model… First use needs an internet connection.');
 const {FilesetResolver,PoseLandmarker}=await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/vision_bundle.mjs');
 const files=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm');
 const options={baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',delegate:'GPU'},runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.6,minTrackingConfidence:.6,minPosePresenceConfidence:.6};
 try{model=await PoseLandmarker.createFromOptions(files,options);}catch{options.baseOptions.delegate='CPU';model=await PoseLandmarker.createFromOptions(files,options);}
 connections=PoseLandmarker.POSE_CONNECTIONS;
}
async function seek(t){if(Math.abs(video.currentTime-t)<.001 && video.readyState>=2)return;await mediaEvent(video,'seeked',()=>video.currentTime=t);}
$('#analyze').addEventListener('click',async()=>{
 if(busy||loadingClip||!clips.size)return;
 let context;try{context=captureRunContext({speed:$('#speed').value,heartRate:$('#heart-rate').value,surface:$('#surface').value});}catch(err){status(err.message);return;}
 busy=true;cancelled=false;invalidate();uploads();$('#cancel').hidden=false;$('#progress').hidden=false;$('#progress').value=0;video.controls=false;
 try{
  analysisContext=context;sessionId=crypto.randomUUID();
  await loadModel();let index=0;
  for(const [angle,clip] of clips){
   if(cancelled)break;await preview(angle);video.controls=false;
   if(!Number.isFinite(video.duration)||video.duration<5)throw new Error('Each clip must be at least 5 seconds long and have a readable duration.');
   clip.width=video.videoWidth;clip.height=video.videoHeight;clip.duration=video.duration;
   const duration=Math.min(video.duration,20),frames=[];
   for(let frameIndex=0;frameIndex<Math.floor(duration*30);frameIndex++){
    const t=frameIndex/30;
    if(cancelled)break;await seek(t);stamp+=1000/30;
    const result=model.detectForVideo(video,stamp),points=result.landmarks[0]||null;
    frames.push({t,points});clip.frames=frames;draw(points);
    $('#progress').value=((index+t/duration)/clips.size)*100;
    if(frames.length%10===0){status(`Tracking ${angle} view · ${Math.round(t/duration*100)}%`);await new Promise(r=>setTimeout(r,0));}
   }
   if(cancelled)break;
   const report=analyzeFrames(frames,angle,video.videoWidth,video.videoHeight);report.fileName=clip.file.name;report.advice=recommendations(report);reports.push(report);index++;
  }
  if(cancelled){reports=[];for(const clip of clips.values())clip.frames=[];ctx.clearRect(0,0,canvas.width,canvas.height);status('Analysis cancelled. You can try again.');}
  else{renderReports();$('#progress').value=100;status('Analysis complete. Review the overlay and quality notes before interpreting measurements.');await seek(0);draw();}
 }catch(err){reports=[];for(const clip of clips.values())clip.frames=[];ctx.clearRect(0,0,canvas.width,canvas.height);status(`Analysis stopped: ${err.message}. If model loading failed, check your connection and retry.`);}
 finally{busy=false;uploads();$('#cancel').hidden=true;$('#progress').hidden=true;video.controls=true;}
});
$('#cancel').addEventListener('click',()=>{cancelled=true;status('Cancelling after the current frame…');});
function draw(points){
 ctx.clearRect(0,0,canvas.width,canvas.height);canvas.hidden=!$('#skeleton').checked;
 if(!points){const frames=clips.get(active)?.frames;if(!frames?.length)return;points=frames[Math.min(frames.length-1,Math.round(video.currentTime*30))]?.points;}
 if(!points)return;
 const good=p=>p && (p.visibility??0)>.65;
 ctx.strokeStyle='#b6f379';ctx.fillStyle='#e9ffce';ctx.lineWidth=Math.max(2,canvas.width/350);
 for(const {start,end} of connections){const a=points[start],b=points[end];if(!good(a)||!good(b))continue;ctx.beginPath();ctx.moveTo(a.x*canvas.width,a.y*canvas.height);ctx.lineTo(b.x*canvas.width,b.y*canvas.height);ctx.stroke();}
 for(const p of points){if(!good(p))continue;ctx.beginPath();ctx.arc(p.x*canvas.width,p.y*canvas.height,Math.max(3,canvas.width/230),0,Math.PI*2);ctx.fill();}
}
video.addEventListener('timeupdate',()=>{if(!busy)draw();});video.addEventListener('seeked',()=>{if(!busy)draw();});$('#skeleton').addEventListener('change',()=>draw());
function renderReports(){
 $('#results').hidden=false;
 $('#recorded-context').textContent=`Context captured at analysis: ${analysisContext.speedKmh??'unknown'} km/h · ${analysisContext.surface} · ${analysisContext.averageHeartRateBpm??'unknown'} bpm. If incorrect, rerun analysis before pairing a lab label.`;
 $('#reports').innerHTML=reports.map(r=>`<article class="panel report"><div class="section-top"><h2>${esc(r.angle[0].toUpperCase()+r.angle.slice(1))} view</h2><span class="pill">${r.usable?'EXPERIMENTAL MEASUREMENTS':'RECORDING NEEDS IMPROVEMENT'}</span></div><p class="muted">${Math.round(r.coverage*100)}% usable frames · ${r.duration.toFixed(1)} seconds sampled · ${esc(r.fileName)}</p>${r.usable?`<div class="metrics"><div class="metric"><span>Estimated cadence</span><b>${r.cadence?r.cadence.spm:'—'}</b><small>${r.cadence?'steps/min · verify manually':r.angle==='side'?'No stable signal':'Requires side view'}</small></div><div class="metric"><span>${r.angle==='side'?'Projected torso tilt':'Projected pelvis-line tilt'}</span><b>${(r.trunk??r.pelvis).toFixed(1)}°</b><small>Median 2D angle · no ideal target</small></div><div class="metric"><span>Running economy</span><b>Unmeasured</b><small>Requires metabolic testing</small></div></div>`:''}${r.advice.map(a=>`<div class="advice"><h3>${esc(a.title)}</h3><p>${esc(a.text)}</p><a href="${a.source}" target="_blank" rel="noreferrer">Evidence & limitations ↗</a></div>`).join('')}<p class="fine">Tracking visibility is a model signal, not a calibrated probability of accuracy. Quality cutoffs are prototype heuristics. No ground-contact time, force, injury-risk, or 3D reconstruction is inferred.</p></article>`).join('');
}
function lab(){const cost=oxygenCost(Number($('#vo2').value),Number($('#speed').value));$('#lab-result').textContent=cost?`${cost.toFixed(1)} mL O₂/kg/km — calculated oxygen cost`:'Enter valid oxygen uptake (1–100) and speed (3–30 km/h).';}
$('#vo2').addEventListener('input',lab);$('#speed').addEventListener('input',lab);
$('#export').addEventListener('click',()=>{
 const output={app:'Stride Lab research prototype',generatedAt:new Date().toISOString(),evidenceReviewed:'2026-11-10',context:analysisContext,standaloneLabCalculator:{pairedWithVideo:false,steadyStateVo2MlKgMin:Number($('#vo2').value)||null,speedKmh:Number($('#speed').value)||null,oxygenCostMlKgKm:oxygenCost(Number($('#vo2').value),Number($('#speed').value))},limitations:['No validated video-to-metabolic-cost model','Independent views; no synchronized 3D reconstruction','Experimental, unvalidated 2D metrics; not diagnosis'],sources:SOURCES,reports};
 const url=URL.createObjectURL(new Blob([JSON.stringify(output,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='stride-lab-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('#export-pose').addEventListener('click',()=>{
 try{
  const output=validationBundle({sessionId,context:analysisContext,clips:[...clips].map(([angle,c])=>({...c,angle})),reports,lab:{confirmed:$('#paired-lab').checked,runnerCode:$('#runner-code').value.trim(),vo2:Number($('#vo2').value)}});
  const url=URL.createObjectURL(new Blob([JSON.stringify(output)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`stride-lab-validation-${sessionId}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  $('#validation-status').textContent=output.label?'Downloaded with your explicitly paired lab label. No data was sent to a server.':'Downloaded without a lab label. No data was sent to a server.';
 }catch(err){$('#validation-status').textContent=err.message;}
});
$('#vo2').addEventListener('input',()=>{$('#paired-lab').checked=false;});
window.addEventListener('beforeunload',()=>{for(const c of clips.values())URL.revokeObjectURL(c.url);model?.close();});uploads();
