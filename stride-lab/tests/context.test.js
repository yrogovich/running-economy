import test from 'node:test';
import assert from 'node:assert/strict';
import {captureRunContext} from '../dist/context.js';
import {validationBundle} from '../dist/validation.js';
test('optional context preserves absence rather than inventing zero measurements',()=>{const c=captureRunContext({speed:'',heartRate:'',surface:'Treadmill'});assert.equal(c.speedKmh,null);assert.equal(c.averageHeartRateBpm,null);});
test('valid context is numeric and immutable',()=>{const inputs={speed:'10.5',heartRate:'145',surface:'Treadmill'};const c=captureRunContext(inputs);inputs.speed='12';assert.equal(c.speedKmh,10.5);assert.equal(c.averageHeartRateBpm,145);assert.ok(Object.isFrozen(c));});
test('invalid or missing-sensor HR and invalid speed are rejected',()=>{for(const hr of ['0','-1','241','NaN','Infinity'])assert.throws(()=>captureRunContext({heartRate:hr}),/heart rate/);for(const speed of ['0','31','Infinity'])assert.throws(()=>captureRunContext({speed}),/speed/);});
test('validation export retains HR without using it as a metabolic label',()=>{const context=captureRunContext({speed:'10',heartRate:'145',surface:'Treadmill'});const result=validationBundle({sessionId:'session',context,clips:[{angle:'side',width:640,height:480,duration:5,frames:[{t:0,points:null}]}],reports:[]});assert.equal(result.context.averageHeartRateBpm,145);assert.equal(result.label,null);});
