/**
 * Playback notation from MIDI timing arrays, using licensed Bravura outlines.
 * This is a timed reading aid, not a transcription of an editorial source score.
 * Spelling, note values, clefs and rests are inferred. Track != independent voice.
 */
import {MUSIC_GLYPHS} from './glyphs.mjs';
export const PLAYBACK_SCORE_STYLE='.score-note-active .score-note-hit{fill:#edc965;fill-opacity:.42}.score-note-muted{opacity:.18}[data-score-note]:focus .score-note-hit{fill:#edc965;fill-opacity:.5}[data-score-note]{cursor:pointer}';
const DEFAULT_COLORS=['#b74131','#246a74','#966311','#704b86','#365f8d','#8d435b'];
const ESCAPE=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const finite=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const n=value=>Number(value.toFixed(3));
const GLYPH=(name,x,y,scale=1)=>`<path d="${MUSIC_GLYPHS[name].path}" transform="translate(${n(x)} ${n(y)}) scale(${n(scale)})"/>`;
export function noteSpelling(pitch,preferFlats=true){
 const table=preferFlats?[['C',0],['D',-1],['D',0],['E',-1],['E',0],['F',0],['G',-1],['G',0],['A',-1],['A',0],['B',-1],['B',0]]:[['C',0],['C',1],['D',0],['D',1],['E',0],['F',0],['F',1],['G',0],['G',1],['A',0],['A',1],['B',0]];
 const [letter,accidental]=table[pitch%12],octave=Math.floor(pitch/12)-1;
 return {letter,accidental,octave,diatonic:octave*7+'CDEFGAB'.indexOf(letter),name:letter+(accidental<0?'♭':accidental>0?'♯':'')+octave};
}
export function rhythmicValue(duration,secondsPerBeat){
 const beats=duration/secondsPerBeat;
 const candidates=[4,3,2,1.5,1,.75,.5,.375,.25,.1875,.125,.09375,.0625];
 let value=candidates.reduce((best,item)=>Math.abs(item-beats)<Math.abs(best-beats)?item:best,4);
 const dotted=[3,1.5,.75,.375,.1875,.09375].includes(value),base=dotted?value/1.5:value;
 const flags=base>=1?0:Math.min(4,Math.round(-Math.log2(base)));
 return {beats,value,base,dotted,flags,approximate:Math.abs(value-beats)>.025};
}
function validateInput(study){
 if(!study||!Number.isFinite(study.duration)||study.duration<=0||study.duration>3600||!Array.isArray(study.tracks)||study.tracks.length<1||study.tracks.length>32)throw Error('Unsupported playback score');
 let count=0;
 for(const track of study.tracks){
  if(!Array.isArray(track.notes)||track.notes.length>20000)throw Error('Unsupported notation track');
  count+=track.notes.length;
  for(const a of track.notes)if(!Array.isArray(a)||a.length<3||!a.slice(0,3).every(Number.isFinite)||!Number.isInteger(a[0])||a[0]<0||a[0]>127||a[1]<0||a[2]<=0||a[1]+a[2]>study.duration+2)throw Error('Invalid notation note');
 }
 if(count>50000)throw Error('Playback score exceeds its note bound');
}
function pitchY(pitch,clef,bottom,preferFlats){
 const base=clef==='bass'?18:30;
 return bottom-(noteSpelling(pitch,preferFlats).diatonic-base)*5;
}
function restGaps(notes,start,end){
 const intervals=notes.filter(a=>a[1]<end&&a[1]+a[2]>start).map(a=>[Math.max(start,a[1]),Math.min(end,a[1]+a[2])]).sort((a,b)=>a[0]-b[0]);
 let cursor=start;const gaps=[];
 for(const [a,b] of intervals){if(a>cursor+.01)gaps.push([cursor,a]);cursor=Math.max(cursor,b);}
 if(cursor<end-.01)gaps.push([cursor,end]);return gaps;
}

/** Use the actual downbeats, including tempo changes, to turn a reading page. */
export function playbackMeasures(barTimes,duration){
 if(!Array.isArray(barTimes))return [];
 const bars=barTimes.filter(bar=>Number.isInteger(bar.bar)&&Number.isFinite(bar.seconds)&&bar.seconds>=0&&bar.seconds<duration-.0001);
 return bars.map((bar,index)=>({number:bar.bar,start:bar.seconds,end:bars[index+1]?.seconds??duration}));
}
export function playbackPage(bars,position,barCount){
 if(!bars.length)return null;
 let low=0,high=bars.length;
 while(high-low>1){
  const mid=(low+high)>>1;
  if(bars[mid].start<=position)low=mid;else high=mid;
 }
 const first=Math.floor(low/barCount)*barCount,last=Math.min(first+barCount-1,bars.length-1);
 return {start:bars[first].start,end:bars[last].end,firstBar:bars[first].number,lastBar:bars[last].number,previousStart:bars[Math.max(0,first-barCount)].start};
}

