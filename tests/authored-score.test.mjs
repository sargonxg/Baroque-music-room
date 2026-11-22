import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sourceTiming,matchScoreTiming,timingQuarter,barAt,pitchName} from '../src/authored-score.mjs';
test('packed timing preserves every named field and rejects unrecognised columns',()=>{
 const study={timingFormat:'columns/1',timingColumns:['id','start','duration','pitch','quarter'],timingRows:[['a',1,.5,60,2]]};
 assert.deepEqual(sourceTiming(study),[{id:'a',start:1,duration:.5,pitch:60,quarter:2}]);assert.equal(timingQuarter(sourceTiming(study)[0],study),2);
 assert.throws(()=>sourceTiming({...study,timingColumns:['constructor']}));assert.throws(()=>sourceTiming({...study,timingRows:[[]]}));
});
test('score following keeps source voice colour when pitches coincide',()=>{
 const rows=[{quarter:1,pitch:60,voiceColor:'#b74131',track:0},{quarter:1,pitch:60,voiceColor:'#246a74',track:1}];
 assert.equal(matchScoreTiming(rows,1,60,'#246A74').track,1);assert.equal(matchScoreTiming(rows,2,60),null);
});
test('all fifty selected files preserve source timing and the 30 Bach / 20 other boundary',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../data/curated-fifty.json',import.meta.url)));assert.equal(manifest.pieces.length,50);assert.equal(manifest.pieces.filter(p=>p.composer==='bach').length,30);
 for(const piece of manifest.pieces){const study=JSON.parse(await readFile(new URL('../'+piece.noteData,import.meta.url))),rows=sourceTiming(study);assert.equal(rows.length,piece.displayedNoteheads);assert(rows.every(row=>Number.isFinite(row.quarter)&&row.track>=0&&row.track<study.tracks.length));}
});

test('bar navigation follows actual measure times and names MIDI pitches consistently',()=>{
 const bars=[{number:0,start:0,end:.75},{number:1,start:.75,end:3.75},{number:2,start:3.75,end:6.75}];
 assert.equal(barAt(bars,0).number,0);assert.equal(barAt(bars,.75).index,1);assert.equal(barAt(bars,999).number,2);assert.equal(barAt([],1),null);
 assert.equal(pitchName(60),'C4');assert.equal(pitchName(61),'C♯4');assert.equal(pitchName(48),'C3');
});
