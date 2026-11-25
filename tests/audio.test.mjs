import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, readdir} from 'node:fs/promises';
import {articulatedLength, KeyboardTransport, pianoSampleName, pianoSampleRoot, phraseVelocity} from '../src/audio.mjs';

const parameter=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(v,time,constant){this.value=v;this.target={v,time,constant};}});
class FakeContext {
 constructor(){this.currentTime=0;this.destination={};this.sources=[];}
 createGain(){return {gain:parameter(),connect(){},disconnect(){}};}
 createDynamicsCompressor(){return {threshold:parameter(),knee:parameter(),ratio:parameter(),connect(){}};}
 createBufferSource(){
  const source={playbackRate:parameter(),connect(){},disconnect(){},start(time,offset){this.attack=time;this.offset=offset;},stop(time){this.stopped=true;this.stopTime=time;}};
  this.sources.push(source);return source;
 }
 async decodeAudioData(){return {numberOfChannels:2,duration:6};}
 async resume(){}
}
globalThis.AudioContext=FakeContext;
globalThis.fetch=async()=>new Response(new Uint8Array(64));
const study={duration:4,tracks:[{label:'one',notes:[[60,0,1,.8],[64,2,1,.48]]}]};

test('transport starts only on play, schedules a bounded window and stops samples on pause',async()=>{
 const frames=[],t=new KeyboardTransport(p=>frames.push(p));
 t.load(study);
 assert.equal(t.context,undefined);
 assert.equal(t.playing,false);
 await t.play();
 assert.equal(t.playing,true);
 assert.equal(t.context.sources.length,1);
 assert.equal(t.context.sources[0].attack,.03);
 t.context.currentTime=.5;
 t.tick();
 assert(t.position>.4&&t.position<.6);
 t.setVoice(0,false);
 assert.equal(t.trackGains[0].gain.value,0);
 t.pause();
 assert.equal(t.playing,false);
 assert.equal(t.timer,null);
 assert.equal(t.nodes.size,0);
 assert(t.context.sources.every(o=>o.stopped));
});

test('seek and tempo changes keep their position and do not replay completed notes',async()=>{
 const t=new KeyboardTransport();
 t.load(study);
 await t.seek(3.5);await t.play();
 assert.equal(t.indices[0],2);
 assert.equal(t.context.sources.length,0);
 t.pause();await t.seek(2);await t.setRate(.75);
 assert.equal(t.position,2);assert.equal(t.rate,.75);
 await t.play();assert.equal(t.context.sources.length,1);
 t.pause();await t.seek(999);assert.equal(t.position,4);await t.seek(-5);assert.equal(t.position,0);
});

test('pausing pending audio cannot restart the transport',async()=>{
 const t=new KeyboardTransport();t.load(study);
 const pending=t.play();t.pause();await pending;
 assert.equal(t.playing,false);assert.equal(t.timer,null);assert.equal(t.context.sources.length,0);
});

test('a seek into a long note uses the same recording even just before release',async()=>{
 const t=new KeyboardTransport();
 t.load({duration:5,tracks:[{notes:[[48,0,4,.72]]}]});
 await t.seek(3.9);await t.play();
 assert.equal(t.context.sources.length,1);
 assert.equal(t.context.sources[0].playbackRate.value,1);
 assert.equal(t.context.sources[0].offset,3.9);
 assert.deepEqual([...t.piano.keys()],['48.mp3']);t.pause();
});

test('seeking into a transposed note uses its sounding age at the chosen tempo',async()=>{
 const t=new KeyboardTransport();t.load({duration:7,tracks:[{notes:[[61,0,4,.72]]}]});
 await t.seek(1);await t.setRate(.5);await t.play();
 assert.equal(t.context.sources[0].offset,2*2**(1/12));
 // This recording has already decayed at the later seek, even though the score is sustaining.
 await t.seek(3.8);
 assert.equal(t.context.sources.length,1);
 await t.dispose();
});

test('rapid scrubbing while resuming ends at the last requested position',async()=>{
 const t=new KeyboardTransport(),context=new FakeContext();
 let resume;const resumed=new Promise(done=>{resume=done;});context.resume=()=>resumed;
 t.load(study);t.initialize(context);
 const pending=[t.play(),t.seek(.2),t.seek(2.25),t.setRate(.75)];
 resume();await Promise.all(pending);
 assert.equal(t.playing,true);assert.equal(t.origin,2.25);assert.equal(t.rate,.75);
 assert.equal(context.sources.length,1);
 assert(Math.abs(context.sources[0].offset-(.25/.75)*2**(1/12))<1e-8);
 await t.dispose();
});

test('a repeated piano key damps the previous strike without shortening other voices',async()=>{
 const t=new KeyboardTransport();t.load({duration:2,tracks:[
  {notes:[[72,0,.4,.8],[72,.1,.3,.8]]},{notes:[[60,0,1,.8]]},
 ]});await t.play();
 const [oldStrike,repeat,bass]=t.context.sources;
 assert.equal(repeat.attack,.13);
 assert(oldStrike.stopTime>=repeat.attack && oldStrike.stopTime<=repeat.attack+.065);
 assert(bass.stopTime>1);
 await t.seek(.2);assert.equal(t.nodes.size,2,'only the second strike and independent bass are still sounding');
 await t.dispose();
});

