/** Schedule the score against a local stereo grand piano. */
const bound=(v,a,b)=>Math.min(b,Math.max(a,Number.isFinite(Number(v))?Number(v):a));
const MAX_SAMPLE_BYTES = 280_000;
const PIANO_BASE = 'assets/instruments/piano/';
// Difference in dB between the two recorded attacks at each sampled root, A0 to C8.
// Measured over the first 150 ms of both channels of the distributed recordings.
const LAYER_DIFFERENCE_DB = [
 2.5,1.8,3.5,2.5,1.1,2.7,1.8,2.8,2.2,3.5,2.1,2.5,3.4,3.9,3.4,
 3.3,2.7,2.9,3.5,3.4,4.5,7.1,3.6,4.6,5.9,5.1,8.7,4.3,6.7,3.8,
];
const LAYER_SWITCH = .69;

export function pianoSampleRoot(pitch) {
 return bound(21 + Math.round((pitch - 21) / 3) * 3, 21, 108);
}

function playingTouch(velocity = .72, length = 1) {
 // Give short notes a lighter touch while retaining the relative source velocities.
 return bound(velocity,.12,1) * (1 - .1 * (1 - bound(length / .45,0,1)));
}

export function pianoSampleName(pitch, velocity, length) {
 return pianoSampleRoot(pitch) + (playingTouch(velocity,length) < LAYER_SWITCH ? '-soft.mp3' : '.mp3');
}

function pianoLayerGain(pitch, touch) {
 // Keep each real hammer timbre. Interpolate the attack level through the join
 // instead of making a one-step crescendo trigger a second, much louder recording.
 const x = bound((touch - .52) / .34, 0, 1);
 const blend = x * x * (3 - 2 * x);
 const layer = touch < LAYER_SWITCH ? 0 : 1;
 const difference = LAYER_DIFFERENCE_DB[(pianoSampleRoot(pitch) - 21) / 3];
 return 10 ** ((blend - layer) * difference / 20);
}

export function phraseVelocity(velocity,length,gap,shaped) {
 const dynamics=bound(velocity,.12,1);
 return shaped&&length<1.2&&gap>length+.12 ? dynamics*.94 : dynamics;
}

/** Lift short, separated notes slightly. Source attacks and sustained overlaps stay on the score clock. */
export function articulatedLength(length, gap, shaped) {
 if (!shaped || length > .48 || gap < length - .008) return length;
 return Math.min(length,Math.max(.021, length - Math.min(.032, length * .085)));
}

function trackTiming(notes) {
 const nextOnset = new Float64Array(notes.length), nextSameKey = new Float64Array(notes.length);
 const keyOnsets = new Map();
 let start = Infinity, following = Infinity, longest = 0;
 for (let i = notes.length - 1; i >= 0; i--) {
  const [pitch,onset,duration] = notes[i];
  if (onset < start) { following = start; start = onset; }
  nextOnset[i] = following;
  nextSameKey[i] = keyOnsets.get(pitch) ?? Infinity;
  keyOnsets.set(pitch,onset);
  longest = Math.max(longest,duration);
 }
 return {nextOnset,nextSameKey,longest};
}

function firstNoteAtOrAfter(notes, position) {
 let low = 0, high = notes.length;
 while (low < high) {
  const middle = Math.floor((low + high) / 2);
  if (notes[middle][1] < position) low = middle + 1; else high = middle;
 }
 return low;
}

