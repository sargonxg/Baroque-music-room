/* Authored MusicXML engraving. OSMD is a lazy, same-origin renderer, not an audio service. */
let rendererPromise;
export function loadScoreRenderer(){
 if(globalThis.opensheetmusicdisplay?.OpenSheetMusicDisplay)return Promise.resolve(globalThis.opensheetmusicdisplay);
 if(!rendererPromise)rendererPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='assets/score-renderer/osmd-2.3.0.min.js';script.async=true;
  script.onload=()=>globalThis.opensheetmusicdisplay?.OpenSheetMusicDisplay?resolve(globalThis.opensheetmusicdisplay):reject(Error('The score renderer did not initialise.'));
  script.onerror=()=>{rendererPromise=null;script.remove();reject(Error('The score renderer could not load.'));};document.head.append(script);
 });return rendererPromise;
}
export function timingQuarter(row,study){return Number.isFinite(row.quarter)?row.quarter:row.start/(study.secondsPerQuarter||.5);}
export function barAt(bars,position){
 if(!bars?.length)return null;
 let index=0, high=bars.length;
 while(high-index>1){const middle=(high+index)>>1;if(bars[middle].start<=position)index=middle;else high=middle;}
 return {...bars[index],index};
}
export function pitchName(pitch){
 const names=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
 return names[((pitch%12)+12)%12]+(Math.floor(pitch/12)-1);
}
export function sourceTiming(study){
 if(Array.isArray(study.timing))return study.timing;
 const allowed=['id','part','voice','track','quarter','start','duration','quarterDuration','measure','beat','pitch','voiceColor','color','grace','ties'];
 if(study.timingFormat!=='columns/1'||!Array.isArray(study.timingColumns)||!Array.isArray(study.timingRows)||study.timingRows.length>50000||study.timingColumns.some(key=>!allowed.includes(key)))throw Error('Invalid score timing data.');
 return study.timingRows.map(values=>{if(!Array.isArray(values)||values.length!==study.timingColumns.length)throw Error('Invalid timing row.');return Object.fromEntries(study.timingColumns.map((key,i)=>[key,values[i]]));});
}
export function matchScoreTiming(rows,quarter,pitch,color=''){
 const pool=rows.filter(row=>Math.abs(row.quarter-quarter)<.0001),paint=String(color).toLowerCase();
 const colored=pool.filter(row=>!paint||String(row.color||row.voiceColor||'').toLowerCase()===paint),candidates=colored.length?colored:pool;
 return candidates.find(row=>row.pitch===pitch)||candidates.find(row=>row.pitch===pitch+12)||candidates.find(row=>row.pitch%12===((pitch%12)+12)%12)||null;
}
export class AuthoredScore{
 constructor(host,barLabel=null){this.barLabel=barLabel;this.bars=[];this.lastBar='';this.host=host;this.osmd=null;this.groups=[];this.active=new Set();this.epoch=0;this.enabledKey='';this.lastScroll=0;this.view='passage';this.systems=[];this.pages=[];this.currentSystem=null;this.printStart=()=>{this.printView=this.view;this.setView('full');};this.printEnd=()=>this.setView(this.printView||'passage');window.addEventListener('beforeprint',this.printStart);window.addEventListener('afterprint',this.printEnd);}
 async load(piece,study,{signal}={}){
  const epoch=++this.epoch;this.host.replaceChildren();this.host.classList.add('authored-score');this.host.dataset.state='loading';
  const [library,response]=await Promise.all([loadScoreRenderer(),fetch(piece.score,{signal,credentials:'same-origin'})]);
  if(!response.ok)throw Error('The complete MusicXML score could not load.');const content=await response.arrayBuffer();if(content.byteLength>2_000_000)throw Error('Score exceeds its size limit.');
  if(signal?.aborted||epoch!==this.epoch)return;
  // Score files are pinned, build-validated compressed MusicXML, never a visitor-provided URL.
  const xml=piece.score.endsWith('.mxl')?new Blob([content],{type:'application/vnd.recordare.musicxml'}):new TextDecoder().decode(content);
  const container=document.createElement('div');container.className='authored-engraving';this.host.append(container);
  this.osmd=new library.OpenSheetMusicDisplay(container,{backend:'svg',autoResize:false,autoBeam:true,autoBeamOptions:{beam_rests:false,maintain_stem_directions:false},drawTitle:false,drawSubtitle:false,drawComposer:false,drawPartNames:false,drawMeasureNumbers:true,coloringEnabled:true,coloringMode:0,disableCursor:false,drawingParameters:'compacttight'});
  await this.osmd.load(xml);if(signal?.aborted||epoch!==this.epoch){this.osmd.clear();return;}
  const beats=(this.osmd.Sheet?.SourceMeasures||[]).map(measure=>measure.ActiveTimeSignature).filter(Boolean).map(meter=>[(meter.Numerator>=3&&meter.Numerator%3===0&&meter.Denominator>=8)?3:1,meter.Denominator]);
  if(beats.length&&beats.every(beat=>beat[0]===beats[0][0]&&beat[1]===beats[0][1])&&Number.isInteger(beats[0][1])&&beats[0][1]>0)this.osmd.EngravingRules.AutoBeamOptions.groups=[beats[0]];
  this.osmd.Zoom=1.05;this.osmd.render();
  this.cleanPresentation(container);
  const rows=sourceTiming(study).filter(row=>Number.isFinite(row.start)&&Number.isFinite(row.pitch)).map(row=>({...row,quarter:timingQuarter(row,study)}));
  this.bars=(Array.isArray(study.measureTimes)?study.measureTimes:[]).filter(bar=>Number.isFinite(bar.start)).sort((a,b)=>a.start-b.start);
  this.lastBar='';
  if(!rows.length)throw Error('The authored score has no matched note timing.');
  this.osmd.cursor.reset();const iterator=this.osmd.cursor.Iterator;const byElement=new Map();let visited=0,matched=0;
  while(!iterator.EndReached&&visited<100000){
   for(const voice of iterator.CurrentVoiceEntries||[])for(const note of voice.Notes||[]){
    if(!note.Pitch||note.isRest?.())continue;visited++;
    const quarter=note.getAbsoluteTimestamp().RealValue*4,pitch=note.halfTone;
    const row=matchScoreTiming(rows,quarter,pitch,note.NoteheadColorXml);if(!row)continue;
    const graphical=this.osmd.EngravingRules.GNote(note),element=graphical?.getSVGGElement?.();if(!element)continue;matched++;
    let group=byElement.get(element);if(!group){group={element,rows:[]};byElement.set(element,group);}group.rows.push(row);
   }
   iterator.moveToNext();
  }
  this.osmd.cursor.hide();this.groups=[...byElement.values()];
  for(const group of this.groups){
   const first=group.rows.reduce((a,b)=>a.start<b.start?a:b),track=this.trackFor(first,study,piece);
   group.track=track;group.start=first.start;group.end=Math.max(...group.rows.map(row=>row.start+row.duration));
   const node=group.element;node.classList.add('authored-note','voice-'+track%6);node.setAttribute('data-score-note',String(first.id));node.setAttribute('data-seek',String(first.start));node.setAttribute('data-track',String(track));if(first.measure!=null)node.setAttribute('data-bar',String(first.measure));node.setAttribute('role','button');node.setAttribute('tabindex','-1');
   const label=(study.tracks[track]?.label||'Source voice')+', '+pitchName(first.pitch)+(first.measure!=null?', bar '+first.measure:'')+', '+first.start.toFixed(2)+' seconds. Seek to this note.';
   node.setAttribute('aria-label',label);
   const title=document.createElementNS('http://www.w3.org/2000/svg','title');title.textContent=label;node.append(title);
  }
  this.groups.sort((a,b)=>a.start-b.start||a.track-b.track);this.groups[0]?.element.setAttribute('tabindex','0');
  this.indexSystems(container);
  this.host.dataset.notes=String(matched);this.host.dataset.sourceNotes=String(visited);this.host.dataset.mapping=String(visited?matched/visited:0);this.host.dataset.state='ready';
  if(!matched||matched/Math.max(1,visited)<.95)throw Error('The source engraving and playback could not be fully aligned. Open the source edition.');
  this.follow(0,study.tracks.map(()=>true));
 }
 indexSystems(container){
  this.pages=[...container.querySelectorAll('svg')].map(svg=>({svg,viewBox:svg.getAttribute('viewBox')}));
  this.systems=[];
  for(const page of this.pages){
   const systems=new Map();
   for(const staff of page.svg.querySelectorAll('.osmd-staffline')){
    const key=/^osmd-staffline(\d+)-\d+$/.exec(staff.id)?.[1];if(key==null)continue;
    let system=systems.get(key);if(!system){system={page,staves:[],nodes:[],bars:new Set()};systems.set(key,system);}
    system.staves.push(staff);
    for(const note of staff.querySelectorAll('[data-bar]'))system.bars.add(note.getAttribute('data-bar'));
   }
   let current=null;
   for(const node of page.svg.children){
    const key=/^osmd-staffline(\d+)-\d+$/.exec(node.id)?.[1];
    if(key!=null)current=systems.get(key);
    if(current&&node.tagName.toLowerCase()==='g')current.nodes.push(node);
   }
   for(const system of systems.values()){
    const bounds=system.staves.map(staff=>staff.getBBox());
    const top=Math.min(...bounds.map(b=>b.y)),bottom=Math.max(...bounds.map(b=>b.y+b.height));
    const width=Number(page.viewBox.split(/\s+/)[2]);
    system.viewBox=`0 ${Math.max(0,top-4)} ${width} ${bottom-top+8}`;
    this.systems.push(system);
   }
  }
  this.host.dataset.systems=String(this.systems.length);
  this.setView(this.view);
 }
 setView(view){
  this.view=view==='full'?'full':'passage';this.currentSystem=null;this.host.dataset.scoreView=this.view;
  for(const system of this.systems)for(const node of system.nodes)node.classList.remove('authored-away');
  for(const page of this.pages){page.svg.removeAttribute('hidden');page.svg.setAttribute('viewBox',page.viewBox);}
  if(this.view==='passage')this.showSystem(this.lastBar||String(this.bars[0]?.number??1));
  this.host.scrollTop=0;this.host.scrollLeft=0;
 }
 showSystem(number){
  if(this.view!=='passage')return;
  const system=this.systems.find(row=>row.bars.has(String(number)));if(!system||system===this.currentSystem)return;
  this.currentSystem=system;
  for(const row of this.systems)for(const node of row.nodes)node.classList.toggle('authored-away',row!==system);
  for(const page of this.pages){page.svg.toggleAttribute('hidden',page!==system.page);page.svg.setAttribute('viewBox',page===system.page?system.viewBox:page.viewBox);}
  this.host.dataset.passage=[...system.bars].join(',');
  // Keep the native source engraving intact, including beams, rests, ties and both staves.
  for(const group of this.groups)group.element.setAttribute('tabindex','-1');
  this.groups.find(group=>system.bars.has(String(group.rows[0].measure)))?.element.setAttribute('tabindex','0');
  this.host.scrollTop=0;
 }
 trackFor(row,study,piece){
  if(Number.isInteger(row.track)&&row.track>=0&&row.track<study.tracks.length)return row.track;
  let index=study.tracks.findIndex(track=>String(track.id)===String(row.voice)||String(track.id)===String(row.track));
  if(index<0)index=(piece.voices||[]).findIndex(voice=>String(voice.id)===String(row.voice));
  if(index<0&&Number.isInteger(row.track))index=row.track;
  return Math.max(0,index);
 }
 cleanPresentation(container){
  // VexFlow presentation properties become SVG attributes; the site keeps inline CSS disabled.
  const allowed=new Set(['font-family','font-size','font-weight','font-style','fill','stroke','stroke-width','opacity','text-anchor']);
  for(const node of container.querySelectorAll('[style]')){for(const key of [...node.style])if(allowed.has(key)&&node.namespaceURI==='http://www.w3.org/2000/svg')node.setAttribute(key,node.style.getPropertyValue(key));node.removeAttribute('style');}
  for(const node of container.querySelectorAll('svg')){const width=parseFloat(node.getAttribute('width')),height=parseFloat(node.getAttribute('height'));if(!node.hasAttribute('viewBox')&&width>0&&height>0)node.setAttribute('viewBox','0 0 '+width+' '+height);if(node.hasAttribute('viewBox'))node.removeAttribute('height');node.setAttribute('role','img');node.setAttribute('aria-label','Complete source-derived MusicXML engraving with voices in color');}
 }
 follow(position,enabled,{scroll=false}={}){
  const next=new Set(),enabledKey=enabled.join('');
  if(enabledKey!==this.enabledKey){for(const g of this.groups)g.element.classList.toggle('authored-muted',enabled[g.track]===false);this.enabledKey=enabledKey;}
  for(const group of this.groups){
   if(group.start>position)break;
   if(enabled[group.track]!==false&&group.end>position)next.add(group);
  }
  for(const group of this.active)if(!next.has(group))group.element.classList.remove('authored-playing');
  for(const group of next)if(!this.active.has(group))group.element.classList.add('authored-playing');
  this.active=next;
  this.showBar(position);
  if(scroll&&next.size&&performance.now()-this.lastScroll>225){
   const first=next.values().next().value, view=this.host.getBoundingClientRect(), note=first.element.getBoundingClientRect();
   if(this.view==='full'&&(note.top<view.top+25||note.bottom>view.bottom-25)){
    this.host.scrollTop+=note.top-view.top-this.host.clientHeight*.28;
   }
   if(note.left<view.left+18||note.right>view.right-18){
    this.host.scrollLeft+=note.left-view.left-this.host.clientWidth*.22;
   }
   this.lastScroll=performance.now();
  }
 }
 showBar(position){
  const bar=barAt(this.bars,position);if(!bar)return;
  const number=String(bar.number);
  if(number===this.lastBar)return;
  this.lastBar=number;
  this.showSystem(number);
  for(const group of this.groups)group.element.classList.toggle('authored-current-bar',String(group.rows[0].measure)===number);
  if(this.barLabel)this.barLabel.textContent='Bar '+number;
 }

 dispose(){this.epoch++;window.removeEventListener('beforeprint',this.printStart);window.removeEventListener('afterprint',this.printEnd);this.osmd?.clear();this.osmd=null;this.groups=[];this.pages=[];this.systems=[];this.currentSystem=null;this.active.clear();this.host.classList.remove('authored-score');for(const key of ['state','scoreView','systems','passage'])delete this.host.dataset[key];if(this.barLabel)this.barLabel.textContent='';}
}
