import {test} from 'node:test';
import assert from 'node:assert/strict';
import {articulatedLength, KeyboardTransport, pianoLayers, pianoSampleRoot, phraseVelocity} from '../src/audio.mjs';
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

test('a sampled piano fetches only its required roots after Play and reuses them on a seek',async(t)=>{
 const transport=new KeyboardTransport(),context=new FakeContext();
 const requests=[],sources=[];
 t.mock.method(globalThis,'fetch',async url=>{requests.push(url);return {ok:true,arrayBuffer:async()=>new ArrayBuffer(50)};});
 context.decodeAudioData=async()=>({duration:4});
 context.createBiquadFilter=()=>({Q:parameter(),frequency:parameter(),connect(){},disconnect(){}});
 context.createBufferSource=()=>{
  const source={playbackRate:parameter(),connect(){},disconnect(){},start(time){this.attack=time;},stop(){}};
  sources.push(source);return source;
 };
 transport.load(study);transport.setTimbre('piano');transport.initialize(context);
 assert.deepEqual(requests,[]);
 await transport.play();
 assert.deepEqual(requests,['assets/instruments/piano/60.mp3','assets/instruments/piano/66.mp3']);
 assert.equal(transport.sampledPiano,true);assert.equal(sources[0].attack,.03);
 await transport.seek(2);assert.equal(requests.length,2);assert.equal(sources.length,3);
 assert(sources[1].playbackRate.value>1);assert(sources[2].playbackRate.value<1);
 await transport.dispose();
});

test('short-note shaping preserves overlapping or sustained notes and bounds sample roots',()=>{
 assert(articulatedLength(.24,.24,true)<.24);
 assert.equal(articulatedLength(.24,.20,true),.24);
 assert.equal(articulatedLength(.65,.65,true),.65);
 assert.equal(articulatedLength(.24,.24,false),.24);
 assert.equal(pianoSampleRoot(21),24);assert.equal(pianoSampleRoot(108),108);
});

test('piano neighbours keep an exact root stable and phrase shaping leaves source velocities bounded',()=>{
 assert.deepEqual(pianoLayers(60),[[60,1]]);
 const middle=pianoLayers(63);assert.equal(middle.length,2);assert.equal(middle[0][0],60);assert.equal(middle[1][0],66);assert(Math.abs(middle[0][1]-middle[1][1])<.00001);
 assert.equal(phraseVelocity(.8,.3,.3,true),.8);assert(phraseVelocity(.8,.3,.9,true)<.8);assert.equal(phraseVelocity(.8,.3,.9,false),.8);
});
