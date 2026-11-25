import {readFile,writeFile,mkdir,cp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {validateStudy} from '../src/engine.mjs';
import {PLAYBACK_SCORE_STYLE} from '../src/notation.mjs';
import {alternateMovements} from '../src/repertoire.mjs';
import {staticContentPolicy} from './security-policy.mjs';
const json=async name=>JSON.parse(await readFile(`data/${name}.json`,'utf8'));
const data={composers:await json('composers'),works:await json('works'),catalogue:await json('catalogue'),rights:await json('rights'),study:validateStudy(await json('study')),scoreMap:await json('partita-score-map'),studyScore:await readFile('assets/music/partita-voices.svg','utf8'),notationMetadata:await json('notation-metadata'),education:await json('education'),portraits:await json('portraits'),biographies:await json('biographies'),curated:await json('curated-fifty')};
const supplement=await json('curated-supplement');
data.curated.pieces.push(...supplement.pieces);
data.curated.pieces.push(...(await json('musicxml-additions')).pieces);
data.gallery=JSON.parse(await readFile('assets/gallery/works.json','utf8'));
data.editions=await json('edition-library');
data.archive=await json('archive/manifest');
if(data.composers.length!==102||data.works.entries.reduce((n,c)=>n+c.works.length,0)!==510)throw Error('Catalog counts changed');
const map=(await readFile('assets/map/europe-1700.svg','utf8')).replace(/^<svg[^>]+>/,'').replace(/<\/svg>\s*$/,'');
if(map.includes('<title>Austrian Empire</title>'))throw Error('Anachronistic c.1700 map display title');
const scripts=(await Promise.all(['engine.mjs','glyphs.mjs','notation.mjs','audio.mjs','authored-score.mjs','work-archive.mjs','repertoire.mjs','edition-library.mjs','app.mjs'].map(n=>readFile('src/'+n,'utf8')))).map(source=>source.replace(/^import .*?;\s*$/gm,'').replace(/^export /gm,'')).join('\n');
let html=await readFile('src/index.html','utf8');
const escapeText=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const artworkStyles=data.gallery.works.map(work=>{
 if(!/^[a-z0-9-]+$/.test(work.id)||!/^\d{1,3}% \d{1,3}%$/.test(work.position))throw Error('Invalid painting position');
 return '.room-painting[data-painting="'+work.id+'"] img{object-position:'+work.position+'}';
}).join('\n');
const artwork=data.gallery.works[0];
const cover='<figure class="room-painting" id="room-painting" data-painting="'+escapeText(artwork.id)+'"><picture>'+
 '<source media="(max-width:680px)" srcset="'+escapeText(artwork.mobileImage)+'"><img id="painting-image" src="'+escapeText(artwork.image)+'" width="'+artwork.width+'" height="'+artwork.height+'" alt="'+escapeText(artwork.alt)+'"></picture>'+
 '<figcaption><a id="painting-credit" href="'+escapeText(artwork.url)+'" target="_blank" rel="noopener noreferrer">'+escapeText(artwork.artist+' · '+artwork.title+', '+artwork.date)+'</a>'+
 '<button id="next-painting" type="button">Next painting</button></figcaption></figure>';
const localSourceMovements=data.catalogue.works.reduce((count,work)=>count+work.movements.length,data.catalogue.miniatures.length);
const localEditions=data.curated.pieces.length+localSourceMovements+data.editions.pieces.length;
const legacyIds=new Set([...data.catalogue.works.flatMap(work=>work.movements.map(piece=>piece.id)),...data.catalogue.miniatures.map(piece=>piece.id)]);
for(const [older,authored] of alternateMovements){
 if(!legacyIds.has(older)||!data.curated.pieces.some(piece=>piece.id===authored))throw Error('Invalid alternate edition: '+older);
}
const playable=localEditions-alternateMovements.size;
const atlasComposers=data.composers.length+(data.editions.composers?.length||0);
const styles=await readFile('src/style.css','utf8')+'\n'+artworkStyles;
html=html.replace('/*STYLE*/',()=>styles).replace('/*DATA*/',()=>JSON.stringify(data).replaceAll('<','\\u003c'))
 .replace('/*SCRIPT*/',()=>scripts.replaceAll('</script','<\\/script')).replace('<!--MAP-->',()=>map)
 .replace('<!--ROOM_PAINTING-->',()=>cover).replaceAll('/*__PLAYABLE_COUNT__*/',String(playable))
 .replaceAll('/*__COMPOSER_COUNT__*/',String(atlasComposers))
 .replaceAll('/*__ARCHIVE_COUNT__*/',data.archive.entries.toLocaleString('en-US'))
 .replaceAll('/*__SCORE_COUNT__*/',String(data.curated.pieces.length));
await rm('dist',{recursive:true,force:true});await mkdir('dist');await writeFile('dist/index.html',html);await cp('assets','dist/assets',{recursive:true});await cp('data','dist/data',{recursive:true});await cp('docs','dist/docs',{recursive:true});for(const f of ['README.md','ATTRIBUTION.md','LICENSE'])await cp(f,join('dist',f));
await mkdir('dist/assets/score-renderer',{recursive:true});await cp('node_modules/opensheetmusicdisplay/build/opensheetmusicdisplay.min.js','dist/assets/score-renderer/osmd-2.3.0.min.js');await cp('node_modules/opensheetmusicdisplay/LICENSE','dist/assets/score-renderer/OSMD-LICENSE.txt');
await writeFile('dist/404.html','<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Page not found</title><body><h1>Page not found</h1><a href="/">Return to the atlas</a></body></html>');
const contentPolicy=staticContentPolicy(html,[PLAYBACK_SCORE_STYLE]);
await writeFile('dist/_headers',`/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Content-Security-Policy: ${contentPolicy}\n`);
await mkdir('artifacts',{recursive:true});await writeFile('artifacts/build.json',JSON.stringify({composers:atlasComposers,catalogWorks:510+5*(data.editions.composers?.length||0),archiveEntries:data.archive.entries,fullSourceMovements:localSourceMovements,librarySelections:data.editions.pieces.length,playableSelections:playable,localEditions,alternateEditions:Object.fromEntries(alternateMovements),curatedCompleteSelections:data.curated.pieces.length,sourceSeparatedStudy:{bars:6,voices:3},initialHTMLBytes:Buffer.byteLength(html),sha256:createHash('sha256').update(html).digest('hex'),selfContainedInitialUI:true},null,2)+'\n');
console.log('Built '+playable+' complete listening selections, including '+data.curated.pieces.length+' MusicXML editions, and '+data.archive.entries+' reference entries.');
