import {VOICE_COLORS,projectCity,filterComposers,validateStudy,activeNotes,formatTime,safeURL} from './engine.mjs';
import {KeyboardTransport} from './audio.mjs';
import {renderPlaybackScore,highlightPlaybackScore,moveScoreFocus,playbackMeasures,playbackPage} from './notation.mjs';
import {AuthoredScore,barAt} from './authored-score.mjs';
import {connectWorkArchive} from './work-archive.mjs';
import {makeRepertoireShuffle,repertoireFamily,searchRepertoire,alternateMovements,repertoireId} from './repertoire.mjs';
import {loadLibraryStudy,encodeLibraryMidi} from './edition-library.mjs';
const DATA=JSON.parse(document.getElementById('app-data').textContent);
const $=id=>document.getElementById(id),esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const htmlLink=(url,text)=>`<a href="${esc(safeURL(url))}" target="_blank" rel="noopener">${esc(text)}</a>`;
const composers=[...DATA.composers,...(DATA.editions.composers||[])];
const byId=new Map(composers.map(c=>[c.id,c])),byWorks=new Map(DATA.works.entries.map(e=>[e.composer,e]));
for(const composer of DATA.editions.composers||[]){
 const works=DATA.editions.pieces.filter(piece=>piece.composer===composer.id).slice(0,5).map(piece=>({
  title:piece.title,score:piece.scoreUrl||piece.source,performance:piece.recordingSearch,native:piece.id
 }));
 byWorks.set(composer.id,{composer:composer.id,works});
}
let selected=byId.has(new URLSearchParams(location.search).get('composer'))?new URLSearchParams(location.search).get('composer'):'bach';
let filtered=composers,currentStudy=DATA.study,currentId='partita-study',loadEpoch=0,rollStart=0,rollWidth=36,rollNotes=[],lastFrame=0,scoreDots=[];
const allMovements=DATA.catalogue.works.flatMap(w=>w.movements.map(m=>({...m,composer:'bach',composerName:'J. S. Bach',collection:w.title,preview:w.preview})));
allMovements.push(...DATA.catalogue.miniatures.map(m=>({...m,composerName:byId.get(m.composer)?.name,collection:'Selected miniature'})));
const curated=DATA.curated?.pieces||[],curatedById=new Map(curated.map(piece=>[piece.id,piece]));
allMovements.push(...curated.map(piece=>({...piece,composerName:byId.get(piece.composer)?.name||piece.composerName||piece.composer,collection:'Curated complete selection',preview:null})));
const editionById=new Map(DATA.editions.pieces.map(piece=>[piece.id,piece]));
allMovements.push(...DATA.editions.pieces);
const movementById=new Map(allMovements.map(m=>[m.id,m]));
const repertoirePieces=allMovements.filter(piece=>!alternateMovements.has(piece.id));
const repertoireShuffle=makeRepertoireShuffle(repertoirePieces);
let currentMidiURL=null;
let scoreState=null,manualScoreStart=null,studyBars=[],loopA=null,authoredScore=null,studyAbort=null;
const portraitIds = new Set(['bach','handel','vivaldi','scarlatti','rameau','couperin','purcell','buxtehude','pachelbel','froberger','telemann']);
const composerPixel = id => 'assets/pixel/composers/' + (portraitIds.has(id) ? id : 'musician') + '.png';
const listeningNotes = {
 'bwv772': 'Listen for the opening figure. The lower voice takes it up while the upper voice continues.',
 'bwv787': 'Notice how the three parts enter and then keep moving around one another.',
 'bwv846-prelude': 'The broken-chord pattern stays steady while the harmony moves. Listen for the long bass notes near the end.',
 'bwv846-fugue': 'Listen for the same subject starting at different pitches. These colours mark the two staves.',
 'bwv847-prelude': 'Follow the running notes through the opening, then listen for changes of tempo and texture.',
 'bwv848-prelude': 'Hear the hands trade running figures and listen for the repeated three-eighth-note pulse.',
 'bwv924-prelude': 'Start with the lower staff alone. Add the upper staff to hear the harmonies open out.',
 'bwv926-prelude': 'Watch how quick patterns travel from one hand to the other.',
 'bwv928-prelude': 'Listen for the change in weight each time a held note gives way to movement.',
 'handel-impertinence': 'Listen for the repeated strains. The bass makes the dance pulse clear.',
 'handel-aylesford-prelude': 'Hear the shape of each broken chord against the notes held in the other hand.',
 'handel-aylesford-menuet': 'Count three beats and listen for when the melody leans forward into the next bar.',
 'handel-aylesford-air': 'Let the upper line sing. Notice how the lower notes mark the return of each phrase.',
 'handel-aylesford-allemande': 'Follow the small opening notes in each strain and listen to where the lines come to rest.',
};
const transport=new KeyboardTransport(frame,()=>setPlaying(false));
function setPlaying(playing){
 const play = $('play');
 play.textContent = playing ? 'Pause' : 'Listen';
 play.setAttribute('aria-label', playing ? 'Pause the selected study' : 'Play the selected study');
}
for(const origin of [...new Set(composers.map(c=>c.origin))].sort())$('origin').insertAdjacentHTML('beforeend',`<option>${esc(origin)}</option>`);
for(const tradition of [...new Set(composers.flatMap(c=>c.traditions))].sort())$('tradition').insertAdjacentHTML('beforeend',`<option value="${esc(tradition)}">${esc(tradition==='german'?'German-speaking':tradition[0].toUpperCase()+tradition.slice(1))}</option>`);
const studyGroups = new Map();
for (const piece of repertoirePieces) {
 const label = piece.composerName+' · '+repertoireFamily(piece);
 if (!studyGroups.has(label)) {
  const group = document.createElement('optgroup');
  group.label = label;
  studyGroups.set(label, group);
 }
 studyGroups.get(label).append(new Option(piece.title, piece.id));
}
$('movement').append(...[...studyGroups].sort(([a],[b])=>a.localeCompare(b)).map(([,group])=>group));
const alternatives=document.createElement('optgroup');alternatives.label='Alternate MIDI editions';
for(const id of alternateMovements.keys()){
 const piece=movementById.get(id);
 alternatives.append(new Option(piece.composerName+' · '+piece.title,id));
}
$('movement').append(alternatives);
const studyExcerpt=document.createElement('optgroup');
studyExcerpt.label='Listening exercise';
studyExcerpt.append(new Option('Bach · Partita No. 1 · first six bars','partita-study'));
$('movement').append(studyExcerpt);

