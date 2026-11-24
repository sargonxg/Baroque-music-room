/** Schedule the score against a local stereo grand piano. */
const bound=(v,a,b)=>Math.min(b,Math.max(a,Number.isFinite(Number(v))?Number(v):a));
const MAX_SAMPLE_BYTES = 280_000;
const PIANO_BASE = 'assets/instruments/piano/';

export function pianoSampleRoot(pitch) {
 return bound(21 + Math.round((pitch - 21) / 3) * 3, 21, 108);
}

export function pianoSampleName(pitch, velocity = .72, length = 1) {
 // Give short notes a lighter touch while retaining the relative source velocities.
 const touch = bound(velocity,.12,1) * (1 - .1 * (1 - bound(length / .45,0,1)));
 return pianoSampleRoot(pitch) + (touch < .69 ? '-soft.mp3' : '.mp3');
}

export function phraseVelocity(velocity,length,gap,shaped) {
 const dynamics=bound(velocity,.12,1);
 return shaped&&length<1.2&&gap>length+.12 ? dynamics*.94 : dynamics;
}

/** Lift short, separated notes slightly. Source attacks and sustained overlaps stay on the score clock. */
export function articulatedLength(length, gap, shaped) {
 if (!shaped || length > .48 || gap < length - .008) return length;
 return Math.max(.021, length - Math.min(.032, length * .085));
}

