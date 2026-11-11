import {oxygenCost} from './metrics.js';

// Export only an explicit data contract, never File objects, paths, or blob URLs.
export function validationBundle({sessionId, context, clips, reports, lab}) {
 if(!sessionId || !context || !clips.length || clips.some(c=>!c.frames?.length))throw new Error('Complete an analysis before exporting pose data.');
 let label=null;
 if(lab?.confirmed){
  if(!/^[a-zA-Z0-9_-]{3,40}$/.test(lab.runnerCode??''))throw new Error('Use a runner code of 3–40 letters, digits, underscores, or hyphens. Use the same code across this runner’s sessions.');
  const cost=oxygenCost(lab.vo2,context.speedKmh);
  if(cost===null)throw new Error('A paired lab label needs valid oxygen uptake and the speed recorded when analysis started.');
  label={kind:'user_attested_steady_state_lab_measurement',runnerCode:lab.runnerCode,vo2MlKgMin:lab.vo2,speedKmh:context.speedKmh,oxygenCostMlKgKm:cost,independentlyVerified:false};
 }
 return {schema:'stride-lab.pose-session',schemaVersion:1,sessionId,generatedAt:new Date().toISOString(),
  extractor:{name:'MediaPipe Pose Landmarker heavy',version:'0.10.32',requestedSamplingHz:30,coordinates:'x/y normalized to image dimensions; z is model-relative depth, not calibrated metres',landmarkCount:33},
  context:{speedKmh:context.speedKmh,surface:context.surface,averageHeartRateBpm:context.averageHeartRateBpm??null},label,
  limitations:['Views are independent; not synchronized 3D.','Requested sample times may differ from decoded frame times.','Visibility is not calibrated measurement accuracy.','User-attested labels require review before model training.'],
  clips:clips.map(c=>({angle:c.angle,width:c.width,height:c.height,sourceDurationSeconds:c.duration,
   observations:reports.find(r=>r.angle===c.angle)?Object.fromEntries(Object.entries(reports.find(r=>r.angle===c.angle)).filter(([k])=>!['fileName','advice'].includes(k))):null,
   frames:c.frames.map(f=>({requestedTimeSeconds:f.t,landmarks:f.points?.map(p=>Object.fromEntries(['x','y','z','visibility'].map(k=>[k,Number.isFinite(p[k])?p[k]:null])))??null}))
  }))};
}
