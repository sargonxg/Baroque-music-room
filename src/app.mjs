import {VOICE_COLORS,projectCity,filterComposers,validateStudy,activeNotes,formatTime,safeURL} from './engine.mjs';
import {KeyboardTransport} from './audio.mjs';
import {renderPlaybackScore,highlightPlaybackScore,moveScoreFocus} from './notation.mjs';
const DATA=JSON.parse(document.getElementById('app-data').textContent);
const $=id=>document.getElementById(id),esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const htmlLink=(url,text)=>`<a href="${esc(safeURL(url))}" target="_blank" rel="noopener">${esc(text)}</a>`;
const composers=DATA.composers,byId=new Map(composers.map(c=>[c.id,c])),byWorks=new Map(DATA.works.entries.map(e=>[e.composer,e]));
let selected=byId.has(new URLSearchParams(location.search).get('composer'))?new URLSearchParams(location.search).get('composer'):'bach';
let filtered=composers,currentStudy=DATA.study,currentId='partita-study',loadEpoch=0,rollStart=0,rollWidth=36,rollNotes=[],lastFrame=0,scoreDots=[];
const allMovements=DATA.catalogue.works.flatMap(w=>w.movements.map(m=>({...m,composer:'bach',composerName:'J. S. Bach',collection:w.title,preview:w.preview})));
allMovements.push(...DATA.catalogue.miniatures.map(m=>({...m,composerName:byId.get(m.composer)?.name,collection:'Selected miniature'})));
const movementById=new Map(allMovements.map(m=>[m.id,m]));
let scoreState=null,manualScoreStart=null,loopA=null;
const transport=new KeyboardTransport(frame,()=>setPlaying(false));
function setPlaying(playing){$('play').innerHTML=playing?'Ⅱ <span>Pause</span>':'▶ <span>Listen</span>';$('play').setAttribute('aria-label',playing?'Pause the selected study':'Play the selected study');}
for(const origin of [...new Set(composers.map(c=>c.origin))].sort())$('origin').insertAdjacentHTML('beforeend',`<option>${esc(origin)}</option>`);
for(const tradition of [...new Set(composers.flatMap(c=>c.traditions))].sort())$('tradition').insertAdjacentHTML('beforeend',`<option value="${esc(tradition)}">${esc(tradition==='german'?'German-speaking':tradition[0].toUpperCase()+tradition.slice(1))}</option>`);
$('movement').innerHTML='<option value="partita-study">Bach · BWV 825 · three-voice, six-bar study</option>'+DATA.catalogue.works.map(w=>`<optgroup label="J. S. Bach · ${esc(w.title)}">${w.movements.map(m=>`<option value="${esc(m.id)}">${esc(m.title)}</option>`).join('')}</optgroup>`).join('')+`<optgroup label="Handel · Scarlatti · Purcell">${DATA.catalogue.miniatures.map(m=>`<option value="${m.id}">${esc(byId.get(m.composer)?.name.split(' ').at(-1))} · ${esc(m.title)}</option>`).join('')}</optgroup>`;
function renderMap(){
 const available=new Set(filtered.map(c=>c.id));
 // A composer can share a city with others. The directory always exposes every name.
 $('markers').innerHTML=composers.map(c=>{const[x,y]=projectCity(c.coordinates);if(x<0||x>800||y<0||y>500)return '';return `<g class="map-marker${available.has(c.id)?'':' dim'}" data-composer="${esc(c.id)}" role="button" tabindex="${available.has(c.id)?'0':'-1'}" aria-label="${esc(c.name)}, ${esc(c.city)}" aria-pressed="${c.id===selected}"><title>${esc(c.name)} · ${esc(c.city)}</title><circle class="outer${c.id===selected?' pulse':''}" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${c.id===selected?'13':'5.5'}"/><circle class="inner" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${c.id===selected?'4':'2'}"/></g>`;}).join('');
 // Put the selected dot last, so it remains visible above shared-city dots.
 const current=$('markers').querySelector(`[data-composer="${selected}"]`);if(current)$('markers').append(current);
 const cityIds=['bach','handel','vivaldi','couperin','scarlatti','buxtehude','froberger'];
 $('map-labels').innerHTML=cityIds.filter(id=>byId.has(id)).map(id=>{const c=byId.get(id),[x,y]=projectCity(c.coordinates);return `<text class="map-city" x="${x+11}" y="${y-7}">${esc(c.city)}</text>`;}).join('');
 const c=byId.get(selected),[x,y]=projectCity(c.coordinates);const a=projectCity([12.3155,45.4408]),b=projectCity([2.3522,48.8566]);
 $('routes').innerHTML=c.id==='bach'?`<path class="map-route" d="M${a} Q${x+85},${y+55} ${x},${y} Q${x-100},${y-50} ${b}"/>`:'';
}
function renderDirectory(){
 $('result-count').textContent=`${filtered.length} composer${filtered.length===1?'':'s'}`;
 $('directory').innerHTML=filtered.length?filtered.map((c,i)=>`<button class="composer-name" data-composer="${esc(c.id)}" aria-pressed="${c.id===selected}"><small>${String(i+1).padStart(2,'0')}</small><span>${esc(c.name)}</span></button>`).join(''):'<p class="map-note">No composers match these filters. Try a name, city or a wider period.</p>';
}
function showComposer(id,{updateURL=true}={}){
 if(!byId.has(id))return;selected=id;const c=byId.get(id),entry=byWorks.get(id),works=entry?.works||[];
 const portrait=DATA.portraits.portraits.find(p=>p.id===id),biography=DATA.biographies?.[id];
 $('composer').innerHTML=`<div class="overline"><span>${esc(c.origin)} · ${esc(c.cataloguePeriod)}</span><span>Selected composer</span></div>${portrait?`<figure class="composer-portrait"><img src="${esc(portrait.inline||portrait.file)}" alt="${esc(portrait.subject)}. ${esc(portrait.caption)}" width="${portrait.width}" height="${portrait.height}" loading="lazy"><figcaption>${htmlLink(portrait.source_url,portrait.creator+' · '+portrait.date)}<span>${esc(portrait.caption)}</span></figcaption></figure>`:''}<h2>${esc(c.name)}</h2><p class="life">${esc(c.dates)} <span>·</span> ${esc(c.city)}</p>${biography?`<details class="composer-biography"><summary>Life and work</summary><p>${esc(biography.text)}</p>${htmlLink(biography.source,'Biographical source ↗')}</details>`:(c.note?`<p class="bio">${esc(c.note)}</p>`:'')}<div class="tags">${c.traditions.map(t=>`<span>${esc(t==='german'?'German-speaking':t[0].toUpperCase()+t.slice(1))}</span>`).join('')}</div>${c.listen?`<blockquote class="listen-note">${esc(c.listen)}</blockquote>`:''}<div class="works-label"><span>Five starting points</span><span>Keyboard first, where available</span></div><ol class="works">${works.map((w,i)=>`<li><span class="number">${i+1}</span><div><div class="work-title">${esc(w.title)}</div><div class="work-links">${htmlLink(w.score,'Score ↗')}${htmlLink(w.performance,'Recording search ↗')}${w.native&&movementById.has(w.native)?`<button data-study="${esc(w.native)}">Play local study ↓</button>`:''}</div></div></li>`).join('')}</ol><div class="composer-source">${htmlLink(c.source,'Biography ↗')}${htmlLink(c.indexSource,'Full source catalog ↗')}</div>${DATA.catalogue.miniatures.some(m=>m.composer===id)?`<p><button class="text-button" data-study="${DATA.catalogue.miniatures.find(m=>m.composer===id).id}">Listen to a local ${esc(c.name.split(' ').at(-1))} study ↓</button></p>`:''}`;
 renderDirectory();renderMap();
 const image=$('composer').querySelector('.composer-portrait img');if(image)image.addEventListener('error',()=>image.closest('figure').hidden=true,{once:true});
 if(updateURL&&location.protocol.startsWith('http')){try{const u=new URL(location.href);u.searchParams.set('composer',id);history.replaceState({},'',u);}catch{}}
}
function applyFilters(){filtered=filterComposers(composers,{query:$('search').value,origin:$('origin').value,tradition:$('tradition').value,period:$('period').value});renderDirectory();renderMap();$('random').disabled=filtered.length===0;}
for(const id of ['origin','tradition','period'])$(id).addEventListener('change',applyFilters);
$('search').addEventListener('input',applyFilters);
$('clear').addEventListener('click',()=>{for(const id of ['search','origin','tradition','period'])$(id).value='';applyFilters();});
$('directory').addEventListener('click',e=>{const b=e.target.closest('[data-composer]');if(b)showComposer(b.dataset.composer);});
$('markers').addEventListener('click',e=>{const b=e.target.closest('[data-composer]');if(b&&!b.classList.contains('dim'))showComposer(b.dataset.composer);});
$('markers').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const b=e.target.closest('[data-composer]');if(b&&!b.classList.contains('dim')){e.preventDefault();showComposer(b.dataset.composer);}}});
$('random').addEventListener('click',()=>{if(!filtered.length)return;const other=filtered.filter(c=>c.id!==selected),pool=other.length?other:filtered;const random=new Uint32Array(1);crypto.getRandomValues(random);showComposer(pool[random[0]%pool.length].id);});
$('composer').addEventListener('click',e=>{const b=e.target.closest('[data-study]');if(b){selectStudy(b.dataset.study);$('study').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}});
$('map-help').addEventListener('click',()=>$('map-dialog').showModal());$('close-map').addEventListener('click',()=>$('map-dialog').close());$('map-dialog').addEventListener('click',e=>{if(e.target===$('map-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
function sourceMetadata(){return DATA.notationMetadata?.records?.[currentId]||{};}
function renderScoreAt(position,{force=false}={}){
 const metadata=sourceMetadata(),barDuration=(metadata.secondsPerBeat||.5)*(metadata.beatsPerBar||4);
 const windowSeconds=Math.min(60,Math.max(2,barDuration*Number($('score-window').value)));
 const autoStart=Math.floor(Math.max(0,Math.min(position,currentStudy.duration-.0001))/windowSeconds)*windowSeconds;
 const start=manualScoreStart===null?autoStart:manualScoreStart;
 if(force||!scoreState||Math.abs(scoreState.windowStart-start)>.01){
  scoreState=renderPlaybackScore(currentStudy,{...metadata,position,windowStart:start,windowSeconds,width:1040,colors:VOICE_COLORS});
  $('score').innerHTML=scoreState.svg;
  $('score-page').textContent=`${formatTime(scoreState.windowStart)}–${formatTime(scoreState.windowEnd)}`;
  $('score-prev').disabled=scoreState.windowStart<=0;$('score-next').disabled=scoreState.windowEnd>=currentStudy.duration;
 }
 highlightPlaybackScore($('score'),position,transport.enabled);
 if(transport.playing&&$('score-follow').checked&&$('score').scrollWidth>$('score').clientWidth&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const fraction=(position-scoreState.windowStart)/(scoreState.windowEnd-scoreState.windowStart);$('score').scrollLeft=Math.max(0,fraction*$('score').scrollWidth-$('score').clientWidth*.4);}
}
function setupStudy(study,id){
 currentStudy=validateStudy(study);currentId=id;if(location.protocol.startsWith('http')){try{const url=new URL(location.href);url.searchParams.set('movement',id);history.replaceState({},'',url);}catch{}}scoreState=null;manualScoreStart=null;$('score-follow').checked=true;
 transport.load(currentStudy);setPlaying(false);$('movement').value=id;$('seek').max=study.duration;$('seek').value=0;$('duration').textContent=formatTime(study.duration);
 loopA=null;$('loop-state').textContent='Loop off';
 const special=id==='partita-study',m=movementById.get(id),right=DATA.rights.editions.find(e=>e.id===id),metadata=sourceMetadata();
 $('study-composer').textContent=special?'J. S. Bach · BWV 825':`${m?.composerName||'Keyboard study'} · ${m?.collection||''}`;
 $('study-title').textContent=special?'Praeludium · the first six bars':m?.title||id;
 $('study-description').textContent=special?'The source defines upper, middle and bass voices. Mute or solo them, then bring them together.':'Colors identify the source MIDI tracks. A track can contain several musical voices. The complete movement plays locally.';
 $('voices').innerHTML=study.tracks.map((t,i)=>`<div class="voice-control"><button class="voice-toggle voice-${i%VOICE_COLORS.length}" data-track="${i}" aria-pressed="true" title="${esc(t.description||'Source MIDI track; not necessarily one contrapuntal voice.')}">${esc(t.label||'Source track '+(i+1))}</button><button class="solo" data-solo="${i}" aria-pressed="false" aria-label="Solo ${esc(t.label||'track '+(i+1))}">Solo</button></div>`).join('')+'<button id="all-voices" class="text-button">All together</button>';
 $('track-levels').innerHTML=study.tracks.map((track,i)=>`<label><span>${esc(track.label||'Track '+(i+1))}</span><input type="range" min="0" max="1" step=".01" value="1" data-level="${i}" aria-label="Level for ${esc(track.label||'track '+(i+1))}"></label>`).join('');
 $('notation-note').textContent=`Playback notation from source MIDI. Note spelling, clefs, rests and rhythm symbols are inferred; timing and color follow the source. ${metadata.meter?`${metadata.meter.numerator}/${metadata.meter.denominator}. `:''}Open the source edition for its full engraving.`;
 if(special){$('source-score').innerHTML=DATA.studyScore;$('source-score-note').textContent='Source-aligned engraving, bars 1–6. Its three colors identify independent source-defined voices.';}
 else if(m?.preview){$('source-score').innerHTML=`<img src="assets/music/${esc(m.preview)}" alt="Opening source page for ${esc(m.collection)}" loading="lazy">`;$('source-score-note').textContent='Static opening page of this edition. Playback notation above follows the complete movement.';}
 else{$('source-score').innerHTML='';$('source-score-note').textContent='Read the complete engraving through the source edition link below. The playback notation above remains available for every local selection.';}
 $('edition-note').textContent=right?right.attribution:'Source: Mutopia Project.';$('score-link').href=safeURL(right?.currentScoreSource||m?.source||'https://www.mutopiaproject.org/');$('midi-link').href=`assets/music/${id}.mid`;
 const query=special?'Johann Sebastian Bach Partita No. 1 BWV 825 Praeludium':`${m?.composerName||''} ${m?.collection==='Selected miniature'?'':m?.collection||''} ${m?.title||id}`;
 $('recording-link').href='https://www.youtube.com/results?search_query='+encodeURIComponent(query);
 $('audio-status').textContent='Local keyboard approximation. Press Listen to start. No recording is streamed.';
 rollStart=0;renderRoll();renderScoreAt(0,{force:true});frame(0);
}
async function selectStudy(id){
 const epoch=++loadEpoch;transport.pause();setPlaying(false);$('play').disabled=true;$('study').classList.add('is-loading');
 try{let study;if(id==='partita-study')study=DATA.study;else{if(!movementById.has(id))throw Error('Unknown study');const response=await fetch(`assets/music/${id}.json`,{credentials:'omit'});if(!response.ok)throw Error('The study file could not be loaded. Run npm run build and serve dist/.');const text=await response.text();if(text.length>2_000_000)throw Error('Unexpected study size');study=JSON.parse(text);}if(epoch!==loadEpoch)return;setupStudy(study,id);}
 catch(error){if(epoch===loadEpoch){$('audio-status').textContent=error.message;$('movement').value=currentId;}}
 finally{if(epoch===loadEpoch){$('play').disabled=false;$('study').classList.remove('is-loading');}}
}
function renderRoll(){
 const notes=currentStudy.tracks.flatMap((t,track)=>t.notes.map(n=>({n,track}))),pitches=notes.map(r=>r.n[0]),low=Math.min(...pitches)-2,high=Math.max(...pitches)+2;rollWidth=Math.min(currentStudy.duration,36);rollNotes=[];
 const width=800,height=200,left=22,right=12,top=12,bottom=22;
 let markup='';if(transport.loop){const x1=left+(Math.max(rollStart,transport.loop.start)-rollStart)/rollWidth*(width-left-right),x2=left+(Math.min(rollStart+rollWidth,transport.loop.end)-rollStart)/rollWidth*(width-left-right);if(x2>x1)markup+=`<rect x="${x1}" y="0" width="${x2-x1}" height="200" fill="#d8b45d" opacity=".17"/>`;}for(let pitch=Math.ceil(low/12)*12;pitch<=high;pitch+=12){const y=top+(high-pitch)/(high-low)*(height-top-bottom);markup+=`<path d="M${left},${y}H${width-right}" stroke="#cbd0c0" stroke-width=".7"/><text x="3" y="${y+3}" fill="#7a887a" font-size="8">C${Math.floor(pitch/12)-1}</text>`;}
 for(let t=rollStart;t<=rollStart+rollWidth;t+=6){const x=left+(t-rollStart)/rollWidth*(width-left-right);markup+=`<path d="M${x},${top}V${height-bottom}" stroke="#d7d9cb" stroke-width=".6"/><text x="${x+2}" y="195" fill="#7a887a" font-size="8">${Math.round(t)}s</text>`;}
 for(const {n,track}of notes)if(n[1]<rollStart+rollWidth&&n[1]+n[2]>rollStart){const x=left+(Math.max(rollStart,n[1])-rollStart)/rollWidth*(width-left-right),y=top+(high-n[0])/(high-low)*(height-top-bottom),w=Math.min(n[2],rollStart+rollWidth-n[1])*(width-left-right)/rollWidth;const key=rollNotes.length;rollNotes.push({n,track,key});markup+=`<rect data-note="${key}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${Math.max(1,w).toFixed(2)}" height="3.3" rx=".7" fill="${VOICE_COLORS[track%VOICE_COLORS.length]}" opacity="${transport.enabled[track]?'.8':'.12'}"/>`;}
 markup+='<path id="playhead" class="playhead" d="M22,7V181"/>';$('roll').innerHTML=markup;for(const r of rollNotes)r.element=$('roll').querySelector(`[data-note="${r.key}"]`);
}
function frame(position){
 if(!currentStudy)return;renderScoreAt(position);$('elapsed').textContent=formatTime(position);$('seek').value=position;
 if(position<rollStart||position>rollStart+rollWidth-.5){rollStart=Math.min(Math.max(0,currentStudy.duration-rollWidth),Math.floor(position/24)*24);renderRoll();}
 const x=22+(position-rollStart)/rollWidth*766;$('playhead')?.setAttribute('d',`M${x},7V181`);
 if(performance.now()-lastFrame>65||!transport.playing){for(const r of rollNotes){const active=transport.enabled[r.track]&&r.n[1]<=position&&r.n[1]+r.n[2]>position;r.element?.setAttribute('opacity',transport.enabled[r.track]?(active?'1':'.7'):'.12');r.element?.setAttribute('class',active?'now':'');}for(const r of scoreDots)r.dot.setAttribute('display',transport.enabled[r.track]&&r.start<=position&&r.end>position?'inline':'none');lastFrame=performance.now();}
}
$('play').addEventListener('click',async()=>{try{if(transport.playing){transport.pause();setPlaying(false);}else{await transport.play();setPlaying(transport.playing);if(transport.playing)$('audio-status').textContent='Playing a local synthesized keyboard; use the colored controls to isolate tracks.';}}catch(e){$('audio-status').textContent=e.message;setPlaying(false);}});
$('restart').addEventListener('click',()=>transport.seek(0).catch(e=>$('audio-status').textContent=e.message));
$('seek').addEventListener('input',()=>transport.seek($('seek').value).catch(e=>$('audio-status').textContent=e.message));
$('speed').addEventListener('change',()=>transport.setRate(Number($('speed').value)).catch(e=>$('audio-status').textContent=e.message));
$('volume').addEventListener('input',()=>transport.setVolume(Number($('volume').value)));
$('voices').addEventListener('click',e=>{const solo=e.target.closest('[data-solo]');if(solo){const index=Number(solo.dataset.solo);transport.setSolo(transport.soloTrack===index?null:index);syncVoiceButtons();renderRoll();return;}const b=e.target.closest('[data-track]');if(b){const index=Number(b.dataset.track);transport.setVoice(index,!transport.enabled[index]);b.setAttribute('aria-pressed',String(transport.enabled[index]));renderRoll();}else if(e.target.id==='all-voices'){transport.setSolo(null);for(const b of $('voices').querySelectorAll('[data-track]'))b.setAttribute('aria-pressed','true');renderRoll();}});
function syncVoiceButtons(){for(const b of $('voices').querySelectorAll('[data-track]'))b.setAttribute('aria-pressed',String(transport.enabled[Number(b.dataset.track)]));for(const b of $('voices').querySelectorAll('[data-solo]'))b.setAttribute('aria-pressed',String(transport.soloTrack===Number(b.dataset.solo)));}
$('movement').addEventListener('change',()=>selectStudy($('movement').value));$('bach-study').addEventListener('click',()=>selectStudy('partita-study'));
document.addEventListener('visibilitychange',()=>{if(document.hidden&&transport.playing){transport.pause();setPlaying(false);$('audio-status').textContent='Paused while the page is in the background.';}});
$('score').addEventListener('click',e=>{const note=e.target.closest('[data-seek]');if(note)transport.seek(Number(note.dataset.seek)).catch(reportAudio);});
$('score').addEventListener('keydown',e=>{const note=e.target.closest('[data-seek]');if(!note)return;if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();e.stopPropagation();moveScoreFocus($('score'),note,e.key==='Home'?'first':e.key==='End'?'last':e.key==='ArrowLeft'?-1:1);}else if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();transport.seek(Number(note.dataset.seek)).catch(reportAudio);}});
const reportAudio=error=>$('audio-status').textContent=error.message;
$('score-prev').addEventListener('click',()=>{manualScoreStart=Math.max(0,scoreState.windowStart-(scoreState.windowEnd-scoreState.windowStart));$('score-follow').checked=false;renderScoreAt(transport.position,{force:true});});
$('score-next').addEventListener('click',()=>{manualScoreStart=Math.min(currentStudy.duration-.001,scoreState.windowEnd);$('score-follow').checked=false;renderScoreAt(transport.position,{force:true});});
$('score-follow').addEventListener('change',()=>{manualScoreStart=$('score-follow').checked?null:scoreState.windowStart;renderScoreAt(transport.position,{force:true});});
$('score-window').addEventListener('change',()=>{manualScoreStart=null;$('score-follow').checked=true;renderScoreAt(transport.position,{force:true});});
$('track-levels').addEventListener('input',e=>{const input=e.target.closest('[data-level]');if(input)transport.setVoiceLevel(Number(input.dataset.level),input.value);});
$('timbre').addEventListener('change',()=>transport.setTimbre($('timbre').value));
$('reverb').addEventListener('input',()=>transport.setReverb($('reverb').value));
$('tuning').addEventListener('change',()=>transport.setTuning($('tuning').value));
$('loop-a').addEventListener('click',()=>{loopA=transport.position;$('loop-state').textContent=`A ${formatTime(loopA)}. Choose B.`;});
$('loop-b').addEventListener('click',()=>{try{transport.setLoop(loopA??0,transport.position);$('loop-state').textContent=`Loop ${formatTime(transport.loop.start)}–${formatTime(transport.loop.end)}`;renderRoll();}catch(error){$('loop-state').textContent=error.message;}});
$('loop-clear').addEventListener('click',()=>{transport.clearLoop();loopA=null;$('loop-state').textContent='Loop off';renderRoll();});
$('menu-toggle').addEventListener('click',()=>{const open=$('menu-toggle').getAttribute('aria-expanded')!=='true';$('menu-toggle').setAttribute('aria-expanded',String(open));$('main-nav').classList.toggle('open',open);});
$('main-nav').addEventListener('click',()=>{$('menu-toggle').setAttribute('aria-expanded','false');$('main-nav').classList.remove('open');});
document.addEventListener('keydown',event=>{if(event.target.closest('input,select,textarea,button,a,summary,[contenteditable],[data-seek]'))return;if(event.key===' '){event.preventDefault();$('play').click();}else if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();transport.seek(transport.position+(event.key==='ArrowLeft'?-5:5)).catch(reportAudio);}else if(event.key==='Home'){event.preventDefault();transport.seek(0).catch(reportAudio);}else if(/^[1-9]$/.test(event.key)){const i=Number(event.key)-1;if(i<transport.enabled.length){transport.setVoice(i,!transport.enabled[i]);syncVoiceButtons();renderRoll();}}});
window.addEventListener('pagehide',()=>transport.dispose());
$('education').innerHTML=DATA.education.sections.map(section=>`<section class="education-section"><h3>${esc(section.title)}</h3><dl>${section.items.map(item=>`<div><dt>${esc(item.term)}</dt><dd>${esc(item.text)}</dd></div>`).join('')}</dl></section>`).join('');
const initialMovement=new URLSearchParams(location.search).get('movement');
setupStudy(DATA.study,'partita-study');showComposer(selected,{updateURL:false});
if(movementById.has(initialMovement))selectStudy(initialMovement);
