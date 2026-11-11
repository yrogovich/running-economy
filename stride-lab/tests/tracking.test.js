import test from 'node:test';
import assert from 'node:assert/strict';
import {screenedPoints,frameAtTime} from '../dist/tracking.js';
const pose=()=>Array.from({length:33},(_,i)=>({x:.6,y:i<23?.25:i<25?.5:i<27?.65:.85,visibility:.99}));
test('confident rail-like leg is hidden without modifying raw observations',()=>{
 const p=pose();p[25]={x:.4,y:.52,visibility:.99};p[27]={x:.2,y:.54,visibility:.99};
 const safe=screenedPoints(p,1920,1080);assert.equal(safe[25],null);assert.equal(safe[27],null);assert.equal(safe[31],null);assert.ok(safe[28]);assert.ok(p[27]);
});
test('ordinary legs remain, low visibility chains are withheld',()=>{
 const p=pose();assert.ok(screenedPoints(p,1920,1080)[27]);p[25].visibility=.2;assert.equal(screenedPoints(p,1920,1080)[27],null);
});
test('overlay does not freeze the last tracked pose beyond analyzed interval',()=>{
 const frames=[{t:0},{t:1/30},{t:2/30}];assert.equal(frameAtTime(frames,1/30),frames[1]);assert.equal(frameAtTime(frames,5),null);
});

test('uncertain visual estimates are retained separately from metric quality gating',()=>{const p=pose();p[25].visibility=.1;assert.ok(screenedPoints(p,1920,1080,0)[27]);assert.equal(screenedPoints(p,1920,1080)[27],null);});