test('pause fades the old signal path and a new entrance gets a separate room',async()=>{
 const t=new KeyboardTransport();t.load(study);await t.play();
 t.context.currentTime=.1;const previous=t.mix,voice=t.context.sources[0];
 t.pause();assert.equal(t.mix,null);
 assert.deepEqual(previous.output.gain.target,{v:0,time:.1,constant:.0025});
 assert(voice.stopTime>.1 && voice.stopTime<.13);
 await t.play();assert.notEqual(t.mix.output,previous.output);
 await t.dispose();
});

test('room, master and source-track levels are bounded, and solo retains explicit source tracks',async()=>{
 const t=new KeyboardTransport();
 t.load({duration:4,tracks:[...study.tracks,{notes:[[48,0,1]]}]});
 t.setReverb(.3);await t.play();assert.equal(t.reverb,.3);
 t.setVoiceLevel(0,.3);assert.equal(t.trackGains[0].gain.value,.3);
 t.setVoiceLevel(0,99);assert.equal(t.voiceLevels[0],1);
 t.setVolume(99);assert.equal(t.volume,.7);
 t.setSolo(1);assert.deepEqual(t.enabled,[false,true]);
 t.setSolo(null);assert.deepEqual(t.enabled,[true,true]);
 t.setVoice(-1,false);assert.deepEqual(t.enabled,[true,true]);t.pause();
});

test('loop controls reject invalid boundaries and stop resets position',async()=>{
 const t=new KeyboardTransport();
 t.load(study);assert.throws(()=>t.setLoop(2,2.1));assert.throws(()=>t.setLoop(3,1));
 t.setLoop(.5,3);assert.deepEqual(t.loop,{start:.5,end:3});t.clearLoop();assert.equal(t.loop,null);
 await t.seek(2);t.stop();assert.equal(t.position,0);assert.equal(t.playing,false);
 await t.dispose();assert.equal(t.context,null);
});

test('playback loads only the required stereo recordings and reuses them on a seek',async(t)=>{
 const transport=new KeyboardTransport(),context=new FakeContext(),requests=[];
 t.mock.method(globalThis,'fetch',async url=>{requests.push(url);return new Response(new Uint8Array(64));});
 transport.load(study);transport.initialize(context);
 assert.deepEqual(requests,[]);
 await transport.play();
 assert.deepEqual(requests,['assets/instruments/piano/60.mp3','assets/instruments/piano/63-soft.mp3']);
 assert.equal(context.sources[0].buffer.numberOfChannels,2);
 await transport.seek(2);
 assert.equal(requests.length,2);assert.equal(context.sources.length,2);
 assert.equal(context.sources[1].playbackRate.value,2**(1/12));
 transport.load({duration:1,tracks:[{notes:[[72,0,.25,.72]]}]});
 assert.equal(transport.piano.size,0);
 await transport.dispose();
});

test('a missing recording leaves playback stopped and can be retried',async(t)=>{
 let missing=true;
 t.mock.method(globalThis,'fetch',async()=>missing?new Response(null,{status:404}):new Response(new Uint8Array(64)));
 const transport=new KeyboardTransport();transport.load(study);
 await assert.rejects(transport.play(),/piano samples could not load/);
 assert.equal(transport.playing,false);assert.equal(transport.context.sources.length,0);
 missing=false;await transport.play();assert.equal(transport.playing,true);await transport.dispose();
});

test('playing touch is drawn from source length and dynamics without moving attacks',()=>{
 assert.equal(pianoSampleRoot(21),21);assert.equal(pianoSampleRoot(108),108);
 assert.equal(pianoSampleName(61,.72,.1),'60-soft.mp3');
 assert.equal(pianoSampleName(61,.72,.6),'60.mp3');
 assert.equal(pianoSampleName(62,.38,.6),'63-soft.mp3');
 assert(articulatedLength(.24,.24,true)<.24);
 assert.equal(articulatedLength(.24,.20,true),.24);
 assert.equal(articulatedLength(.65,.65,true),.65);
 assert.equal(articulatedLength(.24,.24,false),.24);
 assert(articulatedLength(.01,.02,true)<=.01);
 assert.equal(phraseVelocity(.8,.3,.3,true),.8);
 assert(phraseVelocity(.8,.3,.9,true)<.8);
});

test('the licensed piano bank covers every note and layer in the shipped pieces',async()=>{
 const assets=new URL('../assets/',import.meta.url);
 const bank=new URL('instruments/piano/',assets);
 const provenance=JSON.parse(await readFile(new URL('provenance.json',bank),'utf8'));
 assert.equal(provenance.channels,2);assert.equal(provenance.sampleRate,44100);assert.equal(provenance.samples.length,60);
 const names=new Set();
 for(const sample of provenance.samples){
  const data=await readFile(new URL(sample.file,bank));
  assert.equal(data.length,sample.bytes);
  assert.equal(createHash('sha256').update(data).digest('hex'),sample.sha256);
  names.add(sample.file);
 }
 const groups=await Promise.all(['curated/','music/'].map(async name=>{
  const folder=new URL(name,assets);
  return (await readdir(folder)).filter(file=>file.endsWith('.json')).map(path=>new URL(path,folder));
 }));
 const files=[new URL('../data/study.json',import.meta.url),...groups.flat()];
 assert(files.length>=108);
 for(const file of files){
  const item=JSON.parse(await readFile(file,'utf8'));
  for(const track of item.tracks)for(const [pitch,,length,velocity] of track.notes){
   assert(names.has(pianoSampleName(pitch,velocity,length)),file.pathname);
  }
 }
});
