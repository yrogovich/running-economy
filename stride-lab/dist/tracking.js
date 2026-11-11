// Conservative 2D rejection heuristics, not anatomical validation or reconstruction.
export function screenedPoints(points, width, height, minimumVisibility=.65) {
 if (!points) return null;
 const out=points.map(p=>p ? {...p} : null), aspect=width/height;
 const good=p=>p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.visibility>=minimumVisibility;
 if (![11,12,23,24].every(i=>good(points[i]))) return out;
 const torso=Math.hypot((points[11].x+points[12].x-points[23].x-points[24].x)*aspect/2,(points[11].y+points[12].y-points[23].y-points[24].y)/2);
 if (!Number.isFinite(torso)||torso<.03) return out;
 for (const [hip,knee,ankle,heel,toe] of [[23,25,27,29,31],[24,26,28,30,32]]) {
  const h=points[hip],k=points[knee],a=points[ankle];
  const distance=(u,v)=>Math.hypot((u.x-v.x)*aspect,u.y-v.y);
  // High, far-reaching feet and excessive projected segments can be confident
  // hallucinations on treadmill rails. Reject the chain rather than reposition it.
  const suspect=![h,k,a].every(good) || distance(h,k)>1.5*torso || distance(k,a)>1.5*torso || (Math.abs(a.x-h.x)*aspect>1.2*torso && a.y-h.y<.45*torso);
  if(suspect) for(const i of [knee,ankle,heel,toe]) out[i]=null;
 }
 return out;
}
export function frameAtTime(frames,time) {
 if(!frames?.length || !Number.isFinite(time))return null;
 const i=Math.min(frames.length-1,Math.round(time*30)), frame=frames[i];
 return frame && Math.abs(frame.t-time)<=1/30 ? frame : null;
}
