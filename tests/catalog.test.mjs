import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {historicalName} from '../assets/map/historical-labels.mjs';
import {VOICE_COLORS,projectCity,filterComposers,validateStudy,activeNotes,formatTime,safeURL} from '../src/engine.mjs';
const json=async file=>JSON.parse(await readFile(file,'utf8'));
const composers=await json('data/composers.json'),works=await json('data/works.json'),catalogue=await json('data/catalogue.json'),rights=await json('data/rights.json'),study=await json('data/study.json');
test('every composer has five source-linked selections and geographic metadata',()=>{
 assert.equal(composers.length,102);assert.equal(new Set(composers.map(c=>c.id)).size,102);assert.equal(works.entries.length,102);
 for(const c of composers){assert(c.name&&c.dates&&c.city&&c.origin);assert.equal(c.coordinates.length,2);assert(c.coordinates.every(Number.isFinite));assert(c.eras.length>0&&c.traditions.length>0);assert.match(c.source,/^https:\/\//);const entry=works.entries.find(w=>w.composer===c.id);assert.equal(entry?.works.length,5);for(const w of entry.works){assert(w.title&&Number.isInteger(w.sourcePageId));assert.match(w.score,/^https:\/\/imslp.org\/wiki\//);assert.match(w.performance,/^https:\/\/www.youtube.com\/results\?search_query=/);}}
 assert.equal(works.entries.reduce((n,e)=>n+e.works.length,0),510);
});
test('filters combine origin, tradition, period and accent-insensitive name/city search',()=>{
 assert.equal(filterComposers(composers,{query:'leipzig'}).some(c=>c.id==='bach'),true);
 assert.equal(filterComposers(composers,{origin:'Italian'}).every(c=>c.origin==='Italian'),true);
 const f=filterComposers(composers,{tradition:'french',period:'late'});assert(f.length>0&&f.every(c=>c.traditions.includes('french')&&c.eras.includes('late')));
 assert.equal(filterComposers(composers,{query:'nocomposermatches999'}).length,0);
 assert.equal(filterComposers(composers,{origin:'Italian',query:'Buxtehude'}).length,0);
 assert.equal(filterComposers([{name:'François',city:'Paris',dates:'',note:'',traditions:[],eras:[]}],{query:'francois'}).length,1);
});
test('city projection matches the basemap and keeps key locations within Europe',()=>{
 assert.deepEqual(projectCity([12,50]),[400,245]);
 for(const id of ['bach','handel','vivaldi','scarlatti','couperin']){const c=composers.find(c=>c.id===id),[x,y]=projectCity(c.coordinates);assert(x>0&&x<800&&y>0&&y<530,id);}
 const west=projectCity([-5,50]),east=projectCity([20,50]);assert(west[0]<east[0]);assert(projectCity([12,60])[1]<245);
});
test('all 45 full movements and the excerpt have valid source note arrays and original MIDI hashes',async()=>{
 const ids=catalogue.works.flatMap(w=>w.movements.map(m=>m.id)).concat(catalogue.miniatures.map(m=>m.id));assert.equal(ids.length,45);
 for(const id of [...ids,'partita-study']){
  const data=id==='partita-study'?study:await json(`assets/music/${id}.json`);assert.equal(validateStudy(data),data);for(const t of data.tracks){for(let i=1;i<t.notes.length;i++)assert(t.notes[i][1]>=t.notes[i-1][1],id+' note order');}
  const source=rights.editions.find(e=>e.id===id);assert(source?.attribution&&source.currentScoreSource&&source.licence);const midi=await readFile(`assets/music/${id}.mid`);assert.equal(midi.subarray(0,4).toString(),'MThd');if(source.sourceMidiSha256)assert.equal(createHash('sha256').update(midi).digest('hex'),source.sourceMidiSha256,id);
 }
});
test('the three-voice Bach study matches source-note highlighting positions',async()=>{
 const map=await json('data/partita-score-map.json');assert.equal(study.tracks.length,3);assert.equal(study.duration,36);assert.equal(study.tracks.reduce((n,t)=>n+t.notes.length,0),169);assert.equal(map.notes.length,176);assert.equal(map.bars.length,6);
 const svg=await readFile('assets/music/partita-voices.svg');const palette=JSON.parse(svg.toString().match(/<metadata>(.*?)<\/metadata>/s)[1]).palette;assert.deepEqual(VOICE_COLORS.slice(0,3),palette,'controls and note timeline match source-engraving voice colors');assert.equal(createHash('sha256').update(svg).digest('hex'),map.sourceSha256);
 const sound=study.tracks.flatMap((t,track)=>t.notes.map(n=>[track,n[1],n[1]+n[2]]));for(const n of map.notes){const found=sound.find(s=>s[0]===n[0]&&s[1]<=n[2]*map.secondsPerBeat+.005&&s[2]>=n[3]*map.secondsPerBeat-.005);assert(found,'engraved notehead/tied segment must be covered by a sounding source voice');}
 assert.deepEqual(activeNotes(study,0,[true,true,true]).map(n=>n.track).sort(),[1,2]);assert.equal(activeNotes(study,0,[false,false,false]).length,0);assert.equal(activeNotes(study,36,[true,true,true]).length,0);
});
test('15 reusable previews have documented rights and clip notes at the 30-second boundary',async()=>{
 const favorites=await json('data/favorites.json'),previews=await json('data/favorite-previews.json');assert.equal(favorites.length,15);assert.equal(previews.length,15);assert.equal(new Set(previews.map(r=>r.id)).size,15);
 for(const preview of previews){validateStudy(preview);assert.equal(preview.duration,30);assert(preview.license&&preview.attribution&&preview.excerpt);for(const t of preview.tracks)for(const n of t.notes)assert(n[1]+n[2]<=30.000001);}
});
test('unsafe links and invalid playback data fail closed',()=>{
 for(const u of ['javascript:alert(1)','data:text/html,test','http://example.org/','not a url'])assert.equal(safeURL(u),'#');
 assert.equal(safeURL('https://example.org/score'),'https://example.org/score');assert.equal(formatTime(126),'2:06');assert.equal(formatTime(-2),'0:00');
 for(const bad of [{duration:0,tracks:[]},{duration:10,tracks:[{notes:[[70,-1,.2]]}]},{duration:10,tracks:[{notes:[[140,0,.2]]}]},{duration:10,tracks:[{notes:[[70,0,0]]}]}])assert.throws(()=>validateStudy(bad));
 assert.equal(VOICE_COLORS.length,6);
});
test('every retained external asset still matches the provenance receipt',async()=>{
 const provenance=await json('data/provenance.json');for(const asset of provenance.assets)assert.equal(createHash('sha256').update(await readFile(asset.path)).digest('hex'),asset.sha256,asset.path);
});

test('c.1700 display uses Habsburg lands while documenting the unchanged upstream label',async()=>{
 const svg=await readFile('assets/map/europe-1700.svg','utf8');
 assert(svg.includes('<title>Habsburg lands</title>'));
 assert(![...svg.matchAll(/<title>(.*?)<\/title>/gs)].some(m=>m[1].includes('Austrian Empire')));
 assert.equal(historicalName('Austrian Empire'),'Habsburg lands');
 assert.equal(historicalName('France'),'France');
 const p=await json('data/provenance.json');assert.equal(p.map.display_label_corrections[0].upstream_label,'Austrian Empire');assert.equal(p.map.display_label_corrections[0].display_label,'Habsburg lands');
});
