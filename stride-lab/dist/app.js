import {techniqueReport,compareTechnique} from './technique.js';
import {screenedPoints,frameAtTime} from './tracking.js';
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
 try{await preview(angle);status('Ready. Analysis tracks the full clip at 30 samples per second. Longer clips take more time.');}catch(err){status(err.message);}
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
 const options={baseOptions:{modelAssetPath:'./models/pose_landmarker_heavy.task',delegate:'GPU'},runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.6,minTrackingConfidence:.6,minPosePresenceConfidence:.6};
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
  if(model){model.close();model=null;}
  await loadModel();let index=0;
  for(const [angle,clip] of clips){
   if(cancelled)break;await preview(angle);video.controls=false;
   // Start each independent view with fresh temporal tracking state.
   if(index>0){model.close();model=null;await loadModel();}
   if(!Number.isFinite(video.duration)||video.duration<5)throw new Error('Each clip must be at least 5 seconds long and have a readable duration.');
   clip.width=video.videoWidth;clip.height=video.videoHeight;clip.duration=video.duration;
   const duration=video.duration,frames=[];
   for(let frameIndex=0;frameIndex<Math.floor(duration*30);frameIndex++){
    const t=frameIndex/30;
    if(cancelled)break;await seek(t);stamp+=1000/30;
    const result=model.detectForVideo(video,stamp),points=result.landmarks[0]||null;
    frames.push({t,points});clip.frames=frames;draw(points);
    $('#progress').value=((index+t/duration)/clips.size)*100;
    if(frames.length%10===0){status(`Tracking ${angle} view · ${Math.round(t/duration*100)}%`);await new Promise(r=>setTimeout(r,0));}
   }
   if(cancelled)break;
   const report=analyzeFrames(frames,angle,video.videoWidth,video.videoHeight);report.technique=techniqueReport(frames,angle,video.videoWidth,video.videoHeight,analysisContext);report.fileName=clip.file.name;report.advice=recommendations(report);reports.push(report);index++;
  }
  if(cancelled){reports=[];for(const clip of clips.values())clip.frames=[];ctx.clearRect(0,0,canvas.width,canvas.height);status('Analysis cancelled. You can try again.');}
  else{renderReports();$('#progress').value=100;status('Analysis complete. Review the overlay and quality notes before interpreting measurements.');await seek(0);draw();}
 }catch(err){reports=[];for(const clip of clips.values())clip.frames=[];ctx.clearRect(0,0,canvas.width,canvas.height);status(`Analysis stopped: ${err.message}. If model loading failed, check your connection and retry.`);}
 finally{busy=false;uploads();$('#cancel').hidden=true;$('#progress').hidden=true;video.controls=true;}
});
$('#cancel').addEventListener('click',()=>{cancelled=true;status('Cancelling after the current frame…');});
function draw(points,mediaTime=video.currentTime){
 ctx.clearRect(0,0,canvas.width,canvas.height);canvas.hidden=!$('#skeleton').checked;
 if(!points){const frames=clips.get(active)?.frames;if(!frames?.length)return;points=frameAtTime(frames,mediaTime)?.points;}
 if(!points)return;
 points=screenedPoints(points,canvas.width,canvas.height,0);
 const good=p=>p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x>=0 && p.x<=1 && p.y>=0 && p.y<=1;
 ctx.strokeStyle='#b6f379';ctx.fillStyle='#e9ffce';ctx.lineWidth=Math.max(2,canvas.width/350);
 for(const {start,end} of connections){const a=points[start],b=points[end];if(!good(a)||!good(b))continue;const uncertain=Math.min(a.visibility??0,b.visibility??0)<.65;ctx.strokeStyle=uncertain?'#ffc46b':'#b6f379';ctx.setLineDash(uncertain?[canvas.width/100,canvas.width/150]:[]);ctx.beginPath();ctx.moveTo(a.x*canvas.width,a.y*canvas.height);ctx.lineTo(b.x*canvas.width,b.y*canvas.height);ctx.stroke();}
 ctx.setLineDash([]);
 for(const p of points){if(!good(p))continue;ctx.fillStyle=(p.visibility??0)<.65?'#ffc46b':'#e9ffce';ctx.beginPath();ctx.arc(p.x*canvas.width,p.y*canvas.height,Math.max(3,canvas.width/230),0,Math.PI*2);ctx.fill();}
}
video.addEventListener('timeupdate',()=>{if(!busy)draw();});video.addEventListener('seeked',()=>{if(!busy)draw();});$('#skeleton').addEventListener('change',()=>draw());
// Use the timestamp of the displayed video frame, not sparse timeupdate events.
if(video.requestVideoFrameCallback){
 const onFrame=(_now,metadata)=>{if(!busy)draw(undefined,metadata.mediaTime);video.requestVideoFrameCallback(onFrame);};
 video.requestVideoFrameCallback(onFrame);
}
function renderReports(){
 $('#results').hidden=false;
 $('#recorded-context').textContent=`Context captured at analysis: ${analysisContext.speedKmh??'unknown'} km/h · ${analysisContext.surface} · ${analysisContext.averageHeartRateBpm??'unknown'} bpm. If incorrect, rerun analysis before pairing a lab label.`;
 $('#reports').innerHTML=reports.map(r=>renderTechnique(r)).join('');
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

function renderTechnique(r){
 const t=r.technique;if(!t)return '';
 const pct=x=>`${Math.round(x*100)}%`;
 let baseline=null;try{baseline=JSON.parse(localStorage.getItem(`stride-baseline-${r.angle}`)||'null');}catch{}
 const comparison=compareTechnique(t,baseline);
 const pace=t.context.speedKmh?`${t.context.speedKmh} km/h`:'Speed not recorded';
 return `<article class="panel technique-report"><div class="section-top"><div><p class="eyebrow">${esc(r.angle.toUpperCase())} VIEW · PERSONAL BASELINE</p><h2>${esc(t.priority)}</h2></div><span class="pill">${t.findings.length} supported observations</span></div><p class="muted">${esc(pace)} · ${esc(t.context.surface)} · ${t.duration.toFixed(1)} seconds · ${t.context.averageHeartRateBpm?`${t.context.averageHeartRateBpm} bpm`:'Heart rate not recorded'}</p>
 <div class="report-summary"><strong>Your first priority</strong><p>${t.cadence?`Your visible leg supports an estimated ${t.cadence.spm} steps/min. Confirm it against the video before trying a cadence cue. There is no automatic reason to change your current rhythm.`:t.findings.length?'The visible regions support a technique baseline. Keep your natural stride for now; this clip does not establish a movement fault to fix.':'The tracking does not support a technique prescription. Record again with a clear full-body view so the report can give specific observations.'}</p></div>
 <details class="tracking-breakdown"><summary>What this video can support</summary><div class="coverage-grid"><span>Torso <b>${pct(t.coverage.torso)}</b></span><span>Left leg <b>${pct(t.coverage.leftLeg)}</b></span><span>Right leg <b>${pct(t.coverage.rightLeg)}</b></span></div><p class="fine">Share of frames passing regional tracking checks, not a probability of correctness. An obscured leg does not invalidate a clearly tracked torso or the other leg.</p></details>
 <div class="finding-grid">${t.findings.map((f,i)=>`<section class="finding"><p class="eyebrow">OBSERVATION ${i+1}</p><h3>${esc(f.title)}</h3><div class="finding-value">${f.value}<small>${esc(f.unit)}</small></div><p>${esc(f.explanation)}</p><h4>What it means for you</h4><p>${esc(f.meaning)}</p><h4>Your next check</h4><p>${esc(f.action)}</p><button class="secondary" data-moment="${f.time}" data-view="${r.angle}">See evidence at ${f.time.toFixed(1)}s ↗</button><p class="fine">${pct(f.coverage)} relevant frames · experimental 2D observation</p><a class="fine" href="${f.source}" target="_blank" rel="noreferrer">Research and limits ↗</a></section>`).join('')}</div>
 ${!t.cadence?'<div class="advice"><h3>Cadence needs another check</h3><p>No sufficiently consistent stride signal passed the checks. Use a watch reading or manually count visible contacts; the report will not invent a step rate.</p></div>':''}
 <section class="next-run"><p class="eyebrow">YOUR NEXT RUN · A SIMPLE COMPARISON</p><h3>Build evidence before changing your form</h3><ol><li><b>Start with your usual easy running.</b> Once settled, record 15–20 seconds at a steady speed. Note shoes, surface and how hard it feels on a 0–10 scale.</li><li><b>Verify the overlay.</b> Use the evidence buttons above. Disregard any observation whose points do not follow the body.</li><li><b>Repeat under the same conditions.</b> Save this baseline, then compare another recording at the same speed, camera position and surface. A repeatable difference is more useful than a single “perfect” frame.</li></ol>
 ${t.cadence?`<details><summary>Optional experiment: a small cadence change</summary><p>This is an experiment, not a correction diagnosed from your clip. Only try it if your counted cadence agrees with ${t.cadence.spm} steps/min and you are running comfortably without pain.</p><p>After settling into easy running, try 3 × 30 seconds at about <b>${Math.round(t.cadence.spm*1.05)} steps/min</b> (+5%), with 60 seconds at your normal rhythm between trials. Keep speed unchanged; let steps shorten naturally. Do not force a forefoot strike.</p><p>Compare comfort and effort immediately and the following day. Stop for pain or an awkward, forced stride. Keep the cue only if it feels comfortable repeatedly; neither a prettier video nor lower short-term heart rate proves better running economy.</p><p class="fine">This brief comparison is a product-designed trial, not a validated treatment protocol. <a href="https://pubmed.ncbi.nlm.nih.gov/31264286/" target="_blank" rel="noreferrer">Research on cadence retraining</a> supports that cadence can change; it does not prove this cue will improve your performance.</p></details>`:''}</section>
 <section class="comparison"><h3>Compare with your saved baseline</h3><p>${esc(comparison.reason)}</p>${comparison.compatible?`<ul>${comparison.changes.map(c=>`<li>${esc(c.title)}: <b>${c.delta>0?'+':''}${c.delta} ${esc(c.unit)}</b></li>`).join('')}</ul>`:''}<button class="secondary" data-baseline="${r.angle}">Save this as my baseline</button> <button class="remove" data-clear-baseline="${r.angle}">Clear saved baseline</button><p class="fine">Only this report’s numbers and context are saved in this browser. No video or skeleton coordinates. Saving replaces the previous baseline for this view.</p><p class="baseline-status" role="status"></p></section>
 <details class="report-limits"><summary>What this report cannot tell you</summary>${t.limitations.map(x=>`<p class="fine">${esc(x)}</p>`).join('')}<p class="fine">A visual difference is not proof of faster or more economical running. Pain or injury rehabilitation needs an individual clinical assessment.</p></details></article>`;
}
$('#reports').addEventListener('click',async e=>{
 const moment=e.target.closest('[data-moment]');
 if(moment&&!busy&&!loadingClip){try{if(active!==moment.dataset.view)await preview(moment.dataset.view);video.pause();await seek(Number(moment.dataset.moment));draw();video.scrollIntoView({behavior:'smooth',block:'center'});}catch(err){status(err.message);}return;}
 const save=e.target.closest('[data-baseline]'),clear=e.target.closest('[data-clear-baseline]');if(!save&&!clear)return;
 const angle=save?.dataset.baseline??clear.dataset.clearBaseline;
 try{if(save){const report=reports.find(r=>r.angle===angle)?.technique;if(!report)return;localStorage.setItem(`stride-baseline-${angle}`,JSON.stringify(report));}else localStorage.removeItem(`stride-baseline-${angle}`);renderReports();const panel=[...$('#reports').children].find(p=>p.querySelector('[data-baseline]')?.dataset.baseline===angle);if(panel)panel.querySelector('.baseline-status').textContent=save?'Baseline saved on this device.':'Saved baseline cleared.';}catch{e.target.closest('.comparison').querySelector('.baseline-status').textContent='Browser storage is unavailable. Export your report to keep a copy.';}
});
$('#print-report').addEventListener('click',()=>window.print());
