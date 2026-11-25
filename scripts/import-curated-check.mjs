/** Offline integrity checks for the authored-source collection and its compact wire format. */
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root));
const hash=data=>createHash('sha256').update(data).digest('hex');
const json=async path=>JSON.parse(await read(path));
const columns=['id','part','voice','track','quarter','start','duration','quarterDuration','measure','beat','pitch','voiceColor','grace','ties'];
const palette=['#b74131','#246a74','#966311','#704b86','#365f8d','#8d435b'];
function unzip(bytes,scoreName='score.musicxml'){
 const files=new Map();let offset=0;
 while(offset+4<bytes.length&&bytes.readUInt32LE(offset)===0x04034b50){
  const flags=bytes.readUInt16LE(offset+6),method=bytes.readUInt16LE(offset+8),size=bytes.readUInt32LE(offset+18),expanded=bytes.readUInt32LE(offset+22),n=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28);
  assert.equal(flags&9,0,'no encrypted/data-descriptor ZIP entries');assert.ok(size<=2_000_000&&expanded<=2_000_000);
  const name=bytes.subarray(offset+30,offset+30+n).toString();assert.ok(['META-INF/container.xml',scoreName].includes(name));assert.ok(!files.has(name));
  const begin=offset+30+n+extra;assert.ok(begin+size<=bytes.length);const packed=bytes.subarray(begin,begin+size);
  const body=method===8?inflateRawSync(packed,{maxOutputLength:2_000_000}):method===0?packed:null;assert.ok(body);assert.equal(body.length,expanded);files.set(name,body);offset=begin+size;
 }
 assert.equal(files.size,2);assert.ok(files.get('META-INF/container.xml').toString().includes('full-path="'+scoreName+'"'));return files.get(scoreName);
}
const manifest=await json('data/curated-fifty.json');assert.equal(manifest.format,'baroque-curated-source-scores/1');assert.equal(manifest.pieces.length,50);
assert.equal(manifest.pieces.filter(p=>p.composer==='bach').length,30);assert.ok(new Set(manifest.pieces.filter(p=>p.composer!=='bach').map(p=>p.composer)).size>=6);
const supplement=await json('data/curated-supplement.json');
assert.equal(supplement.pieces.length,12);
assert.equal(supplement.sourceCommit,manifest.sourceCommit);
const mutopia=[...manifest.pieces,...supplement.pieces];
for(const piece of mutopia){
 assert.ok(piece.source.startsWith('https://www.mutopiaproject.org/cgibin/piece-info.cgi?id='));
 assert.ok(piece.sourceFile.includes('/'+manifest.sourceCommit+'/'));
}
const additions=await json('data/musicxml-additions.json');
const pieces=[...mutopia,...additions.pieces];
assert.equal(new Set(pieces.map(p=>p.id)).size,pieces.length);
let heads=0,total=0;
for(const piece of pieces){
 for(const field of ['score','noteData','midi'])assert.ok(new RegExp('^assets/curated/[a-z0-9-]+\\.(mxl|json|mid)$').test(piece[field]));
 assert.ok(piece.license==='Public Domain'||piece.license.startsWith('Creative Commons Attribution'));assert.ok(piece.attribution);
 const mxl=await read(piece.score),dataBytes=await read(piece.noteData),midi=await read(piece.midi);assert.equal(hash(mxl),piece.scoreHash);assert.equal(hash(dataBytes),piece.noteDataHash);assert.equal(hash(midi),piece.midiHash);assert.equal(midi.subarray(0,4).toString(),'MThd');
 const xml=unzip(mxl);assert.equal(hash(xml),piece.xmlHash);assert.equal(xml.length,piece.uncompressedScoreBytes);assert.ok(!/<!DOCTYPE|<!ENTITY|<script\b/i.test(xml.toString()));
 const data=JSON.parse(dataBytes);assert.equal(data.timingFormat,'columns/1');assert.deepEqual(data.timingColumns,columns);assert.ok(data.duration>0&&data.duration<3600);assert.ok(data.tracks.length>=2&&data.tracks.length<=8);
 const rows=data.timingRows.map(row=>{assert.equal(row.length,columns.length);return Object.fromEntries(columns.map((k,i)=>[k,row[i]]));});
 const noteIDs=[...xml.toString().matchAll(/<note\b[^>]*\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(noteIDs.length,piece.displayedNoteheads);assert.equal(rows.length,noteIDs.length);assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);assert.deepEqual(new Set(rows.map(r=>r.id)),new Set(noteIDs));
 for(const row of rows){assert.ok(Number.isInteger(row.track)&&row.track>=0&&row.track<data.tracks.length);assert.equal(row.part,data.tracks[row.track].id);assert.equal(row.voiceColor,palette[row.track%palette.length]);assert.ok(Number.isFinite(row.quarter)&&row.quarter>=0);assert.ok(Number.isInteger(row.pitch)&&row.pitch>=0&&row.pitch<=127);assert.ok(row.start>=0&&row.duration>=0&&row.start+row.duration<=data.duration+.001);}
 for(const track of data.tracks)for(const [pitch,start,length,velocity] of track.notes){assert.ok(Number.isInteger(pitch)&&pitch>=0&&pitch<=127);assert.ok(start>=0&&length>0&&start+length<=data.duration+.001);assert.ok(velocity>=0&&velocity<=1);}
 assert.ok(data.measureTimes.every((m,i)=>m.start>=0&&m.end>m.start&&m.end<=data.duration+.001&&(!i||Math.abs(m.start-data.measureTimes[i-1].end)<.0001)));
 assert.ok(piece.voices.every(v=>v.actualVoice===(piece.voiceKind==='actual-voice')));heads+=rows.length;total+=mxl.length+dataBytes.length+midi.length;
}
const sourceChecks=await json('data/curated-source-validation.json');assert.equal(sourceChecks.passed,50);assert.ok(sourceChecks.pieces.every(p=>p.sourceToXmlPitchIntervalCoverage&&p.sourceToXmlTotalPitchDurations&&p.sourceToXmlGraceNotes&&p.safeZipEntries&&p.timingMatchesAllDisplayedNoteIDs&&p.xmlHashMatches));
const extraChecks=await json('data/curated-supplement-validation.json');
assert.equal(extraChecks.passed,supplement.pieces.length);
assert.deepEqual(extraChecks.pieces.map(p=>p.id),supplement.pieces.map(p=>p.id));
assert.ok(extraChecks.pieces.every(p=>p.sourceToXmlPitchIntervalCoverage&&p.sourceToXmlTotalPitchDurations&&p.sourceToXmlGraceNotes&&p.safeZipEntries&&p.timingMatchesAllDisplayedNoteIDs&&p.xmlHashMatches));
const fugue=additions.pieces.find(piece=>piece.id==='bwv914-fugue');
assert.equal(fugue.source,'https://musescore.com/user/6725176/scores/2698796');
assert.equal(fugue.licenseUrl,'https://creativecommons.org/publicdomain/mark/1.0/');
const sourceEdition=await read('scripts/source-scores/bwv914-fugue.mxl');
assert.equal(hash(sourceEdition),fugue.sourceHash);
const sourceNotes=xml=>[...xml.toString().matchAll(/<note(?:\s[^>]*|)>([\s\S]*?)<\/note>/g)].map(m=>m[1].replace(/>\s+</g,'><').trim());
assert.deepEqual(sourceNotes(unzip(await read(fugue.score))),sourceNotes(unzip(sourceEdition,'score.xml')));
const fugueStudy=await json(fugue.noteData);
assert.equal(fugueStudy.measureTimes.length,72);
assert.deepEqual(fugueStudy.tempoMap.map(t=>[t.quarter,t.bpm]),[[0,100],[284,40]]);
assert.equal(fugueStudy.tracks.reduce((n,t)=>n+t.notes.length,0),1801);
const atBar=number=>fugueStudy.timingRows.filter(row=>row[8]===number).sort((a,b)=>a[4]-b[4]);
for(const [bar,voice,pitch] of [['1','2',71],['5','1',78],['10','5',59]]){
 assert.equal(atBar(bar).find(row=>row[2]===voice)?.[10],pitch);
}
console.log(JSON.stringify({passed:true,pieces:pieces.length,bach:pieces.filter(p=>p.composer==='bach').length,displayedNoteheads:heads,assetBytes:total,networkCalls:0}));
