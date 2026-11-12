import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderPlaybackScore,noteSpelling,rhythmicValue} from '../src/notation.mjs';
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const metadata=await json('data/notation-metadata.json');
const catalog=await json('data/catalogue.json');
const ids=catalog.works.flatMap(w=>w.movements.map(m=>m.id)).concat(catalog.miniatures.map(m=>m.id),'partita-study');
test('every one of 46 selections has real timed staff notation at its beginning, middle and end',async()=>{
 for(const id of ids){const study=await json(id==='partita-study'?'data/study.json':`assets/music/${id}.json`),m=metadata.records[id];assert(m&&m.secondsPerBeat>0&&m.meter.numerator>0&&m.barTimes.length>0,id);
  for(const position of [0,study.duration*.5,Math.max(0,study.duration-.01)]){const r=renderPlaybackScore(study,{...m,position});assert(r.svg.includes('<svg')&&r.svg.includes('data-score-track="0"'),id);assert.equal((r.svg.match(/data-score-track=/g)||[]).length,study.tracks.length);assert(r.windowStart<=position+.001&&r.windowEnd>=position-.001,id);assert(!/NaN|Infinity|undefined/.test(r.svg),id);assert(r.inferred&&r.caption.includes('inferred'));for(const note of r.notes)assert(note.start<r.windowEnd&&note.end>r.windowStart);}
 }
});
test('a note crossing a page boundary remains represented and is labeled held',()=>{
 const study={duration:20,tracks:[{label:'Bass',notes:[[36,0,18,1]]}]};const r=renderPlaybackScore(study,{windowSeconds:5,position:8});assert.equal(r.windowStart,5);assert.equal(r.notes.length,1);assert(r.notes[0].carried);assert(r.svg.includes('held from previous window'));assert(r.notes[0].x>=80);
});
test('all source events are represented when their onset is within the selected page',async()=>{
 for(const id of ['bwv825-01','handel-overture','scarlatti-k11','purcell-fairest-isle']){const study=await json(`assets/music/${id}.json`),options={...metadata.records[id],windowSeconds:10};for(let position=0;position<study.duration;position+=10){const r=renderPlaybackScore(study,{...options,position});const expected=study.tracks.reduce((n,t)=>n+t.notes.filter(a=>a[1]<r.windowEnd&&a[1]+a[2]>r.windowStart).length,0);assert.equal(r.notes.length,expected,id);}}
});
test('noteheads use pitch spelling, rhythmic flags, dots and ledger lines',()=>{
 assert.equal(noteSpelling(70,true).name,'B♭4');assert.equal(noteSpelling(70,false).name,'A♯4');assert.equal(noteSpelling(60).name,'C4');
 assert.equal(rhythmicValue(.75,.5).dotted,true);assert.equal(rhythmicValue(.125,.5).flags,2);assert.equal(rhythmicValue(.166666,.5).approximate,true);
 const r=renderPlaybackScore({duration:4,tracks:[{label:'High',notes:[[96,0,.75,1],[48,1,.125,1]]}]},{secondsPerBeat:.5});assert.equal(r.notes.length,2);assert(r.notes.every(n=>n.y>0&&n.y<Number(r.svg.match(/height="([\d.]+)"/)[1])));assert(r.svg.includes('<circle'));
});
test('MIDI-derived SVG escapes labels, rejects color injection and bounds malformed input',()=>{
 const study={duration:2,tracks:[{label:'<script>alert("x")</script>',notes:[[60,0,1,1]]}]};const r=renderPlaybackScore(study,{colors:['url(javascript:evil)'],width:-999,position:Infinity});assert(!r.svg.includes('<script'));assert(r.svg.includes('&lt;script&gt;'));assert(!r.svg.includes('url(javascript'));assert(!r.svg.includes('NaN'));
 assert.throws(()=>renderPlaybackScore({duration:2,tracks:[{notes:[[200,0,1]]}]}));assert.throws(()=>renderPlaybackScore({duration:2,tracks:[{notes:[[60,-1,1]]}]}));assert.throws(()=>renderPlaybackScore({duration:Infinity,tracks:[]}));
});
test('Bravura outlines and required rights travel with the renderer',async()=>{
 const glyphs=await readFile('src/glyphs.mjs','utf8');assert(glyphs.includes('noteheadBlack')&&glyphs.includes('gClef')&&glyphs.includes('flag16thUp'));assert((await readFile('assets/notation/BRAVURA-OFL.txt','utf8')).includes('SIL OPEN FONT LICENSE'));assert((await readFile('assets/notation/VEXFLOW-LICENSE.txt','utf8')).includes('Mohit Muthanna'));
});

test('a generated score has one note Tab stop rather than a stop per note',()=>{
 const r=renderPlaybackScore({duration:4,tracks:[{notes:[[60,0,1],[62,1,1],[64,2,1]]}]});assert.equal((r.svg.match(/tabindex="0"/g)||[]).length,1);assert.equal((r.svg.match(/tabindex="-1"/g)||[]).length,2);
});
