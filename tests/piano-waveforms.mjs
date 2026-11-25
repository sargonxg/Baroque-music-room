/** Quantitative browser check. Serve the repository root with a static HTTP server,
 * then run (await import('/tests/piano-waveforms.mjs')).verifyPianoWaveforms().
 * OfflineAudioContext renders the actual recorded samples without speaker output.
 */
import {KeyboardTransport} from '../src/audio.mjs';

const SAMPLE_RATE = 44_100;
function rms(buffer, start, end) {
 const from = Math.round(start * SAMPLE_RATE), to = Math.min(buffer.length,Math.round(end * SAMPLE_RATE));
 let energy = 0;
 for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
  const data = buffer.getChannelData(channel);
  for (let i = from; i < to; i++) energy += data[i] ** 2;
 }
 return Math.sqrt(energy / ((to - from) * buffer.numberOfChannels));
}
const db = ratio => 20 * Math.log10(Math.max(1e-10,ratio));
const rounded = value => Number(value.toFixed(3));

export async function verifyPianoWaveforms() {
 const recordings = new Map();
 async function render(tracks, {seconds = .2, seek = 0, rate = 1, mute = null} = {}) {
  const offline = new OfflineAudioContext(2,Math.ceil(seconds * SAMPLE_RATE),SAMPLE_RATE);
  const transport = new KeyboardTransport();
  // Offline contexts begin with startRendering(), while a live transport resumes on user input.
  transport.initialize(new Proxy(offline,{get(context,key) {
   if (key === 'resume') return async () => {};
   const value = context[key];
   return typeof value === 'function' ? value.bind(context) : value;
  }}));
  try {
   transport.load({duration:8,tracks:tracks.map(notes=>({notes}))});
   for (const name of transport.sampleNames) {
    if (!recordings.has(name)) {
     const response = await fetch(new URL('../assets/instruments/piano/'+name,import.meta.url));
     if (!response.ok) throw Error('Missing local piano recording '+name);
     recordings.set(name,await offline.decodeAudioData(await response.arrayBuffer()));
    }
    transport.piano.set(name,recordings.get(name));
   }
   transport.setReverb(0);
   if (mute !== null) transport.setVoice(mute,false);
   await transport.setRate(rate);await transport.seek(seek);await transport.play();
   // All notes in these fixtures begin together. Preserve their scheduled times on the offline clock.
   clearInterval(transport.timer);
   return await offline.startRendering();
  } finally { await transport.dispose(); }
 }
 const layerJumps=[];
 for(let pitch=21;pitch<=108;pitch+=3) {
  const soft=await render([[[pitch,0,1,.6899]]]), medium=await render([[[pitch,0,1,.6901]]]);
  layerJumps.push(Math.abs(db(rms(medium,.036,.186)/rms(soft,.036,.186))));
 }
 const held=[[[69,0,5,.8]]], full=await render(held,{seconds:2.9}), resumed=await render(held,{seconds:.4,seek:2.4});
 const resumedDb=db(rms(resumed,.14,.37)/rms(full,2.54,2.77));
 const shifted=[[[61,0,3,.72]]], slow=await render(shifted,{seconds:2.3,rate:.75});
 const slowSeek=await render(shifted,{seconds:.3,seek:1.5,rate:.75});
 const slowResumedDb=db(rms(slowSeek,.09,.27)/rms(slow,2.09,2.27));
 const upper=[[72,0,1,.8]], bass=[[42,0,1,.7]];
 const together=await render([upper,bass],{mute:1}), alone=await render([upper]);
 const referenceLevel=rms(alone,.05,.16);
 const soloLevelDb=db(rms(together,.05,.16)/referenceLevel);
 const silenceDbfs=db(rms(await render([upper],{mute:0}),.04,.16));
 const results={sampledRoots:layerJumps.length,channels:alone.numberOfChannels,largestLayerStepDb:rounded(Math.max(...layerJumps)),
  referenceDbfs:rounded(db(referenceLevel)),resumedDb:rounded(resumedDb),slowResumedDb:rounded(slowResumedDb),soloLevelDb:rounded(soloLevelDb),silenceDbfs:rounded(silenceDbfs)};
 if(!Object.values(results).every(Number.isFinite) || results.referenceDbfs< -60 || results.referenceDbfs>0 ||
    results.channels!==2 || results.largestLayerStepDb>1 || Math.abs(resumedDb)>1.5 || Math.abs(slowResumedDb)>1.5 ||
    Math.abs(soloLevelDb)>.05 || silenceDbfs> -100) throw Error('Piano render outside tolerance: '+JSON.stringify(results));
 return results;
}