const repertoireFamilies=[...new Set(repertoirePieces.map(repertoireFamily))].sort((a,b)=>a.localeCompare(b));
const recordingComposers=new Map(repertoirePieces.map(piece=>[piece.composer,piece.composerName]));
const shelfOpeners=['bwv772','rameaujp-plaintes','prelude1','scarlatti11','handel-03-gavotte','buxtehude185','bwv825-01','bwv846-fugue'];
const listeningShelf=[...shelfOpeners.map(id=>movementById.get(id)).filter(Boolean),...repertoirePieces.filter(m=>!shelfOpeners.includes(m.id))];
for(const [id,name] of [...recordingComposers].sort((a,b)=>a[1].localeCompare(b[1]))) $('piece-composer').append(new Option(name,id));
for(const family of repertoireFamilies) $('piece-family').append(new Option(family,family));
for(const [title,query] of [['Inventions','invention'],['Sinfonias','sinfonia'],['Partitas','partita'],['Toccatas','toccata'],['Goldberg Variations','goldberg'],['Suites','suite'],['Preludes & fugues','tempered'],['Chorales','chorale']]){
 if(!searchRepertoire(repertoirePieces,query,'','bach').length)continue;
 const button=document.createElement('button');button.type='button';button.textContent=title;button.dataset.query=query;
 $('bach-collections').append(button);
}
$('bach-collections').addEventListener('click',event=>{
 const button=event.target.closest('button[data-query]');if(!button)return;
 $('piece-search').value=button.dataset.query;$('piece-composer').value='bach';$('piece-family').value='';resetRepertoire();
});
let visiblePieces=8;
function renderRepertoire(){
 const query=$('piece-search').value,composer=$('piece-composer').value,family=$('piece-family').value;
 for(const button of $('bach-collections').querySelectorAll('button'))button.setAttribute('aria-pressed',String(composer==='bach'&&!family&&query===button.dataset.query));
 const matches=searchRepertoire(listeningShelf,query,family,composer);
 const families=new Set(matches.map(repertoireFamily));
 const guide=families.size===1?DATA.editions.guides?.[families.values().next().value]:'';
 $('family-guide').hidden=!guide;
 if(guide)$('family-guide').textContent=guide;
 const shown=matches.slice(0,visiblePieces);
 $('piece-count').textContent=matches.length ? shown.length+' of '+matches.length+' selections' : 'No selections match these filters.';
 $('piece-results').innerHTML=shown.map(piece=>`<li><a href="?movement=${encodeURIComponent(piece.id)}#player" data-repertoire-id="${esc(piece.id)}"${piece.id===repertoireId(currentId)?' aria-current="true"':''}><strong>${esc(piece.title)}</strong><small>${esc(piece.composerName)} · ${esc(repertoireFamily(piece))}</small></a></li>`).join('');
 $('more-pieces').hidden=shown.length===matches.length;
 const references=searchRepertoire(DATA.editions.references||[],query,family,composer);
 $('edition-shelf').hidden=!references.length;
 $('edition-count').textContent=references.length+' more published score'+(references.length===1?'':'s');
 $('edition-results').innerHTML=references.map(piece=>{
  const links=[htmlLink(piece.scoreUrl||piece.source,'Score')];
  if(piece.midiUrl)links.push(htmlLink(piece.midiUrl,'Publisher MIDI'));
  links.push(htmlLink(piece.recordingSearch,'Find a recording'));
  return `<li><strong>${esc(piece.title)}</strong><span>${links.join(' · ')}</span></li>`;
 }).join('');
}
function resetRepertoire(){visiblePieces=8;renderRepertoire();}
$('piece-search').addEventListener('input',resetRepertoire);
for(const id of ['piece-family','piece-composer']) $(id).addEventListener('change',resetRepertoire);
$('repertoire').addEventListener('toggle',()=>{if($('repertoire').open)renderRepertoire();});
$('more-pieces').addEventListener('click',()=>{visiblePieces+=12;renderRepertoire();});
function browseRepertoire(){
 $('repertoire').open=true;
 $('repertoire').scrollIntoView({block:'start',behavior:'instant'});
 $('piece-search').focus({preventScroll:true});
}
document.querySelector('a[href="#repertoire"]').addEventListener('click',event=>{
 if(event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();browseRepertoire();}
});
if(location.hash==='#repertoire') $('repertoire').open=true;
function jumpToScore(){ $('study').scrollIntoView({behavior:'instant',block:'start'}); }
$('piece-results').addEventListener('click',event=>{
 const link=event.target.closest('[data-repertoire-id]');
 if(!link||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
 event.preventDefault();selectStudy(link.dataset.repertoireId);jumpToScore();
 $('study-title').setAttribute('tabindex','-1');$('study-title').focus({preventScroll:true});
});
$('another-piece').addEventListener('click',async()=>{
 const next=repertoireShuffle.next(repertoireId(currentId));if(!next)return;
 const wasPlaying=transport.playing;
 const request=selectStudy(next);
 const epoch=loadEpoch;
 await request;
 if(epoch!==loadEpoch||currentId!==next)return;
 $('discovery-status').textContent=[$('study-title').textContent,$('study-composer').textContent].join(', ');
 if(wasPlaying&&!document.hidden&&!transport.playing)$('play').click();
});
let paintingIndex=0;
$('next-painting').addEventListener('click',()=>{
 const works=DATA.gallery.works;
 paintingIndex=(paintingIndex+1)%works.length;
 const art=works[paintingIndex],figure=$('room-painting'),image=$('painting-image'),credit=$('painting-credit');
 figure.dataset.painting=art.id;
 figure.querySelector('source').srcset=art.mobileImage;
 image.src=art.image;image.width=art.width;image.height=art.height;image.alt=art.alt;
 credit.href=safeURL(art.url);credit.textContent=art.artist+' · '+art.title+', '+art.date;
});
const workingCities=new Map();
for(const composer of composers){
 if(!workingCities.has(composer.city))workingCities.set(composer.city,[]);
 workingCities.get(composer.city).push(composer);
}
function renderMap(){
 const available=new Set(filtered.map(c=>c.id));
 const activeCity=filtered.find(c=>c.id===selected)?.city||filtered[0]?.city;
 const labels=new Set(['Leipzig','London','Venice','Paris','Madrid','Lübeck','Rome',activeCity]);
 const caption=[],markers=[];
 for(const [city,residents] of workingCities){
  const eligible=residents.filter(c=>available.has(c.id));
  const composer=eligible.find(c=>c.id===selected)||eligible[0]||residents[0];
  const [x,y]=projectCity(composer.coordinates).map(n=>Math.round(n*10)/10);
  if(x<0||x>800||y<0||y>530)continue;
  const isSelected=eligible.some(c=>c.id===selected),radius=isSelected?8:eligible.length>1?6:4;
  const text=city+' · '+eligible.length+' composer'+(eligible.length===1?'':'s');
  markers.push(`<g class="map-marker${eligible.length?'':' dim'}" data-composer="${esc(composer.id)}" role="button" tabindex="${city===activeCity?'0':'-1'}" aria-disabled="${!eligible.length}" aria-label="${esc(text)}" aria-pressed="${isSelected}"><title>${esc(text)}</title><circle class="map-hit" cx="${x}" cy="${y}" r="11"/><circle class="outer" cx="${x}" cy="${y}" r="${radius}"/><circle class="inner" cx="${x}" cy="${y}" r="${isSelected?3:2}"/></g>`);
  if(labels.has(city)&&eligible.length)caption.push(`<text class="map-city" x="${x+10}" y="${y-7}">${esc(city)}</text>`);
 }
 $('map-labels').innerHTML=caption.join('');
 $('markers').innerHTML=markers.join('');
}
function renderDirectory(){
 $('result-count').textContent=`${filtered.length} composer${filtered.length===1?'':'s'}`;
 $('directory').innerHTML=filtered.length?filtered.map(c=>`<button class="composer-name" data-composer="${esc(c.id)}" aria-pressed="${c.id===selected}"><span>${esc(c.name)}</span></button>`).join(''):'<p class="map-note">No composers match these filters. Try a name, city or a wider period.</p>';
}
function showComposer(id,{updateURL=true}={}){
 if(!byId.has(id))return;selected=id;const c=byId.get(id),entry=byWorks.get(id),works=entry?.works||[];
 const portrait=DATA.portraits.portraits.find(p=>p.id===id),biography=DATA.biographies?.[id];
 $('composer').innerHTML=`<div class="overline"><span>${esc(c.origin)} · ${esc(c.cataloguePeriod)}</span></div>${portrait?`<figure class="composer-portrait"><img src="${esc(portrait.inline||portrait.file)}" alt="${esc(portrait.subject)}. ${esc(portrait.caption)}" width="${portrait.width}" height="${portrait.height}" loading="lazy"><figcaption>${htmlLink(portrait.source_url,portrait.creator+' · '+portrait.date)}<span>${esc(portrait.caption)}</span></figcaption></figure>`:''}<img class="atlas-pixel" src="${composerPixel(c.id)}" width="32" height="34" alt="" loading="lazy"><h2>${esc(c.name)}</h2><p class="life">${esc(c.dates)} <span>·</span> ${esc(c.city)}</p>${biography?`<details class="composer-biography"><summary>Life and work</summary><p>${esc(biography.text)}</p>${htmlLink(biography.source,'Biographical source')}</details>`:(c.note?`<p class="bio">${esc(c.note)}</p>`:'')}<div class="tags">${c.traditions.map(t=>`<span>${esc(t==='german'?'German-speaking':t[0].toUpperCase()+t.slice(1))}</span>`).join('')}</div>${c.listen?`<blockquote class="listen-note">${esc(c.listen)}</blockquote>`:''}<div class="works-label"><span>Five starting points</span></div><ol class="works">${works.map((w,i)=>`<li><span class="number">${i+1}</span><div><div class="work-title">${esc(w.title)}</div><div class="work-links">${htmlLink(w.score,'Score')}${htmlLink(w.performance,'Recording search')}${w.native&&movementById.has(w.native)?`<button data-study="${esc(w.native)}">Open score</button>`:''}</div></div></li>`).join('')}</ol><div class="composer-source">${htmlLink(c.source,'Biography')}${htmlLink(c.indexSource,'Full source catalogue')}</div>`;
 const peers=(workingCities.get(c.city)||[]).filter(person=>filtered.includes(person));
 if(peers.length>1){
  const label=document.createElement('label');label.className='city-composers';label.textContent='Composers in '+c.city;
  const select=document.createElement('select');select.id='city-composers';
  for(const person of peers)select.append(new Option(person.name,person.id,false,person.id===id));
  label.append(select);$('composer').querySelector('.life').after(label);
 }

 const local=repertoirePieces.filter(piece=>piece.composer===id);
 if(local.length){
  const openShelf=document.createElement('button');openShelf.type='button';openShelf.className='composer-room-link';openShelf.dataset.browseComposer=id;
  openShelf.textContent='Browse '+local.length+' playable selection'+(local.length===1?'':'s')+' ↑';
  $('composer').querySelector('.works-label').before(openShelf);
 }
 renderDirectory();renderMap();
 const image=$('composer').querySelector('.composer-portrait img');if(image)image.addEventListener('error',()=>image.closest('figure').hidden=true,{once:true});
 if(updateURL&&location.protocol.startsWith('http')){try{const u=new URL(location.href);u.searchParams.set('composer',id);history.replaceState({},'',u);}catch{}}
}
function applyFilters(){
 filtered=filterComposers(composers,{query:$('search').value,origin:$('origin').value,tradition:$('tradition').value,period:$('period').value});
 $('random').disabled=!filtered.length;$('composer').hidden=!filtered.length;
 if(filtered.length)showComposer(filtered.find(c=>c.id===selected)?.id||filtered[0].id,{updateURL:false});
 else {renderDirectory();renderMap();}
}
for(const id of ['origin','tradition','period'])$(id).addEventListener('change',applyFilters);
$('search').addEventListener('input',applyFilters);
$('clear').addEventListener('click',()=>{for(const id of ['search','origin','tradition','period'])$(id).value='';applyFilters();});
$('directory').addEventListener('click',e=>{const b=e.target.closest('[data-composer]');if(b)showComposer(b.dataset.composer);});
$('markers').addEventListener('click',e=>{const b=e.target.closest('[data-composer]');if(b&&!b.classList.contains('dim'))showComposer(b.dataset.composer);});
$('markers').addEventListener('keydown',async event=>{
 const marker=event.target.closest('[data-composer]');if(!marker||marker.classList.contains('dim'))return;
 if(event.key==='Enter'||event.key===' '){
  event.preventDefault();await showComposer(marker.dataset.composer);$('markers').querySelector('[tabindex="0"]')?.focus();return;
 }
 if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
 event.preventDefault();
 const active=[...$('markers').querySelectorAll('.map-marker:not(.dim)')],index=active.indexOf(marker);
 const direction=['ArrowLeft','ArrowUp'].includes(event.key)?-1:1;
 const next=event.key==='Home'?0:event.key==='End'?active.length-1:(index+direction+active.length)%active.length;
 marker.setAttribute('tabindex','-1');active[next].setAttribute('tabindex','0');active[next].focus();
});
$('composer').addEventListener('change',async event=>{
 if(event.target.id!=='city-composers')return;
 await showComposer(event.target.value);$('city-composers')?.focus({preventScroll:true});
});
$('random').addEventListener('click',()=>{if(!filtered.length)return;const other=filtered.filter(c=>c.id!==selected),pool=other.length?other:filtered;const random=new Uint32Array(1);crypto.getRandomValues(random);showComposer(pool[random[0]%pool.length].id);});
$('composer').addEventListener('click',e=>{
 const browse=e.target.closest('[data-browse-composer]');
 if(browse){$('piece-composer').value=browse.dataset.browseComposer;$('piece-family').value='';$('piece-search').value='';resetRepertoire();browseRepertoire();return;}
 const b=e.target.closest('[data-study]');if(b){selectStudy(b.dataset.study);jumpToScore();}
});
$('map-help').addEventListener('click',()=>$('map-dialog').showModal());$('close-map').addEventListener('click',()=>$('map-dialog').close());$('map-dialog').addEventListener('click',e=>{if(e.target===$('map-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
function sourceMetadata(){return currentStudy?.notationMetadata||DATA.notationMetadata?.records?.[currentId]||{};}
function renderScoreAt(position,{force=false}={}){
 if(curatedById.has(currentId)){
  authoredScore?.follow(position,transport.enabled,{scroll:transport.playing&&$('score-follow').checked});
  const bar=barAt(currentStudy.measureTimes,position);
  if(bar){
   if(document.activeElement!==$('jump-bar'))$('jump-bar').value=bar.number;
   $('score-prev').disabled=bar.index===0;$('score-next').disabled=bar.index===currentStudy.measureTimes.length-1;
  }
  return;
 }
 const metadata=sourceMetadata(),barDuration=(metadata.secondsPerBeat||.5)*(metadata.beatsPerBar||4);
 const barCount=Number($('score-window').value);
 const page=playbackPage(studyBars,manualScoreStart??position,barCount);
 const windowSeconds=page?page.end-page.start:Math.min(60,Math.max(2,barDuration*barCount));
 const autoStart=Math.floor(Math.max(0,Math.min(position,currentStudy.duration-.0001))/windowSeconds)*windowSeconds;
 const start=page?.start??manualScoreStart??autoStart;
 if(force||!scoreState||Math.abs(scoreState.windowStart-start)>.01){
  scoreState=renderPlaybackScore(currentStudy,{...metadata,position,windowStart:start,windowSeconds,width:1040,colors:VOICE_COLORS});
  scoreState.previousStart=page?.previousStart??Math.max(0,start-windowSeconds);
  $('score').innerHTML=scoreState.svg;
  $('score-page').textContent=page?(page.firstBar===page.lastBar?'Bar '+page.firstBar:'Bars '+page.firstBar+'–'+page.lastBar):`${formatTime(scoreState.windowStart)}–${formatTime(scoreState.windowEnd)}`;
  $('score-prev').disabled=scoreState.windowStart<=0;$('score-next').disabled=scoreState.windowEnd>=currentStudy.duration;
 }
 const bar=barAt(studyBars,position);
 if(bar&&document.activeElement!==$('jump-bar'))$('jump-bar').value=bar.number;
 highlightPlaybackScore($('score'),position,transport.enabled);
 if(transport.playing&&$('score-follow').checked&&$('score').scrollWidth>$('score').clientWidth&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const fraction=(position-scoreState.windowStart)/(scoreState.windowEnd-scoreState.windowStart);$('score').scrollLeft=Math.max(0,fraction*$('score').scrollWidth-$('score').clientWidth*.4);}
}
async function setupStudy(study,id,signal){
 authoredScore?.dispose();authoredScore=null;
 currentStudy=validateStudy(study);currentId=id;if(location.protocol.startsWith('http')){try{const url=new URL(location.href);url.searchParams.set('movement',id);history.replaceState({},'',url);}catch{}}scoreState=null;manualScoreStart=null;$('score-follow').checked=true;
 repertoireShuffle.mark(repertoireId(id));
 if(currentMidiURL){URL.revokeObjectURL(currentMidiURL);currentMidiURL=null;}
 studyBars=curatedById.has(id)?study.measureTimes||[]:playbackMeasures(sourceMetadata().barTimes,study.duration);
 if($('repertoire').open)renderRepertoire();
 transport.load(currentStudy);setPlaying(false);$('movement').value=id;$('seek').max=study.duration;$('seek').value=0;$('duration').textContent=formatTime(study.duration);
 loopA=null;$('loop-state').textContent='Loop off';
 const special=id==='partita-study',m=movementById.get(id),right=DATA.rights.editions.find(e=>e.id===id),metadata=sourceMetadata(),authored=curatedById.get(id),edition=editionById.get(id);
 $('study-pixel').src = composerPixel(special ? 'bach' : m?.composer);
 $('study-composer').textContent=special?'J. S. Bach · BWV 825':m?.composerName||'Keyboard study';
 const danceMovement=m?.collection && /^(Partita|French Suite)/.test(m.collection);
 $('study-title').textContent=special?'Praeludium · the first six bars':danceMovement?m.collection+' · '+m.title:m?.title||id;
 $('study-description').textContent=special?'The source defines upper, middle and bass voices. Mute or solo them, then bring them together.':'Colors identify the source MIDI tracks. A track can contain several musical voices. The complete movement plays locally.';
 $('voices').innerHTML=study.tracks.map((t,i)=>`<div class="voice-control"><button class="voice-toggle voice-${i%VOICE_COLORS.length}" data-track="${i}" aria-pressed="true" title="${esc(t.description||'Source MIDI track. It may carry more than one musical voice.')}">${esc(t.label||'Source track '+(i+1))}</button><button class="solo" data-solo="${i}" aria-pressed="false" aria-label="Solo ${esc(t.label||'track '+(i+1))}">Solo</button></div>`).join('')+'<button id="all-voices" class="text-button">All together</button>';
 $('notation-note').textContent=`Playback notation from source MIDI. Note spelling, clefs, rests and rhythm symbols are inferred; timing and color follow the source. ${metadata.meter?`${metadata.meter.numerator}/${metadata.meter.denominator}. `:''}Open the source edition for its full engraving.`;
 if(special){$('source-score').innerHTML=DATA.studyScore;$('source-score-note').textContent='Source-aligned engraving, bars 1–6. Its three colors identify independent source-defined voices.';}
 else if(m?.preview){$('source-score').innerHTML=`<img src="assets/music/${esc(m.preview)}" alt="Opening source page for ${esc(m.collection)}" loading="lazy">`;$('source-score-note').textContent='Static opening page of this edition. Playback notation above follows the complete movement.';}
 else{$('source-score').innerHTML='';$('source-score-note').textContent='Read the complete engraving through the source edition link below. The playback notation above remains available for every local selection.';}
 $('edition-note').textContent=right?right.attribution:'Source: Mutopia Project.';$('score-link').href=safeURL(right?.currentScoreSource||m?.source||'https://www.mutopiaproject.org/');$('midi-link').href=`assets/music/${id}.mid`;
 const query=special?'Johann Sebastian Bach Partita No. 1 BWV 825 Praeludium':`${m?.composerName||''} ${m?.collection==='Selected miniature'?'':m?.collection||''} ${m?.title||id}`;
 $('recording-link').href='https://www.youtube.com/results?search_query='+encodeURIComponent(query);
 $('audio-status').textContent='';
 $('score-position').textContent='';
 $('score-window').closest('label').hidden=Boolean(authored);$('score-view').closest('label').hidden=!authored;
 $('bar-navigation').hidden=!studyBars.length;$('repeat-bar').hidden=!studyBars.length;
 for(const id of ['score-prev','score-next']){
  $(id).hidden=false;
  $(id).textContent=(id==='score-prev'?'Previous':'Next')+(authored?' bar':' page');
  $(id).setAttribute('aria-label',$(id).textContent);
 }
 $('jump-bar').min=studyBars[0]?.number??1;
 $('jump-bar').max=studyBars.at(-1)?.number??1;
 $('bar-total').textContent='/ '+(studyBars.at(-1)?.number??1);
 $('repeat-bar').setAttribute('aria-pressed','false');
 $('edition-preview').hidden=Boolean(authored);
 $('edition-credit').hidden=!edition;$('score-link').textContent='Source edition';
 if(edition){
  $('study-description').textContent=edition.note||'Follow each coloured part while listening to the piano.';
  $('edition-note').textContent=[edition.instrumentation?'Scored for '+edition.instrumentation:null,edition.edition,edition.attribution,edition.license].filter(Boolean).join(' · ');
  const scoreFormat=edition.scoreUrl?.match(/\.(pdf|zip)(?:$|[?#])/i)?.[1]?.toUpperCase();
  $('score-link').textContent='Published score'+(scoreFormat?' ('+scoreFormat+')':'');
  $('score-link').href=safeURL(edition.scoreUrl||edition.source);$('recording-link').href=safeURL(edition.recordingSearch);
  $('edition-credit').querySelector('a').href=safeURL(edition.source);
  $('midi-link').href='#study';$('midi-link').download=id+'.mid';
  $('notation-note').textContent='The local reading score follows the timed pitches. Staff spacing, spelling and rhythm symbols are supplied for this view. Open the source edition to see the original notation.';
  $('edition-preview').hidden=true;
 }else $('midi-link').download='';
 if(authored){
  const independent = ['independent-voices','actual-voice'].includes(authored.voiceKind);
  $('study-description').textContent = authored.listeningNote || listeningNotes[id] || (independent
    ? 'Follow the coloured voices or solo a line to hear where it enters.'
    : 'Listen to the two staves together, or solo each part.');
  $('recording-link').href = safeURL(authored.recordingSearch || $('recording-link').href);
  $('notation-note').textContent='One musical line at a time, with both staves together. Colors follow the source voices or parts. Beam groups are supplied for reading. Choose a note to start there, or open the full score.';
  $('edition-note').textContent=[authored.attribution,authored.license,authored.editionCredit||'Study edition from the credited Mutopia source.'].filter(Boolean).join(' · ');$('score-link').href=safeURL(authored.source);$('midi-link').href=authored.midi||authored.noteData.replace(/\.json$/,'.mid');
 $('score-page').textContent='';$('source-score').replaceChildren();$('score').textContent='Opening the complete score…';authoredScore=new AuthoredScore($('score'),$('score-position'));
 }
 rollStart=0;renderRoll();renderScoreAt(0,{force:true});frame(0);
 if(authored){await authoredScore.load(authored,currentStudy,{signal});if(!signal?.aborted){authoredScore.setView($('score-view').value);authoredScore.follow(0,transport.enabled);}}
}
async function selectStudy(id){
 const epoch=++loadEpoch;studyAbort?.abort();studyAbort=new AbortController();const signal=studyAbort.signal;transport.pause();setPlaying(false);$('play').disabled=true;$('study').classList.add('is-loading');
 try{let study;if(id==='partita-study')study=DATA.study;
  else if(editionById.has(id))study=await loadLibraryStudy(editionById.get(id),{signal});
  else{if(!movementById.has(id))throw Error('Unknown study');const response=await fetch(curatedById.get(id)?.noteData||`assets/music/${id}.json`,{credentials:'same-origin',signal});if(!response.ok)throw Error('The selected score could not be loaded. Choose it again to retry.');const text=await response.text();if(text.length>2_000_000)throw Error('Unexpected study size');study=JSON.parse(text);}
  if(epoch!==loadEpoch)return;await setupStudy(study,id,signal);}
 catch(error){if(epoch===loadEpoch){$('audio-status').textContent=error.message;$('movement').value=currentId;}}
 finally{if(epoch===loadEpoch){$('play').disabled=false;$('study').classList.remove('is-loading');}}
}
function renderRoll(){
 if (!document.querySelector('.roll-disclosure').open) return;
 const notes=currentStudy.tracks.flatMap((t,track)=>t.notes.map(n=>({n,track}))),pitches=notes.map(r=>r.n[0]),low=Math.min(...pitches)-2,high=Math.max(...pitches)+2;rollWidth=Math.min(currentStudy.duration,36);rollNotes=[];
 const width=800,height=200,left=22,right=12,top=12,bottom=22;
 let markup='';if(transport.loop){const x1=left+(Math.max(rollStart,transport.loop.start)-rollStart)/rollWidth*(width-left-right),x2=left+(Math.min(rollStart+rollWidth,transport.loop.end)-rollStart)/rollWidth*(width-left-right);if(x2>x1)markup+=`<rect x="${x1}" y="0" width="${x2-x1}" height="200" fill="#d8b45d" opacity=".17"/>`;}for(let pitch=Math.ceil(low/12)*12;pitch<=high;pitch+=12){const y=top+(high-pitch)/(high-low)*(height-top-bottom);markup+=`<path d="M${left},${y}H${width-right}" stroke="#cbd0c0" stroke-width=".7"/><text x="3" y="${y+3}" fill="#7a887a" font-size="8">C${Math.floor(pitch/12)-1}</text>`;}
 for(let t=rollStart;t<=rollStart+rollWidth;t+=6){const x=left+(t-rollStart)/rollWidth*(width-left-right);markup+=`<path d="M${x},${top}V${height-bottom}" stroke="#d7d9cb" stroke-width=".6"/><text x="${x+2}" y="195" fill="#7a887a" font-size="8">${Math.round(t)}s</text>`;}
 for(const {n,track}of notes)if(n[1]<rollStart+rollWidth&&n[1]+n[2]>rollStart){const x=left+(Math.max(rollStart,n[1])-rollStart)/rollWidth*(width-left-right),y=top+(high-n[0])/(high-low)*(height-top-bottom),w=Math.min(n[2],rollStart+rollWidth-n[1])*(width-left-right)/rollWidth;const key=rollNotes.length;rollNotes.push({n,track,key});markup+=`<rect data-note="${key}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${Math.max(1,w).toFixed(2)}" height="3.3" rx=".7" fill="${VOICE_COLORS[track%VOICE_COLORS.length]}" opacity="${transport.enabled[track]?'.8':'.12'}"/>`;}
 markup+='<path id="playhead" class="playhead" d="M22,7V181"/>';$('roll').innerHTML=markup;for(const r of rollNotes)r.element=$('roll').querySelector(`[data-note="${r.key}"]`);
}
function frame(position){
 if(!currentStudy)return;renderScoreAt(position);$('elapsed').textContent=formatTime(position);$('seek').value=position;
 if (!document.querySelector('.roll-disclosure').open) return;
 if(position<rollStart||position>rollStart+rollWidth-.5){rollStart=Math.min(Math.max(0,currentStudy.duration-rollWidth),Math.floor(position/24)*24);renderRoll();}
 const x=22+(position-rollStart)/rollWidth*766;$('playhead')?.setAttribute('d',`M${x},7V181`);
 if(performance.now()-lastFrame>65||!transport.playing){for(const r of rollNotes){const active=transport.enabled[r.track]&&r.n[1]<=position&&r.n[1]+r.n[2]>position;r.element?.setAttribute('opacity',transport.enabled[r.track]?(active?'1':'.7'):'.12');r.element?.setAttribute('class',active?'now':'');}for(const r of scoreDots)r.dot.setAttribute('display',transport.enabled[r.track]&&r.start<=position&&r.end>position?'inline':'none');lastFrame=performance.now();}
}
$('play').addEventListener('click',async()=>{
 if(transport.playing){transport.pause();setPlaying(false);return;}
 const requested=loadEpoch;
 $('play').disabled=true;
 $('audio-status').textContent='Preparing grand piano…';
 try{
  await transport.play();
  if(requested!==loadEpoch)return;
  setPlaying(transport.playing);
  if(transport.playing){
   $('audio-status').textContent='Sampled grand piano · Use the voice controls to listen to one part.';
  }
 }catch(error){if(requested===loadEpoch)reportAudio(error);}
 finally{if(requested===loadEpoch)$('play').disabled=false;}
});
document.querySelector('.roll-disclosure').addEventListener('toggle',()=>{if(transport.study){renderRoll();frame(transport.position);}});
$('seek').addEventListener('input',()=>transport.seek($('seek').value).catch(e=>$('audio-status').textContent=e.message));
$('speed').addEventListener('change',()=>transport.setRate(Number($('speed').value)).catch(e=>$('audio-status').textContent=e.message));
$('volume').addEventListener('input',()=>transport.setVolume(Number($('volume').value)));
$('voices').addEventListener('click',e=>{const solo=e.target.closest('[data-solo]');if(solo){const index=Number(solo.dataset.solo);transport.setSolo(transport.soloTrack===index?null:index);syncVoiceButtons();renderRoll();return;}const b=e.target.closest('[data-track]');if(b){const index=Number(b.dataset.track);transport.setVoice(index,!transport.enabled[index]);b.setAttribute('aria-pressed',String(transport.enabled[index]));renderRoll();}else if(e.target.id==='all-voices'){transport.setSolo(null);for(const b of $('voices').querySelectorAll('[data-track]'))b.setAttribute('aria-pressed','true');renderRoll();}});
function syncVoiceButtons(){for(const b of $('voices').querySelectorAll('[data-track]'))b.setAttribute('aria-pressed',String(transport.enabled[Number(b.dataset.track)]));for(const b of $('voices').querySelectorAll('[data-solo]'))b.setAttribute('aria-pressed',String(transport.soloTrack===Number(b.dataset.solo)));}
$('movement').addEventListener('change',()=>selectStudy($('movement').value));
$('midi-link').addEventListener('click',event=>{
 if(!editionById.has(currentId))return;
 try{
  if(!currentMidiURL)currentMidiURL=URL.createObjectURL(new Blob([encodeLibraryMidi(currentStudy)],{type:'audio/midi'}));
  $('midi-link').href=currentMidiURL;
 }catch(error){event.preventDefault();reportAudio(error);}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){const active=transport.playing;transport.pause();setPlaying(false);if(active)$('audio-status').textContent='Paused while the page is in the background.';}});
$('score').addEventListener('click',e=>{const note=e.target.closest('[data-seek]');if(note)transport.seek(Number(note.dataset.seek)).catch(reportAudio);});
$('score').addEventListener('keydown',e=>{const note=e.target.closest('[data-seek]');if(!note)return;if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();e.stopPropagation();moveScoreFocus($('score'),note,e.key==='Home'?'first':e.key==='End'?'last':e.key==='ArrowLeft'?-1:1);}else if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();transport.seek(Number(note.dataset.seek)).catch(reportAudio);}});
const reportAudio=error=>$('audio-status').textContent=error.message;
function moveBar(offset){
 const bar=barAt(currentStudy.measureTimes,transport.position),next=bar&&currentStudy.measureTimes[bar.index+offset];
 if(next)seekBar(next);
}
function seekBar(bar){
 if(transport.loop){transport.clearLoop();$('repeat-bar').setAttribute('aria-pressed','false');$('loop-state').textContent='Loop off';}
 manualScoreStart=null;$('score-follow').checked=true;
 transport.seek(bar.start).catch(reportAudio);
}
$('score-prev').addEventListener('click',()=>{if(curatedById.has(currentId)){moveBar(-1);return;}manualScoreStart=scoreState.previousStart;$('score-follow').checked=false;renderScoreAt(transport.position,{force:true});});
$('score-next').addEventListener('click',()=>{if(curatedById.has(currentId)){moveBar(1);return;}manualScoreStart=Math.min(currentStudy.duration-.001,scoreState.windowEnd);$('score-follow').checked=false;renderScoreAt(transport.position,{force:true});});
$('jump-bar').addEventListener('change',()=>{
 const bar=studyBars.find(row=>String(row.number)===$('jump-bar').value);
 if(bar)seekBar(bar);else renderScoreAt(transport.position);
});
$('repeat-bar').addEventListener('click',()=>{
 if(transport.loop){transport.clearLoop();$('repeat-bar').setAttribute('aria-pressed','false');$('loop-state').textContent='Loop off';renderRoll();return;}
 const bar=barAt(studyBars,transport.position);if(!bar)return;
 transport.setLoop(bar.start,Math.min(bar.end,currentStudy.duration));
 $('repeat-bar').setAttribute('aria-pressed','true');$('loop-state').textContent='Repeating bar '+bar.number;
 transport.seek(bar.start).catch(reportAudio);renderRoll();
});
function focusScore(focused){
 document.body.classList.toggle('score-focus',focused);$('focus-score').setAttribute('aria-pressed',String(focused));
 $('focus-score').textContent=focused?'Exit score view':'Focus on the score';
 if(focused)$('study').scrollIntoView({block:'start',behavior:'auto'});else $('focus-score').focus();
}
$('focus-score').addEventListener('click',()=>focusScore(!document.body.classList.contains('score-focus')));
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.body.classList.contains('score-focus')){event.preventDefault();focusScore(false);}});
$('score-follow').addEventListener('change',()=>{if(curatedById.has(currentId)){renderScoreAt(transport.position);return;}manualScoreStart=$('score-follow').checked?null:scoreState.windowStart;renderScoreAt(transport.position,{force:true});});
$('score-view').addEventListener('change',()=>authoredScore?.setView($('score-view').value));
$('score-window').addEventListener('change',()=>{manualScoreStart=null;$('score-follow').checked=true;renderScoreAt(transport.position,{force:true});});
$('score-large').addEventListener('change',()=>$('score').classList.toggle('large-notation',$('score-large').checked));
$('loop-a').addEventListener('click',()=>{loopA=transport.position;$('loop-state').textContent=`A ${formatTime(loopA)}. Choose B.`;});
$('loop-b').addEventListener('click',()=>{try{transport.setLoop(loopA??0,transport.position);$('loop-state').textContent=`Loop ${formatTime(transport.loop.start)}–${formatTime(transport.loop.end)}`;renderRoll();}catch(error){$('loop-state').textContent=error.message;}});
$('loop-clear').addEventListener('click',()=>{transport.clearLoop();$('repeat-bar').setAttribute('aria-pressed','false');loopA=null;$('loop-state').textContent='Loop off';renderRoll();});
$('study').addEventListener('keydown',event=>{if(!transport.study)return;if(event.target.closest('input,select,textarea,button,a,summary,[contenteditable],[data-seek]'))return;if(event.key===' '){event.preventDefault();$('play').click();}else if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();transport.seek(transport.position+(event.key==='ArrowLeft'?-5:5)).catch(reportAudio);}else if(event.key==='Home'){event.preventDefault();transport.seek(0).catch(reportAudio);}else if(/^[1-9]$/.test(event.key)){const i=Number(event.key)-1;if(i<transport.enabled.length){transport.setVoice(i,!transport.enabled[i]);syncVoiceButtons();renderRoll();}}});
window.addEventListener('pagehide',()=>{studyAbort?.abort();authoredScore?.dispose();transport.dispose();if(currentMidiURL)URL.revokeObjectURL(currentMidiURL);});
$('education').innerHTML=DATA.education.sections.map(section=>`<section class="education-section"><h3>${esc(section.title)}</h3><dl>${section.items.map(item=>`<div><dt>${esc(item.term)}</dt><dd>${esc(item.text)}</dd></div>`).join('')}</dl></section>`).join('');
connectWorkArchive(DATA.archive);
const initialMovement=new URLSearchParams(location.search).get('movement');
setupStudy(DATA.study,'partita-study');showComposer(selected,{updateURL:false});
if(initialMovement==='partita-study'||movementById.has(initialMovement))selectStudy(initialMovement);else if(curated.length)selectStudy(curated[0].id);
