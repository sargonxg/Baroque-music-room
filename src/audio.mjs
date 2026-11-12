/** Local keyboard approximation. No recording, samples, model or network call. */
export const KEYBOARD_TIMBRES={
 harpsichord:{label:'Harpsichord',harmonicDecay:1.25,even:.55,attack:.003,release:.09,decay:1.9,sustain:.015},
 clavichord:{label:'Clavichord',harmonicDecay:2.1,even:.7,attack:.009,release:.14,decay:1.25,sustain:.025},
 piano:{label:'Piano study',harmonicDecay:1.9,even:.9,attack:.012,release:.2,decay:2.8,sustain:.025},
 organ:{label:'Small organ',harmonicDecay:2.6,even:.7,attack:.025,release:.12,decay:0,sustain:.8},
};
const bound=(v,a,b)=>Math.min(b,Math.max(a,Number.isFinite(Number(v))?Number(v):a));
export class KeyboardTransport {
 constructor(onFrame=()=>{},onEnd=()=>{}){
  this.onFrame=onFrame;this.onEnd=onEnd;this.position=0;this.rate=1;this.playing=false;
  this.volume=.42;this.nodes=new Set();this.enabled=[];this.voiceLevels=[];this.timer=null;
  this.timbre='harpsichord';this.tuning=440;this.reverb=.12;this.loop=null;this.generation=0;
 }
 load(study){
  this.pause();this.study=study;this.position=0;this.enabled=study.tracks.map(()=>true);
  this.voiceLevels=study.tracks.map(()=>1);this.loop=null;this.soloTrack=null;this.onFrame(0);return this;
 }
 initialize(){
  if(this.context)return;
  const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
  if(!Context)throw Error('Audio is unavailable here. Download the MIDI or open the source score.');
  this.context=new Context();this.master=this.context.createGain();this.master.gain.value=this.volume;
  const compressor=this.context.createDynamicsCompressor();compressor.threshold.value=-18;compressor.knee.value=18;compressor.ratio.value=8;
  this.master.connect(compressor);compressor.connect(this.context.destination);
  this.dry=this.context.createGain();this.wet=this.context.createGain();this.dry.connect(this.master);this.wet.connect(this.master);
  if(this.context.createConvolver&&this.context.createBuffer){
   this.convolver=this.context.createConvolver();const length=Math.floor(this.context.sampleRate*1.25),buffer=this.context.createBuffer(2,length,this.context.sampleRate);
   // Seeded diffuse impulse. The same short room is produced every time.
   let seed=21937;for(let channel=0;channel<2;channel++){const d=buffer.getChannelData(channel);for(let i=0;i<length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;d[i]=((seed/4294967296)*2-1)*Math.pow(1-i/length,3.4)*.22;}}
   this.convolver.buffer=buffer;this.convolver.connect(this.wet);
  }
  this.waves={};for(const [key,preset] of Object.entries(KEYBOARD_TIMBRES)){
   const real=new Float32Array(32),imag=new Float32Array(32);for(let i=1;i<32;i++)imag[i]=Math.pow(i,-preset.harmonicDecay)*(i%2?1:preset.even);
   this.waves[key]=this.context.createPeriodicWave(real,imag);
  }
  this.setReverb(this.reverb);
 }
 async play(){
  if(!this.study||this.playing)return;
  const generation=this.generation;this.initialize();await this.context.resume();
  if(generation!==this.generation||this.playing)return;
  if(this.position>=this.study.duration)this.position=this.loop?.start||0;
  this.setReverb(this.reverb);this.playing=true;this.anchor=this.context.currentTime+.03;this.origin=this.position;
  this.indices=this.study.tracks.map(t=>{const i=t.notes.findIndex(n=>n[1]>=this.position);return i<0?t.notes.length:i;});
  this.trackGains=this.study.tracks.map((_,i)=>{
   const gain=this.context.createGain();gain.gain.value=this.enabled[i]?this.voiceLevels[i]:0;
   let output=gain;
   if(this.context.createStereoPanner){const pan=this.context.createStereoPanner();pan.pan.value=this.study.tracks.length===1?0:(i/(this.study.tracks.length-1)-.5)*.34;gain.connect(pan);output=pan;gain._panner=pan;}
   output.connect(this.dry);if(this.convolver)output.connect(this.convolver);return gain;
  });
  // Rearticulate a held note after a seek, using only its remaining source duration.
  if(this.position>0)this.study.tracks.forEach((t,i)=>{for(const n of t.notes)if(n[1]<this.position&&n[1]+n[2]>this.position)this.note([n[0],this.position,n[1]+n[2]-this.position,n[3]],i);});
  this.tick();this.timer=setInterval(()=>this.tick(),25);
 }
 tick(){
  if(!this.playing)return;
  const p=this.origin+Math.max(0,this.context.currentTime-this.anchor)*this.rate;
  if(this.loop&&p>=this.loop.end){const a=this.loop.start;this.pause();this.position=a;this.onFrame(a);this.play().catch(()=>this.onEnd());return;}
  this.position=Math.min(p,this.study.duration);
  const horizon=Math.min(this.loop?.end??Infinity,p+.18*this.rate);
  this.study.tracks.forEach((t,i)=>{let index=this.indices[i];while(index<t.notes.length&&t.notes[index][1]<horizon){const note=t.notes[index++];if(note[1]>=p-.06*this.rate)this.note(note,i);}this.indices[i]=index;});
  this.onFrame(this.position);if(this.position>=this.study.duration){this.pause();this.onEnd();}
 }
 note([pitch,start,duration,velocity=1],track){
  if(!this.trackGains[track])return;
  const preset=KEYBOARD_TIMBRES[this.timbre];
  const when=Math.max(this.context.currentTime,this.anchor+(start-this.origin)/this.rate);
  const sourceDuration=Math.min(duration,(this.loop?.end??Infinity)-start),length=Math.max(.025,sourceDuration/this.rate);
  const frequency=this.tuning*Math.pow(2,(pitch-69)/12),oscillator=this.context.createOscillator(),gain=this.context.createGain();
  oscillator.setPeriodicWave(this.waves[this.timbre]);oscillator.frequency.value=frequency;
  const dynamics=bound(velocity,.12,1),register=Math.pow(440/Math.max(130,frequency),.12),peak=.035*Math.pow(dynamics,1.15)*register;
  const release=preset.release,holdEnd=when+Math.max(preset.attack+.01,length);
  gain.gain.setValueAtTime(.0001,when);gain.gain.exponentialRampToValueAtTime(peak,when+preset.attack);
  if(preset.decay){const decay=Math.max(.08,preset.decay*Math.pow(440/frequency,.17)),level=Math.max(.00012,peak*Math.exp(-Math.max(0,length-preset.attack)/decay));gain.gain.exponentialRampToValueAtTime(level,holdEnd);}
  else gain.gain.setValueAtTime(peak*preset.sustain,holdEnd);
  gain.gain.exponentialRampToValueAtTime(.0001,holdEnd+release);
  oscillator.connect(gain);gain.connect(this.trackGains[track]);oscillator.start(when);oscillator.stop(holdEnd+release+.02);
  this.nodes.add(oscillator);oscillator.onended=()=>{this.nodes.delete(oscillator);oscillator.disconnect();gain.disconnect();};
 }
 pause(){
  this.generation++;
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
 setTimbre(value){if(Object.hasOwn(KEYBOARD_TIMBRES,value))this.timbre=value;}
 setTuning(value){this.tuning=bound(value,392,466);}
 setReverb(value){this.reverb=bound(value,0,.35);if(this.dry){this.dry.gain.value=1-this.reverb*.3;this.wet.gain.value=this.convolver?this.reverb:0;}}
 setLoop(start,end){
  const a=bound(start,0,this.study?.duration||0),b=bound(end,0,this.study?.duration||0);
  if(b-a<.2)throw Error('Choose a loop at least 0.2 seconds long.');this.loop={start:a,end:b};
 }
 clearLoop(){this.loop=null;}
 async dispose(){this.pause();if(this.context?.close)await this.context.close();this.context=null;}
}