export class KeyboardTransport {
 constructor(onFrame=()=>{},onEnd=()=>{}){
  this.onFrame=onFrame;this.onEnd=onEnd;this.position=0;this.rate=1;this.playing=false;
  this.volume=.42;this.nodes=new Set();this.enabled=[];this.voiceLevels=[];this.timer=null;
  this.reverb=.08;this.loop=null;this.generation=0;
  this.shaped=true;this.piano=new Map();this.pianoLoads=new Map();this.tailTimer=null;
 }
 load(study){
  this.pause();this.study=study;this.position=0;this.enabled=study.tracks.map(()=>true);
  this.sampleNames = new Set(study.tracks.flatMap(({notes}) => notes.map(([pitch,,length,velocity]) => pianoSampleName(pitch,velocity,length))));
  for (const name of this.piano.keys()) if (!this.sampleNames.has(name)) this.piano.delete(name);
  this.voiceLevels=study.tracks.map(()=>1);this.loop=null;this.soloTrack=null;this.onFrame(0);return this;
 }
 initialize(activatedContext){
  if(this.context)return;
  const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
  if(!Context)throw Error('Audio is unavailable here. Download the MIDI or open the source score.');
  this.context=activatedContext??new Context();this.master=this.context.createGain();this.master.gain.value=this.volume;
  this.sampleAbort = new AbortController();
  const compressor=this.context.createDynamicsCompressor();compressor.threshold.value=-12;compressor.knee.value=12;compressor.ratio.value=2.2;
  this.master.connect(compressor);compressor.connect(this.context.destination);
  this.dry=this.context.createGain();this.wet=this.context.createGain();this.dry.connect(this.master);this.wet.connect(this.master);
  if(this.context.createConvolver&&this.context.createBuffer){
   this.convolver=this.context.createConvolver();const length=Math.floor(this.context.sampleRate*1.25),buffer=this.context.createBuffer(2,length,this.context.sampleRate);
   // Seeded diffuse impulse. The same short room is produced every time.
   let seed=21937;for(let channel=0;channel<2;channel++){const d=buffer.getChannelData(channel);for(let i=0;i<length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;d[i]=((seed/4294967296)*2-1)*Math.pow(1-i/length,3.4)*.22;}}
   this.convolver.buffer=buffer;this.convolver.connect(this.wet);
  }
  this.setReverb(this.reverb);
 }
 async preparePiano(){
  const context = this.context;
  if (!context?.decodeAudioData || !context.createBufferSource) throw Error('This browser cannot play the piano samples.');
  const signal = AbortSignal.any([this.sampleAbort.signal, AbortSignal.timeout(10_000)]);
  await Promise.all([...this.sampleNames].map(name=>{
   if (this.piano.has(name)) return;
   if (this.pianoLoads.has(name)) return this.pianoLoads.get(name);
   const request = fetch(PIANO_BASE + name, {credentials:'same-origin',signal})
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
  }));
 }
 async play(){
  if(!this.study||this.playing)return;
  if(this.tailTimer)this.pause();
  const generation=this.generation;
  this.initialize();
  try {
   await this.context.resume();
   if (generation === this.generation) await this.preparePiano();
  } catch {
   if (generation !== this.generation) return;
   throw Error('The piano samples could not load. Try again.');
  }
  if(generation!==this.generation||this.playing)return;
  if(this.position>=this.study.duration)this.position=this.loop?.start||0;
  this.setReverb(this.reverb);this.playing=true;this.anchor=this.context.currentTime+.03;this.origin=this.position;
  this.nextAttacks = this.study.tracks.map(({notes})=>{
   const following=new Array(notes.length);
   let next=Infinity, start=Infinity;
   for(let i=notes.length-1;i>=0;i--){
    if(notes[i][1] < start){next=start;start=notes[i][1];}
    following[i]=next;
   }
   return following;
  });
  this.indices=this.study.tracks.map(t=>{const i=t.notes.findIndex(n=>n[1]>=this.position);return i<0?t.notes.length:i;});
  this.trackGains=this.study.tracks.map((_,i)=>{
   const gain=this.context.createGain();gain.gain.value=this.enabled[i]?this.voiceLevels[i]:0;
   let output=gain;
   if(this.context.createStereoPanner){const pan=this.context.createStereoPanner();pan.pan.value=this.study.tracks.length===1?0:(i/(this.study.tracks.length-1)-.5)*.18;gain.connect(pan);output=pan;gain._panner=pan;}
   output.connect(this.dry);if(this.convolver)output.connect(this.convolver);return gain;
  });
  // Rearticulate a held note after a seek, using only its remaining source duration.
  if(this.position>0)this.study.tracks.forEach((t,i)=>{for(const n of t.notes)if(n[1]<this.position&&n[1]+n[2]>this.position)this.note([n[0],this.position,n[1]+n[2]-this.position,n[3]],i,Infinity,n[2]);});
  this.tick();this.timer=setInterval(()=>this.tick(),25);
 }
 tick(){
  if(!this.playing)return;
  const p=this.origin+Math.max(0,this.context.currentTime-this.anchor)*this.rate;
  if(this.loop&&p>=this.loop.end){const a=this.loop.start;this.pause();this.position=a;this.onFrame(a);this.play().catch(()=>this.onEnd());return;}
  this.position=Math.min(p,this.study.duration);
  const horizon=Math.min(this.loop?.end??Infinity,p+.18*this.rate);
  this.study.tracks.forEach((t,i)=>{let index=this.indices[i];while(index<t.notes.length&&t.notes[index][1]<horizon){const note=t.notes[index++];if(note[1]>=p-.06*this.rate)this.note(note,i,this.nextAttacks[i][index-1]);}this.indices[i]=index;});
  this.onFrame(this.position);
  if(this.position>=this.study.duration){
   this.playing=false;clearInterval(this.timer);this.timer=null;
   this.tailTimer=setTimeout(()=>this.pause(),420);
   this.onEnd();
  }
 }
 note([pitch,start,duration,velocity=.72],track,nextStart=Infinity,recordedLength=duration){
  if(!this.trackGains[track])return;
  const when=Math.max(this.context.currentTime,this.anchor+(start-this.origin)/this.rate);
  const sourceDuration=Math.min(duration,(this.loop?.end??Infinity)-start);
  const length=articulatedLength(Math.max(.025,sourceDuration/this.rate),(nextStart-start)/this.rate,this.shaped);
  const dynamics=phraseVelocity(velocity,sourceDuration,nextStart-start,this.shaped);
  const buffer = this.piano.get(pianoSampleName(pitch,velocity,recordedLength));
  if (!buffer) return;
  const source=this.context.createBufferSource(), envelope=this.context.createGain();
  source.buffer=buffer;
  source.playbackRate.value=2**((pitch-pianoSampleRoot(pitch))/12);
  const peak=.49*Math.pow(dynamics,.8), end=when+Math.max(.018,length);
  const release=bound(.25+(60-pitch)*.0024,.14,.34);
  envelope.gain.setValueAtTime(.0001,when);
  envelope.gain.exponentialRampToValueAtTime(peak,when+.002);
  envelope.gain.setValueAtTime(peak,end);
  envelope.gain.setTargetAtTime(.0001,end,release*.16);
  source.connect(envelope);envelope.connect(this.trackGains[track]);
  source.start(when);source.stop(end+release+.012);
  this.nodes.add(source);
  source.onended=()=>{this.nodes.delete(source);source.disconnect();envelope.disconnect();};
 }
 pause(){
  this.generation++;clearTimeout(this.tailTimer);this.tailTimer=null;
  if(this.playing&&this.context)this.position=Math.min(this.study.duration,this.origin+Math.max(0,this.context.currentTime-this.anchor)*this.rate);
  this.playing=false;clearInterval(this.timer);this.timer=null;
  for(const node of this.nodes){try{node.stop();}catch{/* Already ended. */}}this.nodes.clear();
  for(const gain of this.trackGains||[]){gain.disconnect();gain._panner?.disconnect();}this.trackGains=[];if(this.wet)this.wet.gain.value=0;
 }
 stop(){this.pause();this.position=0;this.onFrame(0);}
 async seek(value){const wasPlaying=this.playing;this.pause();this.position=bound(value,0,this.study.duration);this.onFrame(this.position);if(wasPlaying)await this.play();}
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
 async setRate(value){const wasPlaying=this.playing;this.pause();this.rate=bound(value,.25,1.5);if(wasPlaying)await this.play();}
 setVolume(value){this.volume=bound(value,0,.7);if(this.master)this.master.gain.setTargetAtTime(this.volume,this.context.currentTime,.02);}
 setPhrasing(enabled){this.shaped=Boolean(enabled);}
 setReverb(value){this.reverb=bound(value,0,.35);if(this.dry){this.dry.gain.value=1-this.reverb*.3;this.wet.gain.value=this.convolver?this.reverb:0;}}
 setLoop(start,end){
  const a=bound(start,0,this.study?.duration||0),b=bound(end,0,this.study?.duration||0);
  if(b-a<.2)throw Error('Choose a loop at least 0.2 seconds long.');this.loop={start:a,end:b};
 }
 clearLoop(){this.loop=null;}
 async dispose(){
  this.pause();
  this.sampleAbort?.abort();
  const context=this.context;
  this.context=null;this.piano.clear();this.pianoLoads.clear();
  if(context?.close&&context.state!=='closed')await context.close();
 }
}