export class KeyboardTransport {
 constructor(onFrame=()=>{},onEnd=()=>{}){
  this.onFrame=onFrame;this.onEnd=onEnd;this.position=0;this.rate=1;this.playing=false;
  this.volume=.42;this.nodes=new Set();this.enabled=[];this.voiceLevels=[];this.timer=null;
  this.reverb=.08;this.loop=null;this.generation=0;
  this.shaped=true;this.piano=new Map();this.pianoLoads=new Map();this.tailTimer=null;this.starting=false;
 }
 load(study){
  this.pause();this.study=study;this.position=0;this.enabled=study.tracks.map(()=>true);
  this.timing=study.tracks.map(track=>trackTiming(track.notes));
  this.sampleNames = new Set(study.tracks.flatMap(({notes}) => notes.map(([pitch,,length,velocity]) => pianoSampleName(pitch,velocity,length))));
  for (const name of this.piano.keys()) if (!this.sampleNames.has(name)) this.piano.delete(name);
  this.voiceLevels=study.tracks.map(()=>1);this.loop=null;this.soloTrack=null;this.onFrame(0);return this;
 }
 initialize(activatedContext){
  if(this.context)return;
  const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
  if(!activatedContext&&!Context)throw Error('Audio is unavailable here. Download the MIDI or open the source score.');
  this.context=activatedContext??new Context();this.master=this.context.createGain();this.master.gain.value=this.volume;
  this.sampleAbort = new AbortController();
  const compressor=this.context.createDynamicsCompressor();compressor.threshold.value=-12;compressor.knee.value=12;compressor.ratio.value=2.2;
  this.master.connect(compressor);compressor.connect(this.context.destination);
  if(this.context.createConvolver&&this.context.createBuffer){
   const length=Math.floor(this.context.sampleRate*1.25),buffer=this.context.createBuffer(2,length,this.context.sampleRate);
   // Seeded diffuse impulse. The same short room is produced every time.
   let seed=21937;for(let channel=0;channel<2;channel++){const d=buffer.getChannelData(channel);for(let i=0;i<length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;d[i]=((seed/4294967296)*2-1)*Math.pow(1-i/length,3.4)*.22;}}
   this.roomImpulse=buffer;
  }
 }
 openMixer(){
  const context=this.context, output=context.createGain(), dry=context.createGain(), wet=context.createGain();
  output.connect(this.master);dry.connect(output);wet.connect(output);
  const room=this.roomImpulse?context.createConvolver():null;
  if(room){room.buffer=this.roomImpulse;room.connect(wet);}
  this.mix={output,dry,wet,room};
  this.setReverb(this.reverb);
  this.trackGains=this.study.tracks.map((_,i)=>{
   const gain=context.createGain();
   gain.gain.value=this.enabled[i]?this.voiceLevels[i]:0;
   // Stereo position comes from the piano microphones, independent of MIDI track order.
   gain.connect(dry);if(room)gain.connect(room);
   return gain;
  });
 }
 async preparePiano(){
  const context = this.context;
  if (!context?.decodeAudioData || !context.createBufferSource) throw Error('This browser cannot play the piano samples.');
  const needed = [...this.sampleNames].filter(name=>!this.piano.has(name));
  if (!needed.length) return;
  const requestGroup = new AbortController(), lifetime = this.sampleAbort.signal;
  const cancel = () => requestGroup.abort();
  if (lifetime.aborted) cancel();
  else lifetime.addEventListener('abort',cancel,{once:true});
  const deadline = setTimeout(cancel,10_000);
  try { await Promise.all(needed.map(name=>{
   if (this.pianoLoads.has(name)) return this.pianoLoads.get(name);
   const request = fetch(PIANO_BASE + name, {credentials:'same-origin',signal:requestGroup.signal})
    .then(async response => {
     if (!response.ok || Number(response.headers.get('Content-Length')) > MAX_SAMPLE_BYTES) throw Error('Invalid piano sample');
     const bytes = await response.arrayBuffer();
     if (context !== this.context) return;
     if (!bytes.byteLength || bytes.byteLength > MAX_SAMPLE_BYTES) throw Error('Invalid piano sample');
     const buffer = await context.decodeAudioData(bytes);
     if (context === this.context && this.sampleNames.has(name)) this.piano.set(name,buffer);
    }).finally(() => {
     if (this.pianoLoads.get(name) === request) this.pianoLoads.delete(name);
    });
   this.pianoLoads.set(name,request);
   return request;
  })); } finally {
   clearTimeout(deadline);
   cancel();
   lifetime.removeEventListener('abort',cancel);
  }
 }
 async play(){
  if(!this.study||this.playing)return;
  if(this.tailTimer)this.pause();
  const generation=this.generation;
  this.initialize();
  this.starting=true;
  try {
   await this.context.resume();
   if (generation === this.generation) await this.preparePiano();
  } catch {
   if (generation !== this.generation) return;
   this.starting=false;
   throw Error('The piano samples could not load. Try again.');
  }
  if(generation!==this.generation||this.playing)return;
  if(this.position>=this.study.duration)this.position=this.loop?.start||0;
  this.openMixer();this.starting=false;this.playing=true;this.anchor=this.context.currentTime+.03;this.origin=this.position;
  this.indices=this.study.tracks.map(t=>firstNoteAtOrAfter(t.notes,this.position));
  if(this.position>0)this.study.tracks.forEach((track,i)=>{
   const earliest=this.position-this.timing[i].longest;
   for(let j=this.indices[i]-1;j>=0&&track.notes[j][1]>earliest;j--){
    const [,onset,duration]=track.notes[j];
    if(onset+duration>this.position)this.note(i,j,this.position-onset);
   }
  });
  this.tick();this.timer=setInterval(()=>this.tick(),25);
 }
 tick(){
  if(!this.playing)return;
  const p=this.origin+Math.max(0,this.context.currentTime-this.anchor)*this.rate;
  if(this.loop&&p>=this.loop.end){const a=this.loop.start;this.pause();this.position=a;this.onFrame(a);this.play().catch(()=>this.onEnd());return;}
  this.position=Math.min(p,this.study.duration);
  const horizon=Math.min(this.loop?.end??Infinity,p+.18*this.rate);
  this.study.tracks.forEach((t,i)=>{let index=this.indices[i];while(index<t.notes.length&&t.notes[index][1]<horizon){if(t.notes[index][1]>=p-.06*this.rate)this.note(i,index);index++;}this.indices[i]=index;});
  this.onFrame(this.position);
  if(this.position>=this.study.duration){
   this.playing=false;clearInterval(this.timer);this.timer=null;
   this.tailTimer=setTimeout(()=>this.pause(),420);
   this.onEnd();
  }
 }
 note(track,index,elapsed=0){
  if(!this.trackGains[track])return;
  const [pitch,start,duration,velocity=.72]=this.study.tracks[track].notes[index];
  const nextStart=this.timing[track].nextOnset[index], nextKey=this.timing[track].nextSameKey[index];
  const planned=this.anchor+(start+elapsed-this.origin)/this.rate;
  const when=Math.max(this.context.currentTime,planned);
  const sourceDuration=Math.min(duration,(this.loop?.end??Infinity)-start,nextKey-start);
  const length=articulatedLength(sourceDuration/this.rate,(nextStart-start)/this.rate,this.shaped);
  const age=elapsed/this.rate+(when-planned), remaining=length-age;
  if(remaining<=.001)return;
  const dynamics=phraseVelocity(velocity,sourceDuration,nextStart-start,this.shaped);
  const buffer=this.piano.get(pianoSampleName(pitch,velocity,duration));
  const transposition=2**((pitch-pianoSampleRoot(pitch))/12), offset=age*transposition;
  if(!buffer||offset>=buffer.duration)return;
  const source=this.context.createBufferSource(), envelope=this.context.createGain();
  source.buffer=buffer;
  source.playbackRate.value=transposition;
  const peak=.49*Math.pow(dynamics,.8)*pianoLayerGain(pitch,playingTouch(velocity,duration)), end=when+remaining;
  const naturalRelease=bound(.25+(60-pitch)*.0024,.14,.34);
  // On a repeated key the old damper cannot ring through another full release.
  const release=Math.min(naturalRelease,(nextKey-start)/this.rate-length+.048);
  envelope.gain.setValueAtTime(.0001,when);
  // Fade into a sounding string after a seek; preserve the original short hammer attack otherwise.
  const attack=age>.002 ? .008 : .002;
  envelope.gain.exponentialRampToValueAtTime(peak,when+Math.min(attack,remaining));
  envelope.gain.setValueAtTime(peak,end);
  envelope.gain.setTargetAtTime(.0001,end,release*.16);
  source.connect(envelope);envelope.connect(this.trackGains[track]);
  source.start(when,offset);source.stop(end+release+.012);
  const nodes=this.nodes;nodes.add(source);
  source.onended=()=>{nodes.delete(source);source.disconnect();envelope.disconnect();};
 }
 pause(){
  this.generation++;clearTimeout(this.tailTimer);this.tailTimer=null;
  if(this.playing&&this.context)this.position=Math.min(this.study.duration,this.origin+Math.max(0,this.context.currentTime-this.anchor)*this.rate);
  this.starting=false;this.playing=false;clearInterval(this.timer);this.timer=null;
  const mix=this.mix, gains=this.trackGains;
  if(!mix)return;
  const now=this.context.currentTime;
  mix.output.gain.setTargetAtTime(0,now,.0025);
  for(const node of this.nodes){try{node.stop(now+.022);}catch{/* Already ended. */}}
  this.nodes=new Set();this.trackGains=[];this.mix=null;
  const disconnect=()=>{
   for(const gain of gains)gain.disconnect();
   mix.dry.disconnect();mix.room?.disconnect();mix.wet.disconnect();mix.output.disconnect();
  };
  if(this.context.state==='running')setTimeout(disconnect,40);
  else disconnect();
 }
 stop(){this.pause();this.position=0;this.onFrame(0);}
 async seek(value){const wasPlaying=this.playing||this.starting;this.pause();this.position=bound(value,0,this.study.duration);this.onFrame(this.position);if(wasPlaying)await this.play();}
 setVoice(index,enabled){
  if(!Number.isInteger(index)||index<0||index>=this.enabled.length)return;
  this.enabled[index]=Boolean(enabled);const gain=this.trackGains?.[index];
  if(gain)gain.gain.setTargetAtTime(enabled?this.voiceLevels[index]:0,this.context.currentTime,.015);this.onFrame(this.position);
 }
 setVoiceLevel(index,value){if(!Number.isInteger(index)||index<0||index>=this.voiceLevels.length)return;this.voiceLevels[index]=bound(value,0,1);this.setVoice(index,this.enabled[index]);}
 setSolo(index){
  if(index===null){this.soloTrack=null;this.enabled.forEach((_,i)=>this.setVoice(i,true));return;}
  if(!Number.isInteger(index)||index<0||index>=this.enabled.length)return;
  this.soloTrack=index;this.enabled.forEach((_,i)=>this.setVoice(i,i===index));
 }
 async setRate(value){const wasPlaying=this.playing||this.starting;this.pause();this.rate=bound(value,.25,1.5);if(wasPlaying)await this.play();}
 setVolume(value){this.volume=bound(value,0,.7);if(this.master)this.master.gain.setTargetAtTime(this.volume,this.context.currentTime,.02);}
 setPhrasing(enabled){this.shaped=Boolean(enabled);}
 setReverb(value){this.reverb=bound(value,0,.35);if(this.mix){this.mix.dry.gain.value=1-this.reverb*.3;this.mix.wet.gain.value=this.mix.room?this.reverb:0;}}
 setLoop(start,end){
  const a=bound(start,0,this.study?.duration||0),b=bound(end,0,this.study?.duration||0);
  if(b-a<.2)throw Error('Choose a loop at least 0.2 seconds long.');this.loop={start:a,end:b};
 }
 clearLoop(){this.loop=null;}
 async dispose(){
  this.pause();
  this.sampleAbort?.abort();
  const context=this.context;
  this.context=null;this.roomImpulse=null;this.master=null;this.sampleAbort=null;this.piano.clear();this.pianoLoads.clear();
  if(context?.close&&context.state!=='closed')await context.close();
 }
}