/** Group a single moving line within a beat. Chords, silences and carried notes start a new group. */
function playbackBeamPlan(notes,{start,end,secondsPerBeat,meter,bars,xAt,yAt,middle}){
 const marked=new Map(),beams=[];
 const beatLength=secondsPerBeat*(4/(meter?.denominator||4))*(meter?.numerator>=6&&meter.numerator%3===0?3:1);
 const events=notes.map((note,index)=>({note,index})).filter(e=>e.note[1]<end&&e.note[1]>=start).sort((a,b)=>a.note[1]-b.note[1]);
 let group=[],beatStart=0,barIndex=0;
 function finish(){
  if(group.length>1){
   const first=group[0],last=group.at(-1),span=last.x-first.x;
   const down=group.reduce((sum,e)=>sum+e.y,0)/group.length<middle;
   const direction=down?1:-1,slope=clamp((last.y-first.y)/span,-.1,.1);
   const intercept=(down?Math.max:Math.min)(...group.map(e=>e.y-slope*(e.x-first.x)))+direction*30;
   for(const e of group)marked.set(e.index,{down,endY:intercept+slope*(e.x-first.x)});
   const stemShift=down?.5:9;
   for(let level=0;level<first.flags;level++){
    const x1=first.x+stemShift,x2=last.x+stemShift;
    const y1=intercept-direction*level*5.3,y2=y1+slope*span;
    beams.push(`<path data-beam d="M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}v${n(-direction*3.5)}L${n(x1)} ${n(y1-direction*3.5)}Z"/>`);
   }
  }
  group=[];
 }
 for(let i=0;i<events.length;i++){
  const {note,index}=events[i],[pitch,onset,duration]=note;
  while(barIndex<bars.length&&bars[barIndex].seconds<=onset+.0001)beatStart=bars[barIndex++].seconds;
  const beat=beatStart+Math.floor((onset-beatStart+.0001)/beatLength)*beatLength;
  const flags=rhythmicValue(duration,secondsPerBeat).flags;
  const chord=[events[i-1],events[i+1]].some(e=>e&&Math.abs(e.note[1]-onset)<.005);
  if(!flags||chord){finish();continue;}
  const previous=group.at(-1),gap=previous?onset-previous.onset-previous.duration:0;
  if(previous&&(Math.abs(beat-previous.beat)>.002||previous.flags!==flags||Math.abs(gap)>secondsPerBeat*.16))finish();
  group.push({index,flags,beat,onset,duration,x:xAt(onset),y:yAt(pitch)});
 }
 finish();
 return {marked,beams};
}
/** Pure HTML-safe SVG generation. No browser, external font or runtime dependency. */
export function renderPlaybackScore(study,options={}){
 validateInput(study);
 const width=clamp(finite(options.width,960),320,1800),staffHeight=clamp(finite(options.staffHeight,122),100,180);
 const secondsPerBeat=clamp(finite(options.secondsPerBeat,.5),.125,3),beatsPerBar=clamp(finite(options.beatsPerBar,4),.5,16);
 const requested=clamp(finite(options.windowSeconds,secondsPerBeat*beatsPerBar*2),.05,180),position=clamp(finite(options.position,0),0,study.duration);
 const autoStart=Math.floor(Math.max(0,Math.min(position,study.duration-.0001))/requested)*requested;
 const start=clamp(finite(options.windowStart,autoStart),0,Math.max(0,study.duration-.001)),end=Math.min(study.duration,start+requested),span=Math.max(.001,end-start);
 const left=82,right=22,plotWidth=width-left-right;
 let cursor=28;
 const layouts=study.tracks.map((track,index)=>{
  const visible=track.notes.filter(a=>a[1]<end&&a[1]+a[2]>start),pitches=(visible.length?visible:track.notes).map(a=>a[0]).sort((a,b)=>a-b);
  const median=pitches[Math.floor(pitches.length/2)]??60;
  const clef=options.clefs?.[index]==='bass'||options.clefs?.[index]==='treble'?options.clefs[index]:median<60?'bass':'treble';
  const base=clef==='bass'?18:30,diatonic=pitches.map(p=>noteSpelling(p,options.preferFlats!==false).diatonic);
  const upper=Math.max(37,(Math.max(base+8,...diatonic)-base-8)*5+24),lower=Math.max(20,(base-Math.min(base,...diatonic))*5+20);
  const labelY=cursor+10,top=cursor+upper,bottom=top+40;cursor+=Math.max(staffHeight,upper+40+lower+15);return {top,bottom,clef,labelY};
 });
 const height=cursor+22;
 const colors=study.tracks.map((_,i)=>typeof options.colors?.[i]==='string'&&/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(options.colors[i])?options.colors[i]:DEFAULT_COLORS[i%DEFAULT_COLORS.length]);
 const preferFlats=options.preferFlats!==false,xAt=t=>left+(t-start)/span*plotWidth;
 let body='';const notes=[];
 body+=`<rect width="${width}" height="${height}" fill="#fff"/><text x="12" y="17" font-family="Arial,sans-serif" font-size="10" fill="#40453e">Playback notation · ${n(start)}–${n(end)} seconds</text>`;
 study.tracks.forEach((track,trackIndex)=>{
  const {top,bottom,clef,labelY}=layouts[trackIndex];
  const label=String(track.label||`Source track ${trackIndex+1}`).slice(0,70),color=colors[trackIndex];
  const beamPlan=playbackBeamPlan(track.notes,{start,end,secondsPerBeat,meter:options.meter,
   bars:Array.isArray(options.barTimes)?options.barTimes:[],xAt,yAt:pitch=>pitchY(pitch,clef,bottom,preferFlats),middle:top+20});
  body+=`<g data-score-track="${trackIndex}" fill="${color}" stroke="none"><text x="12" y="${labelY}" font-family="Arial,sans-serif" font-size="10">${ESCAPE(label)}</text>`;
  for(let line=0;line<5;line++)body+=`<path d="M12 ${top+line*10}H${width-right}" stroke="#b8bcb3" stroke-width=".65"/>`;
  body+=GLYPH(clef==='bass'?'fClef':'gClef',22,clef==='bass'?top+10:top+30,.8);
  const barDuration=secondsPerBeat*beatsPerBar;
  const sourceBars=Array.isArray(options.barTimes)?options.barTimes.filter(b=>Number.isFinite(b.seconds)&&Number.isInteger(b.bar)&&b.seconds>=start-.001&&b.seconds<=end+.001).slice(0,80):null;
  const bars=sourceBars||Array.from({length:Math.ceil(span/barDuration)+1},(_,i)=>{const bar=Math.ceil(start/barDuration)+i;return {bar:bar+1,seconds:bar*barDuration};});
  for(const bar of bars){
   const x=xAt(bar.seconds);if(x>=left-.1&&x<=width-right+.1)body+=`<path d="M${n(x)} ${top}v40" stroke="#8a9386" stroke-width=".8"/>${trackIndex===0?`<text x="${n(x+3)}" y="${top-7}" font-family="Arial,sans-serif" font-size="8" fill="#62695d">${bar.bar}</text>`:''}`;
  }
  for(const [gapStart,gapEnd] of restGaps(track.notes,start,end))if(gapEnd-gapStart>=secondsPerBeat*.45){
   const rhythm=rhythmicValue(gapEnd-gapStart,secondsPerBeat),name=rhythm.base>=4?'restWhole':rhythm.base>=2?'restHalf':rhythm.base>=1?'restQuarter':rhythm.flags===1?'rest8th':rhythm.flags===2?'rest16th':rhythm.flags===3?'rest32nd':'rest64th';
   body+=`<g opacity=".4" aria-hidden="true">${GLYPH(name,xAt((gapStart+gapEnd)/2),top+20,.7)}</g>`;
  }
  track.notes.forEach((note,noteIndex)=>{
   const [pitch,onset,duration]=note;if(onset>=end||onset+duration<=start)return;
   const carried=onset<start,x=xAt(Math.max(start,onset)),spelling=noteSpelling(pitch,preferFlats),y=pitchY(pitch,clef,bottom,preferFlats),rhythm=rhythmicValue(duration,secondsPerBeat),beamed=beamPlan.marked.get(noteIndex),stemDown=beamed?.down??y<top+20;
   const noteId=`${trackIndex}-${noteIndex}`;
   notes.push({id:noteId,track:trackIndex,index:noteIndex,pitch,start:onset,end:onset+duration,x:n(x),y:n(y),spelling:spelling.name,carried,approximateRhythm:rhythm.approximate});
   body+=`<g data-score-note="${noteId}" data-note-start="${onset}" data-note-end="${n(onset+duration)}" data-track="${trackIndex}" data-seek="${onset}" role="button" tabindex="${notes.length===1?0:-1}" aria-label="${ESCAPE(label)}, ${ESCAPE(spelling.name)}, ${n(onset)} seconds${carried?', held from previous window':''}"><title>${ESCAPE(spelling.name)} · ${n(onset)}s · ${n(duration)}s${rhythm.approximate?' · approximate rhythm symbol':''}</title>`;
   body+=`<rect class="score-note-hit" x="${n(x-4)}" y="${n(y-12)}" width="20" height="26" fill="transparent"/>`;
   for(let ledger=bottom+10;ledger<=y+.1;ledger+=10)body+=`<path d="M${n(x-3)} ${ledger}h17" stroke="${color}" stroke-width=".9"/>`;
   for(let ledger=top-10;ledger>=y-.1;ledger-=10)body+=`<path d="M${n(x-3)} ${ledger}h17" stroke="${color}" stroke-width=".9"/>`;
   if(spelling.accidental)body+=GLYPH(spelling.accidental<0?'accidentalFlat':'accidentalSharp',x-12,y,.55);
   body+=GLYPH(rhythm.base>=4?'noteheadWhole':rhythm.base>=2?'noteheadHalf':'noteheadBlack',x,y,.8);
   if(rhythm.base<4){
    const stemX=stemDown?x+.5:x+9,stemEnd=beamed?.endY??(stemDown?y+29:y-29);
    body+=`<path d="M${n(stemX)} ${n(y)}V${n(stemEnd)}" stroke="${color}" stroke-width="1"/>`;
    if(rhythm.flags&&!beamed)body+=GLYPH(`flag${rhythm.flags===1?'8th':rhythm.flags===2?'16th':rhythm.flags===3?'32nd':'64th'}${stemDown?'Down':'Up'}`,stemX,stemEnd,.8);
   }
   if(rhythm.dotted)body+=`<circle cx="${n(x+15)}" cy="${n(y-2.5)}" r="1.4"/>`;
   if(carried)body+=`<path d="M${n(x-3)} ${n(y+8)}q6 4 12 0" fill="none" stroke="${color}" stroke-width=".8" stroke-dasharray="2 1"/>`;
   body+='</g>';
  });
  body+=`<g aria-hidden="true" pointer-events="none">${beamPlan.beams.join('')}</g></g>`;
 });
 const playX=xAt(clamp(position,start,end));
 body+=`<path class="score-playhead" d="M${n(playX)} 28V${height-20}" fill="none" stroke="#20251f" stroke-width="1" opacity=".65"/>`;
 const caption='Playback notation from MIDI. Pitches and note lengths follow the source timing. Spelling, rests, clefs and rhythm symbols are inferred. Colours identify source tracks.';
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="group" aria-label="${ESCAPE(caption)}" data-window-start="${start}" data-window-end="${end}" data-plot-left="${left}" data-plot-width="${plotWidth}"><style>${PLAYBACK_SCORE_STYLE}</style>${body}</svg>`;
 return {svg,notes,windowStart:start,windowEnd:end,inferred:true,caption};
}
/** Update a rendered score without reconstructing its staves on every frame. */
export function highlightPlaybackScore(root,position,enabled){
 const svg=root?.matches?.('svg[data-window-start]')?root:root?.querySelector?.('svg[data-window-start]');if(!svg)return;
 const start=Number(svg.dataset.windowStart),end=Number(svg.dataset.windowEnd),left=Number(svg.dataset.plotLeft),width=Number(svg.dataset.plotWidth),p=clamp(finite(position,0),start,end);
 const x=left+(p-start)/Math.max(.001,end-start)*width,viewHeight=Number(svg.getAttribute('viewBox').split(' ')[3]);
 svg.querySelector('.score-playhead')?.setAttribute('d',`M${n(x)} 28V${viewHeight-20}`);
 for(const element of svg.querySelectorAll('[data-score-note]')){
  const track=Number(element.dataset.track),on=enabled?.[track]!==false,active=on&&Number(element.dataset.noteStart)<=p&&Number(element.dataset.noteEnd)>p;
  element.classList.toggle('score-note-active',active);element.classList.toggle('score-note-muted',!on);
 }
}

/** Roving focus keeps a score to one Tab stop; arrows move chronologically. */
export function moveScoreFocus(root,current,direction){
 const elements=[...root.querySelectorAll('[data-score-note]')].filter(el=>!el.closest?.('.authored-away,svg[hidden]')).sort((a,b)=>Number(a.dataset.noteStart??a.dataset.seek)-Number(b.dataset.noteStart??b.dataset.seek)||Number(a.dataset.track)-Number(b.dataset.track));
 if(!elements.length)return false;
 const index=Math.max(0,elements.indexOf(current));
 const target=direction==='first'?elements[0]:direction==='last'?elements.at(-1):elements[clamp(index+Number(direction),0,elements.length-1)];
 for(const element of elements)element.setAttribute('tabindex',element===target?'0':'-1');target.focus();return true;
}
