/** Local, deterministic keyboard synthesis. No recordings, network or model calls. */
export class KeyboardTransport {
 constructor(onFrame,onEnd){this.onFrame=onFrame;this.onEnd=onEnd;this.position=0;this.rate=1;this.playing=false;this.volume=.42;this.nodes=new Set();this.enabled=[];this.timer=null;}
 load(study){this.pause();this.study=study;this.position=0;this.enabled=study.tracks.map(()=>true);this.onFrame(0);}
 async play(){
  if(!this.study||this.playing)return;
  const generation=this.generation||0;
  const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
  if(!Context)throw Error('Audio is unavailable in this browser. The source MIDI and score links are still available.');
  if(!this.context){
   this.context=new Context();this.master=this.context.createGain();this.master.gain.value=this.volume;
   const compressor=this.context.createDynamicsCompressor();compressor.threshold.value=-18;compressor.knee.value=20;compressor.ratio.value=6;this.master.connect(compressor);compressor.connect(this.context.destination);
   const real=new Float32Array(24),imag=new Float32Array(24);for(let i=1;i<24;i++)imag[i]=Math.pow(i,-1.45)*(i%2?1:.45);this.wave=this.context.createPeriodicWave(real,imag);
  }
  await this.context.resume();if(generation!==(this.generation||0)||this.playing)return;if(this.position>=this.study.duration)this.position=0;
  this.playing=true;this.anchor=this.context.currentTime+.03;this.origin=this.position;
  this.indices=this.study.tracks.map(t=>((index)=>index<0?t.notes.length:index)(t.notes.findIndex(n=>n[1]>=this.position)));
  this.trackGains=this.study.tracks.map((t,i)=>{const g=this.context.createGain();g.gain.value=this.enabled[i]?1:0;g.connect(this.master);return g;});
  // Resume notes that straddle a seek point; they start here with their remaining duration.
  if(this.position>0)this.study.tracks.forEach((t,i)=>{for(const n of t.notes)if(n[1]<this.position&&n[1]+n[2]>this.position)this.note([n[0],this.position,n[1]+n[2]-this.position,n[3]],i);});
  this.tick();this.timer=setInterval(()=>this.tick(),25);
 }
 tick(){
  if(!this.playing)return;
  const p=this.origin+Math.max(0,this.context.currentTime-this.anchor)*this.rate;this.position=Math.min(p,this.study.duration);const horizon=p+.18*this.rate;
  this.study.tracks.forEach((t,i)=>{let index=this.indices[i];while(index<t.notes.length&&t.notes[index][1]<horizon){const n=t.notes[index++];if(n[1]>=p-.06*this.rate)this.note(n,i);}this.indices[i]=index;});
  this.onFrame(this.position);if(this.position>=this.study.duration){this.pause();this.onEnd();}
 }
 note([pitch,start,duration,velocity=1],track){
  const when=Math.max(this.context.currentTime,this.anchor+(start-this.origin)/this.rate),length=Math.min(4,Math.max(.07,duration/this.rate));
  const osc=this.context.createOscillator(),gain=this.context.createGain();osc.setPeriodicWave(this.wave);osc.frequency.value=440*Math.pow(2,(pitch-69)/12);
  gain.gain.setValueAtTime(.0001,when);gain.gain.exponentialRampToValueAtTime(.045*Math.min(1,Math.max(.2,velocity)),when+.004);gain.gain.exponentialRampToValueAtTime(.0001,when+length+.18);osc.connect(gain);gain.connect(this.trackGains[track]);
  osc.start(when);osc.stop(when+length+.2);this.nodes.add(osc);osc.onended=()=>{this.nodes.delete(osc);osc.disconnect();gain.disconnect();};
 }
 pause(){this.generation=(this.generation||0)+1;if(this.playing&&this.context)this.position=Math.min(this.study.duration,this.origin+Math.max(0,this.context.currentTime-this.anchor)*this.rate);this.playing=false;clearInterval(this.timer);this.timer=null;for(const node of this.nodes){try{node.stop();}catch{}}this.nodes.clear();for(const gain of this.trackGains||[])gain.disconnect();this.trackGains=[];}
 async seek(value){const running=this.playing;this.pause();this.position=Math.max(0,Math.min(this.study.duration,Number(value)||0));this.onFrame(this.position);if(running)await this.play();}
 setVoice(index,enabled){this.enabled[index]=enabled;const gain=this.trackGains?.[index];if(gain)gain.gain.setTargetAtTime(enabled?1:0,this.context.currentTime,.015);this.onFrame(this.position);}
 async setRate(rate){const running=this.playing;this.pause();this.rate=Math.max(.5,Math.min(1.5,rate));if(running)await this.play();}
 setVolume(value){this.volume=Math.max(0,Math.min(.7,value));if(this.master)this.master.gain.setTargetAtTime(this.volume,this.context.currentTime,.02);}
}
