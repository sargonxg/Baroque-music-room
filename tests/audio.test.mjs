import {test} from 'node:test';
import assert from 'node:assert/strict';
import {KeyboardTransport} from '../src/audio.mjs';
const parameter=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(v){this.value=v;}});
class FakeContext {
 constructor(){this.currentTime=0;this.destination={};this.oscillators=[];}
 createGain(){return {gain:parameter(),connect(){},disconnect(){}};}
 createDynamicsCompressor(){return {threshold:parameter(),knee:parameter(),ratio:parameter(),connect(){}};}
 createPeriodicWave(){return {};}
 createOscillator(){const o={frequency:{value:0},connect(){},disconnect(){},setPeriodicWave(){},start(v){this.startTime=v;},stop(){this.stopped=true;}};this.oscillators.push(o);return o;}
 async resume(){}
}
globalThis.AudioContext=FakeContext;
const study={duration:4,tracks:[{label:'one',notes:[[60,0,1,1],[64,2,1,1]]}]};
test('transport starts only on play, schedules a bounded window and stops all oscillators on pause',async()=>{
 const frames=[],t=new KeyboardTransport(p=>frames.push(p),()=>{});t.load(study);assert.equal(t.context,undefined);assert.equal(t.playing,false);
 await t.play();assert.equal(t.playing,true);assert.equal(t.context.oscillators.length,1);assert(t.context.oscillators[0].startTime>=0);
 t.context.currentTime=.5;t.tick();assert(t.position>.4&&t.position<.6);t.setVoice(0,false);assert.equal(t.trackGains[0].gain.value,0);t.pause();assert.equal(t.playing,false);assert.equal(t.timer,null);assert.equal(t.nodes.size,0);assert(t.context.oscillators.every(o=>o.stopped));
});
test('seeking/rate changes retain position and seeking after the last onset does not replay earlier notes',async()=>{
 const t=new KeyboardTransport(()=>{},()=>{});t.load(study);await t.seek(3.5);await t.play();assert.equal(t.indices[0],2);assert.equal(t.context.oscillators.length,0);t.pause();await t.seek(2);await t.setRate(.75);assert.equal(t.position,2);assert.equal(t.rate,.75);await t.play();assert.equal(t.context.oscillators.length,1);t.pause();await t.seek(999);assert.equal(t.position,4);await t.seek(-5);assert.equal(t.position,0);
});
test('a paused pending audio resume cannot restart a stopped transport',async()=>{
 const t=new KeyboardTransport(()=>{},()=>{});t.load(study);const pending=t.play();t.pause();await pending;assert.equal(t.playing,false);assert.equal(t.timer,null);assert.equal(t.context.oscillators.length,0);
});

test('seeking into a sustained note restarts only its remaining duration',async()=>{
 const t=new KeyboardTransport(()=>{},()=>{});t.load({duration:5,tracks:[{notes:[[48,0,4,1]]}]});await t.seek(2);await t.play();assert.equal(t.context.oscillators.length,1);assert.equal(t.context.oscillators[0].frequency.value,440*Math.pow(2,(48-69)/12));t.pause();
});

test('timbre, tuning, room and source-track gain controls are bounded',async()=>{
 const t=new KeyboardTransport(()=>{},()=>{});t.load(study);t.setTimbre('organ');assert.equal(t.timbre,'organ');t.setTimbre('not a preset');assert.equal(t.timbre,'organ');t.setTuning(415);t.setReverb(.3);await t.play();assert.equal(t.tuning,415);assert.equal(t.reverb,.3);t.setVoiceLevel(0,.3);assert.equal(t.trackGains[0].gain.value,.3);t.setVoiceLevel(0,99);assert.equal(t.voiceLevels[0],1);t.setVolume(99);assert.equal(t.volume,.7);t.pause();
});
test('solo and all-together preserve explicit track selection',()=>{
 const t=new KeyboardTransport(()=>{},()=>{});t.load({duration:4,tracks:[{notes:[[60,0,1]]},{notes:[[48,0,1]]}]});t.setSolo(1);assert.deepEqual(t.enabled,[false,true]);t.setSolo(null);assert.deepEqual(t.enabled,[true,true]);t.setVoice(-1,false);assert.deepEqual(t.enabled,[true,true]);
});
test('loop controls reject invalid boundaries and stop resets position',async()=>{
 const t=new KeyboardTransport(()=>{},()=>{});t.load(study);assert.throws(()=>t.setLoop(2,2.1));assert.throws(()=>t.setLoop(3,1));t.setLoop(.5,3);assert.deepEqual(t.loop,{start:.5,end:3});t.clearLoop();assert.equal(t.loop,null);await t.seek(2);t.stop();assert.equal(t.position,0);assert.equal(t.playing,false);await t.dispose();assert.equal(t.context,null);
});
