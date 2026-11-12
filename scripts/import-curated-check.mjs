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
function unzip(bytes){
 const files=new Map();let offset=0;
 while(offset+4<bytes.length&&bytes.readUInt32LE(offset)===0x04034b50){
  const flags=bytes.readUInt16LE(offset+6),method=bytes.readUInt16LE(offset+8),size=bytes.readUInt32LE(offset+18),expanded=bytes.readUInt32LE(offset+22),n=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28);
  assert.equal(flags&9,0,'no encrypted/data-descriptor ZIP entries');assert.ok(size<=2_000_000&&expanded<=2_000_000);
  const name=bytes.subarray(offset+30,offset+30+n).toString();assert.ok(['META-INF/container.xml','score.musicxml'].includes(name));assert.ok(!files.has(name));
  const begin=offset+30+n+extra;assert.ok(begin+size<=bytes.length);const packed=bytes.subarray(begin,begin+size);
  const body=method===8?inflateRawSync(packed,{maxOutputLength:2_000_000}):method===0?packed:null;assert.ok(body);assert.equal(body.length,expanded);files.set(name,body);offset=begin+size;
 }
 assert.equal(files.size,2);assert.ok(files.get('META-INF/container.xml').toString().includes('full-path="score.musicxml"'));return files.get('score.musicxml');
}
const manifest=await json('data/curated-fifty.json');assert.equal(manifest.format,'baroque-curated-source-scores/1');assert.equal(manifest.pieces.length,50);
assert.equal(manifest.pieces.filter(p=>p.composer==='bach').length,30);assert.ok(new Set(manifest.pieces.filter(p=>p.composer!=='bach').map(p=>p.composer)).size>=6);
assert.equal(new Set(manifest.pieces.map(p=>p.id)).size,50);let heads=0,total=0;
for(const piece of manifest.pieces){
 for(const field of ['score','noteData','midi'])assert.ok(new RegExp('^assets/curated/[a-z0-9-]+\\.(mxl|json|mid)$').test(piece[field]));
 assert.ok(piece.source.startsWith('https://www.mutopiaproject.org/cgibin/piece-info.cgi?id='));assert.ok(piece.sourceFile.includes('/'+manifest.sourceCommit+'/'));
 assert.ok(piece.license==='Public Domain'||piece.license.startsWith('Creative Commons Attribution'));assert.ok(piece.attribution);
 const mxl=await read(piece.score),dataBytes=await read(piece.noteData),midi=await read(piece.midi);assert.equal(hash(mxl),piece.scoreHash);assert.equal(hash(dataBytes),piece.noteDataHash);assert.equal(hash(midi),piece.midiHash);assert.equal(midi.subarray(0,4).toString(),'MThd');
 const xml=unzip(mxl);assert.equal(hash(xml),piece.xmlHash);assert.equal(xml.length,piece.uncompressedScoreBytes);assert.ok(!/<!DOCTYPE|<!ENTITY|<script\b/i.test(xml.toString()));
 const data=JSON.parse(dataBytes);assert.equal(data.timingFormat,'columns/1');assert.deepEqual(data.timingColumns,columns);assert.ok(data.duration>0&&data.duration<3600);assert.ok(data.tracks.length>=2&&data.tracks.length<=8);
 const rows=data.timingRows.map(row=>{assert.equal(row.length,columns.length);return Object.fromEntries(columns.map((k,i)=>[k,row[i]]));});
 const noteIDs=[...xml.toString().matchAll(/<note\b[^>]*\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(noteIDs.length,piece.displayedNoteheads);assert.equal(rows.length,noteIDs.length);assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);assert.deepEqual(new Set(rows.map(r=>r.id)),new Set(noteIDs));
 for(const row of rows){assert.ok(Number.isInteger(row.track)&&row.track>=0&&row.track<data.tracks.length);assert.equal(row.part,data.tracks[row.track].id);assert.equal(row.voiceColor,palette[row.track%palette.length]);assert.ok(Number.isFinite(row.quarter)&&row.quarter>=0);assert.ok(Number.isInteger(row.pitch)&&row.pitch>=0&&row.pitch<=127);assert.ok(row.start>=0&&row.duration>=0&&row.start+row.duration<=data.duration+.001);}
 for(const track of data.tracks)for(const [pitch,start,length,velocity] of track.notes){assert.ok(Number.isInteger(pitch)&&pitch>=0&&pitch<=127);assert.ok(start>=0&&length>0&&start+length<=data.duration+.001);assert.ok(velocity>=0&&velocity<=1);}
 assert.ok(data.measureTimes.every((m,i)=>m.start>=0&&m.end>m.start&&m.end<=data.duration+.001&&(!i||Math.abs(m.start-data.measureTimes[i-1].end)<.0001)));
 assert.ok(piece.voices.every(v=>v.actualVoice===(piece.composer==='bach')));heads+=rows.length;total+=mxl.length+dataBytes.length+midi.length;
}
const sourceChecks=await json('data/curated-source-validation.json');assert.equal(sourceChecks.passed,50);assert.ok(sourceChecks.pieces.every(p=>p.sourceToXmlPitchIntervalCoverage&&p.sourceToXmlTotalPitchDurations&&p.sourceToXmlGraceNotes&&p.safeZipEntries&&p.timingMatchesAllDisplayedNoteIDs&&p.xmlHashMatches));
console.log(JSON.stringify({passed:true,pieces:50,bach:30,otherComposers:7,displayedNoteheads:heads,assetBytes:total,networkCalls:0}));
