/** Browser-independent catalog and source-MIDI operations. */
export const VOICE_COLORS=['#b74131','#246a74','#966311','#8b6d26','#436f94','#9c4a69'];
export function projectCity([longitude,latitude]) {
 const rad=Math.PI/180;
 return [400+(longitude-12)*rad*650,245-650*(Math.log(Math.tan(Math.PI/4+latitude*rad/2))-Math.log(Math.tan(Math.PI/4+50*rad/2)))];
}
export function filterComposers(composers,{query='',origin='',tradition='',period=''}={}) {
 const q=query.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 return composers.filter(c=>(!origin||c.origin===origin)&&(!tradition||c.traditions.includes(tradition))&&(!period||c.eras.includes(period))&&(!q||[c.name,c.city,c.dates,c.note].join(' ').toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(q)));
}
export function validateStudy(study) {
 if(!Number.isFinite(study.duration)||study.duration<=0||study.duration>3600||!Array.isArray(study.tracks)||!study.tracks.length||study.tracks.length>32) throw Error('Unsupported source study');
 for(const t of study.tracks) {
  if(!Array.isArray(t.notes)||t.notes.length>20000) throw Error('Invalid note count');
  for(const n of t.notes)if(n.length<3||!n.slice(0,3).every(Number.isFinite)||n[0]<0||n[0]>127||n[1]<0||n[2]<=0||n[1]+n[2]>study.duration+2)throw Error('Invalid source note');
 }
 return study;
}
export function activeNotes(study,position,enabled) {
 return study.tracks.flatMap((t,index)=>enabled[index]?t.notes.filter(n=>n[1]<=position&&n[1]+n[2]>position).map(n=>({pitch:n[0],track:index})):[]);
}
export function formatTime(value) {const seconds=Math.max(0,Math.floor(value));return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}
export function safeURL(value) {try {const u=new URL(value);return u.protocol==='https:'?u.href:'#';}catch{return '#';}}
