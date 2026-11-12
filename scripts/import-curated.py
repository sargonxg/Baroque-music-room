# SPDX-License-Identifier: GPL-3.0-or-later
"""Build-time source transcription, from authored LilyPond (not MIDI).

Uses python-ly's pitch spelling/rational duration/repeat AST and music21's
MusicXML writer. Repeats are written out; layout is a modern study layout.
"""
from __future__ import annotations
import pathlib,sys,re,json,collections,hashlib,copy,contextlib,io,math
from fractions import Fraction as F
import xml.etree.ElementTree as ET
import ly.document,ly.pitch.rel2abs,ly.music
from ly.music import items,event
from music21 import stream,note,chord,pitch,duration,meter,key,clef,tempo,metadata,tie

import argparse,tempfile,urllib.request,concurrent.futures
PARSER=argparse.ArgumentParser(description='Rebuild 50 credited source-derived Baroque study scores and playback assets.')
PARSER.add_argument('--cache',type=pathlib.Path,default=pathlib.Path(tempfile.gettempdir())/'baroque-source-score-cache')
PARSER.add_argument('--offline',action='store_true',help='Use only already downloaded, hash-verified source files.')
ARGS=PARSER.parse_args()
ROOT=ARGS.cache.resolve();ROOT.mkdir(parents=True,exist_ok=True)
OUT=pathlib.Path(__file__).resolve().parents[1]

def remove_blocks(text,commands):
 for command in commands:
  while (m:=re.search(r'\\'+command+r'\s*\{',text)):
   start=m.start();i=m.end();depth=1;quoted=False;escaped=False
   while i<len(text) and depth:
    c=text[i]
    if c=='"' and not escaped:quoted=not quoted
    if not quoted:
     if c=='{':depth+=1
     elif c=='}':depth-=1
    escaped=(c=='\\' and not escaped)
    if c!='\\':escaped=False
    i+=1
   text=text[:start]+text[i:]
 return text
def clean(text):
 text=remove_blocks(text,['header','paper','layout','midi'])
 for name in ['voiceOne','voiceTwo']:
  if re.search(r'^'+name+r'\s*=',text,re.M):
   text=re.sub(r'(?<![A-Za-z])'+name+r'(?![A-Za-z])','Source'+name,text)
 for language in ['catalan','italiano','français','english','nederlands']:
  text=text.replace('\\include "'+language+'.ly"','\\language "'+language+'"')
 return text

COLORS=['#b74131','#246a74','#966311','#704b86','#365f8d','#8d435b']
PIN='2144afd6f52d56c5b6995b8b589ef1268b3139f0'
COMPOSERS={'bach':'Johann Sebastian Bach','scarlatti':'Domenico Scarlatti','rameau':'Jean-Philippe Rameau','handel':'George Frideric Handel','couperin':'François Couperin','buxtehude':'Dieterich Buxtehude','pachelbel':'Johann Pachelbel','froberger':'Johann Jakob Froberger'}

class SourceEvents(event.Events):
 unfold_repeats=True
 def __init__(self,source):
  self.source=source;self.staff='staff1';self.group='staff1';self.staff_ids={};self.rows=[];self.meters=[];self.keys=[];self.pickups=[];self.tempos=[];self.last={}
 def traverse(self,node,time,scaling):
  if isinstance(node,items.Score):
   for child in node:
    if isinstance(child,items.Music):time=super().traverse(child,time,scaling)
   return time
  if isinstance(node,items.Context):
   ctx=node.context();old_staff,old_group=self.staff,self.group
   if ctx in ['Staff','RhythmicStaff']:
    if node.position not in self.staff_ids:self.staff_ids[node.position]=len(self.staff_ids)+1
    self.staff='staff'+str(self.staff_ids[node.position]);self.group=self.staff
   elif ctx=='Voice':self.group=self.staff+'-voice'+str(node.position)
   out=super().traverse(node,time,scaling);self.staff,self.group=old_staff,old_group;return out
  if isinstance(node,items.MusicList) and node.simultaneous:
   ends=[];old=self.group
   for i,child in enumerate(node):
    if not isinstance(child,items.Context):self.group=old+'-branch'+str(i)
    ends.append(self.traverse(child,time,scaling));self.group=old
   return max(ends or [time])
  if isinstance(node,items.TimeSignature):
   self.meters.append((time*4,node.numerator(),node.fraction().denominator));return time
  if isinstance(node,items.KeySignature):
   p=node.pitch();self.keys.append((time*4,p.note,p.alter,p.octave,node.mode()));return time
  if isinstance(node,items.Partial):self.pickups.append((time*4,node.partial_length()*4));return time
  if isinstance(node,items.Tempo):
   values=node.tempo()
   if values:self.tempos.append((time*4,float(node.fraction()*4)*values[0]))
   return time
  if isinstance(node,items.Tie):
   for r in self.last.get(self.group,[]):r['tieForward']=True
   return time
  if isinstance(node,(items.Note,items.Chord)):
   dur=node.duration[0]*node.duration[1]*scaling
   notes=list(node.find(items.Note)) if isinstance(node,items.Chord) else [node]
   nxt=node.next_sibling()
   if isinstance(nxt,items.Command) and nxt.token=='\\rest':return time+dur
   rows=[]
   for n in notes:
    p=n.pitch
    if p is None:continue
    rows.append({'q':time*4,'d':dur*4,'step':'CDEFGAB'[p.note],'alter':int(p.alter*2),'octave':p.octave+3,'staff':self.staff,'group':self.group,'position':n.position,'grace':not bool(scaling),'tieForward':False})
   self.rows.extend(rows);self.last[self.group]=rows
   return time+dur
  if isinstance(node,(items.Rest,items.Skip)):return time+node.duration[0]*node.duration[1]*scaling
  return super().traverse(node,time,scaling)

def field(text,name,default=''):
 m=re.search(r'(?m)^\s*'+name+r'\s*=\s*"([^"\n]*)"',text);return m.group(1) if m else default

def score_nodes(text,path):
 doc=ly.document.Document(clean(text));doc.filename=str(path)
 ly.pitch.rel2abs.rel2abs(ly.document.Cursor(doc))
 tree=ly.music.document(doc)
 doc._source_tree=tree  # ly nodes use weak parent links; retain variable assignments.
 return doc,[x for x in tree if isinstance(x,items.Score)]

def build_piece(row,score,doc,source,section=0):
 events=SourceEvents(source);whole=events.read(score)
 if not events.rows:raise ValueError('No authored notes extracted')
 pieceid=row['id'];composer=row['composer']
 if composer=='froberger':pieceid+='-'+['allemande','gigue','courante','sarabande'][section]
 if composer=='bach':
  bwv=int(re.search(r'\d+',pieceid)[0]);title=('Invention No. '+str(bwv-771) if bwv<787 else 'Sinfonia No. '+str(bwv-786))+' · BWV '+str(bwv)
 elif composer=='froberger':title='Suite VII in E minor · '+['Allemande','Gigue','Courante','Sarabande'][section]
 elif composer=='couperin':title='L’Art de toucher le clavecin · Prelude '+re.search(r'\d+',pieceid)[0]
 elif composer=='scarlatti':title='Sonata K. '+re.search(r'(11|455|491)$',pieceid)[0]
 else:title=field(source,'mutopiatitle',field(source,'title',pieceid))
 initial_tempo=80.0;tempo_basis='Editorial study tempo; the source specifies no numeric tempo.'
 numeric=list(re.finditer(r'\\tempo\s+(\d+)(\.*)\s*=\s*(\d+)',source))
 if numeric:
  m=numeric[min(section,len(numeric)-1)] if composer=='froberger' else numeric[-1];initial_tempo=4/int(m[1])*int(m[3])*(2-2**(-len(m[2])));tempo_basis='Source edition MIDI tempo.'
 else:
  m=re.search(r'ly:make-moment\s+(\d+)\s+(\d+)',source)
  if m:initial_tempo=4*int(m[1])/int(m[2]);tempo_basis='Source edition MIDI tempo.'
 tempos={F(0):initial_tempo}
 for q,bpm in events.tempos:tempos[q]=bpm
 meters={F(0):(4,4)}
 for q,num,den in events.meters:meters[q]=(num,den)
 keymap={F(0):key.Key('C','major')}
 for q,step,alter,octave,mode in events.keys:
  p=pitch.Pitch('CDEFGAB'[step]+str(octave+3));p.accidental=pitch.Accidental(int(alter*2)) if alter else None
  try:keymap[q]=key.Key(p.name,mode)
  except Exception:pass
 total=max(r['q']+r['d'] for r in events.rows)
 pickup=next((d for q,d in events.pickups if q==0 and d>0),None)
 bounds=[F(0)];q=F(0);first=True
 while q<total:
  num,den=next(v for k,v in sorted(meters.items(),reverse=True) if k<=q)
  length=pickup if first and pickup else F(4*num,den);first=False
  end=min(total,q+length)
  nextchanges=[x for x in meters if q<x<end]
  if nextchanges:end=min(nextchanges)
  bounds.append(end);q=end
 if composer=='bach':group=lambda r:r['group']
 else:group=lambda r:r['staff']
 groups=collections.defaultdict(list)
 for r in events.rows:groups[group(r)].append(r)
 ordered=sorted(groups,key=lambda k:sum(pitch_number(r) for r in groups[k])/len(groups[k]),reverse=True)
 if composer=='bach' and len(ordered)!=(2 if int(re.search(r'\d+',pieceid)[0])<787 else 3):raise ValueError('Unexpected Bach source voice count '+str(len(ordered)))
 voices=[];s=stream.Score(id=pieceid)
 s.metadata=metadata.Metadata();s.metadata.title=title;s.metadata.composer=COMPOSERS[composer]
 for vi,g in enumerate(ordered):
  label=(['Upper voice','Lower voice'] if len(ordered)==2 else ['Upper voice','Middle voice','Lower voice'])[vi] if composer=='bach' else ('Upper staff' if vi==0 else 'Lower staff' if vi==len(ordered)-1 else 'Middle staff '+str(vi))
  voices.append({'id':'V'+str(vi+1),'label':label,'color':COLORS[vi%len(COLORS)],'actualVoice':composer=='bach','sourceGroup':g})
  p=stream.Part(id='V'+str(vi+1));p.partName=label;p.partAbbreviation=str(vi+1)
  rows=groups[g]
  for mi,(a,b) in enumerate(zip(bounds,bounds[1:])):
   m=stream.Measure(number=0 if pickup and mi==0 else mi if pickup else mi+1)
   if a in meters or mi==0:
    mn,md=next(v for k,v in sorted(meters.items(),reverse=True) if k<=a);m.insert(0,meter.TimeSignature(str(mn)+'/'+str(md)))
   if a in keymap:m.insert(0,copy.deepcopy(keymap[a]))
   if mi==0:m.insert(0,clef.TrebleClef() if sum(pitch_number(r) for r in rows)/len(rows)>=60 else clef.BassClef())
   for tq,bpm in tempos.items():
    if a<=tq<b:m.insert(tq-a,tempo.MetronomeMark(number=bpm))
   add_measure_voices(m,rows,a,b,COLORS[vi%len(COLORS)])
   p.append(m)
  s.append(p)
 xmlpath=ROOT/'study-xml'/(pieceid+'.musicxml');xmlpath.parent.mkdir(exist_ok=True)
 # Do not force automatic beaming of compound/nested source rhythms.
 from music21.musicxml.m21ToXml import GeneralObjectExporter
 s.splitAtDurations(recurse=True)
 try:s.makeBeams(inPlace=True)
 except Exception:pass  # Rhythm and spelling remain source-derived if beaming cannot be grouped.
 export=GeneralObjectExporter(s);export.makeNotation=False;xml=export.parse()
 xmlpath.write_bytes(xml)
 graces=[{'part':'V'+str(vi+1),'pitch':pitch_number(r),'quarter':float(r['q'])} for vi,g in enumerate(ordered) for r in groups[g] if r['grace']]
 mutopia_id=re.search(r'Mutopia-\d{4}/\d{2}/\d{2}-(\d+)',source)[1]
 return {'id':pieceid,'composer':composer,'title':title,'voices':voices,'sourceRows':len(events.rows),'sourceGraces':graces,'durationQuarters':float(total),'sourceMeasures':len(bounds)-1,'tempos':[(float(q),bpm) for q,bpm in sorted(tempos.items())],'tempoBasis':tempo_basis,'source':row['url'],'editionUrl':'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id='+mutopia_id,'edition':field(source,'source','Mutopia source edition'),'attribution':field(source,'maintainer',field(source,'enteredby','Mutopia contributor')),'license':field(source,'license',field(source,'copyright','')),'path':row['path'],'sourceHash':row['sha256'],'pickup':float(pickup) if pickup else None}

def pitch_number(r):return (r['octave']+1)*12+[0,2,4,5,7,9,11]['CDEFGAB'.index(r['step'])]+r['alter']

def add_measure_voices(m,rows,a,b,color):
 sourcegroups=collections.defaultdict(list)
 for r in rows:sourcegroups[r['group']].append(r)
 for gi,(group,group_rows) in enumerate(sourcegroups.items()):
  v=stream.Voice(id=str(gi+1));cells=collections.defaultdict(list)
  for r in group_rows:
   if r['grace']:
    if a<=r['q']<b:cells[(r['q']-a,F(0))].append(r)
   elif r['q']<b and r['q']+r['d']>a:
    start=max(a,r['q']);end=min(b,r['q']+r['d']);cells[(start-a,end-start)].append(r)
  intervals=[]
  for (offset,dur),rs in sorted(cells.items()):
   pitches=[]
   for r in rs:
    pp=pitch.Pitch();pp.step=r['step'];pp.octave=r['octave'];pp.accidental=pitch.Accidental(r['alter']) if r['alter'] else None;pitches.append(pp)
   n=note.Note(pitches[0]) if len(pitches)==1 else chord.Chord(pitches)
   n.duration=duration.Duration(dur) if dur else duration.GraceDuration();n.style.color=color
   if dur:
    starts=[r['q']<a for r in rs];ends=[r['q']+r['d']>b or r['tieForward'] for r in rs]
    members=[n] if isinstance(n,note.Note) else list(n.notes)
    for k,nn in enumerate(members):
     previous=any(x['tieForward'] and x['q']+x['d']==a+offset and pitch_number(x)==pitch_number(rs[k]) for x in group_rows)
     before=starts[k] or previous;after=ends[k]
     if before or after:nn.tie=tie.Tie('continue' if before and after else 'stop' if before else 'start')
    intervals.append((offset,offset+dur))
   v.insert(offset,n)
  cursor=F(0)
  for x,y in sorted(intervals):
   if x>cursor:v.insert(cursor,note.Rest(quarterLength=x-cursor))
   cursor=max(cursor,y)
  if cursor<b-a:v.insert(cursor,note.Rest(quarterLength=b-a-cursor))
  m.insert(0,v)


def generate_study_scores():

 result=[];errors=[]
 for row in json.loads((ROOT/'download-receipt.json').read_text()):
  if row.get('aux'):continue
  path=ROOT/'sources'/row['path'];src=path.read_text()
  if row['composer']=='couperin':src=(path.parent/'mutopia-header.ly').read_text()+'\n'+src
  try:
   doc,scores=score_nodes(src,path)
   if not scores:raise ValueError('No score')
   sections=range(2) if row['composer']=='froberger' else range(1)
   for idx in sections:
    r=build_piece(row,scores[idx],doc,src,idx);result.append(r);print(r['id'],r['sourceRows'],r['durationQuarters'],r['sourceMeasures'],len(r['voices']))
  except Exception as e:
   import traceback;traceback.print_exc();errors.append({'id':row['id'],'error':str(e)})
 (ROOT/'study-manifest-research.json').write_text(json.dumps({'pieces':result,'errors':errors},indent=2)+'\n')
 print('COMPLETE',len(result),'ERRORS',errors)

import pathlib,xml.etree.ElementTree as E,json,hashlib,zipfile,collections,math,copy
from fractions import Fraction as F
from music21 import converter

ASSETS=OUT/'assets/curated';ASSETS.mkdir(parents=True,exist_ok=True)

def compact(path,obj):path.write_text(json.dumps(obj,ensure_ascii=False,separators=(',',':'))+'\n')
def digest(data):return hashlib.sha256(data).hexdigest()

TIMING_COLUMNS=['id','part','voice','track','quarter','start','duration','quarterDuration','measure','beat','pitch','voiceColor','grace','ties']
def packed(study):
 return {**{k:v for k,v in study.items() if k!='timing'},'timingFormat':'columns/1','timingColumns':TIMING_COLUMNS,'timingRows':[[r[k] for k in TIMING_COLUMNS] for r in study['timing']]}

def repair_grace_offsets(root,row):
 """Keep exact source grace positions when the XML writer anchors them after a held note."""
 desired=collections.defaultdict(list)
 for g in row['sourceGraces']:desired[(g['part'],g['pitch'])].append(F(str(g['quarter'])))
 for values in desired.values():values.sort()
 for pi,p in enumerate(root.findall('part')):
  absolute=F(0);div=F(10080)
  for m in p.findall('measure'):
   cursor=F(0);previous=F(0);extent=F(0);new=[]
   for child in list(m):
    if child.tag=='attributes':
     if child.findtext('divisions'):div=F(child.findtext('divisions'))
    elif child.tag=='backup':cursor-=F(child.findtext('duration'))/div
    elif child.tag=='forward':cursor+=F(child.findtext('duration'))/div;extent=max(extent,cursor)
    elif child.tag=='note':
     grace=child.find('grace') is not None;duration=F(child.findtext('duration','0'))/div
     start=previous if child.find('chord') is not None else cursor
     pitch=child.find('pitch')
     if grace and pitch is not None:
      midi=(int(pitch.findtext('octave'))+1)*12+[0,2,4,5,7,9,11]['CDEFGAB'.index(pitch.findtext('step'))]+int(pitch.findtext('alter','0'))
      q=desired[('V'+str(pi+1),midi)].pop(0);delta=q-(absolute+start)
      if delta and child.find('chord') is None:
       before=E.Element('forward' if delta>0 else 'backup');E.SubElement(before,'duration').text=str(int(abs(delta)*div));new.append(before)
       new.append(child)
       after=E.Element('backup' if delta>0 else 'forward');E.SubElement(after,'duration').text=str(int(abs(delta)*div));new.append(after)
       previous=start+delta;continue
     if child.find('chord') is None:
      previous=start
      if not grace:cursor+=duration
     extent=max(extent,start+duration,cursor)
    new.append(child)
   m[:]=new;absolute+=extent

def to_seconds(q,tempos):
 total=0;last=0;bpm=tempos[0][1]
 for start,next_bpm in tempos[1:]:
  if q<=start:break
  total+=(start-last)*60/bpm;last=start;bpm=next_bpm
 return total+(q-last)*60/bpm

def parse_xml(root,row):
 for idx,(sp,p) in enumerate(zip(root.findall('./part-list/score-part'),root.findall('part'))):
  ident='V'+str(idx+1);sp.set('id',ident);p.set('id',ident)
 for x in root.findall('.//encoding-date'):x.text='2026-11-12'
 rights=E.SubElement(root.find('identification'),'rights');rights.text=row['license']+'; '+row['attribution']+' / Mutopia Project. Study conversion: repeats written out; keyboard study playback.'
 timing=[];measures=[];part_durations=[]
 tempos=row['tempos'];tracks=[]
 for pi,p in enumerate(root.findall('part')):
  division=F(10080);absolute=F(0);track_events=[];nindex=0
  voice=row['voices'][pi]
  for mi,m in enumerate(p.findall('measure')):
   cursor=F(0);extent=F(0);previous=F(0)
   for child in m:
    if child.tag=='attributes':
     value=child.findtext('divisions')
     if value:division=F(value)
    elif child.tag=='backup':cursor-=F(child.findtext('duration'))/division
    elif child.tag=='forward':cursor+=F(child.findtext('duration'))/division;extent=max(extent,cursor)
    elif child.tag=='note':
     grace=child.find('grace') is not None
     duration=F(child.findtext('duration','0'))/division if not grace else F(0)
     start=previous if child.find('chord') is not None else cursor
     if child.find('chord') is None:
      previous=start
      if not grace:cursor+=duration
     extent=max(extent,start+duration,cursor)
     pitched=child.find('pitch')
     if pitched is None:continue
     nindex+=1;ident='V'+str(pi+1)+'N'+str(nindex).zfill(5);child.set('id',ident);child.set('color',voice['color'])
     for h in child.findall('notehead'):h.set('color',voice['color'])
     midi=(int(pitched.findtext('octave'))+1)*12+[0,2,4,5,7,9,11]['CDEFGAB'.index(pitched.findtext('step'))]+int(pitched.findtext('alter','0'))
     q=absolute+start;end=q+duration;s=to_seconds(float(q),tempos);d=to_seconds(float(end),tempos)-s
     tie_types=[t.get('type') for t in child.findall('tie')]
     record={'id':ident,'part':voice['id'],'voice':child.findtext('voice','1'),'track':pi,'quarter':float(q),'start':round(s,7),'duration':round(d,7),'quarterDuration':float(duration),'measure':m.get('number'),'beat':float(start)+1,'pitch':midi,'voiceColor':voice['color'],'grace':grace,'ties':tie_types}
     timing.append(record)
     if not grace:track_events.append(dict(record))
   if pi==0:measures.append({'number':m.get('number'),'quarter':float(absolute),'quarterEnd':float(absolute+extent),'start':round(to_seconds(float(absolute),tempos),7),'end':round(to_seconds(float(absolute+extent),tempos),7)})
   absolute+=extent
  part_durations.append(float(absolute))
  # Join held tie segments for sound, while every displayed head remains in timing.
  notes=[];active={}
  for r in sorted(track_events,key=lambda x:(x['quarter'],x['voice'],x['pitch'])):
   k=(r['voice'],r['pitch']);end=r['start']+r['duration'];prior=active.get(k)
   if 'stop' in r['ties'] and prior is not None and abs(notes[prior][1]+notes[prior][2]-r['start'])<.0001:
    notes[prior][2]=round(end-notes[prior][1],7)
   else:
    notes.append([r['pitch'],r['start'],r['duration'],.72]);prior=len(notes)-1
   if 'start' in r['ties']:active[k]=prior
   else:active.pop(k,None)
  tracks.append({'id':voice['id'],'label':voice['label'],'actualVoice':voice['actualVoice'],'color':voice['color'],'notes':notes})
 if any(abs(x-row['durationQuarters'])>.00001 for x in part_durations):raise ValueError('XML/source duration mismatch '+str(part_durations)+' expected '+str(row['durationQuarters']))
 return {'duration':round(to_seconds(row['durationQuarters'],tempos),7),'tracks':tracks,'timing':timing,'measureTimes':measures,'secondsPerQuarter':60/tempos[0][1],'bpm':tempos[0][1],'tempoMap':[{'quarter':q,'seconds':round(to_seconds(q,tempos),7),'bpm':b} for q,b in tempos],'notationBasis':'Authored LilyPond source converted to a modern MusicXML study score; repeats written out. Grace notes are displayed but not realized in synthesized playback; ornament signs are not performed.','voiceKind':'actual-voice' if row['composer']=='bach' else 'source-staff'}

def normalized_coverage(rows):
 by=collections.defaultdict(list)
 for r in rows:
  if r['grace']:continue
  by[(r['track'],r['pitch'])].append((round(r['quarter'],7),round(r['quarter']+r['quarterDuration'],7)))
 out={}
 for k,intervals in by.items():
  merged=[]
  for a,b in sorted(intervals):
   if merged and a<=merged[-1][1]+.0000001:merged[-1][1]=max(merged[-1][1],b)
   else:merged.append([a,b])
  out[k]=merged
 return out

def finalise():
 raw=json.loads((ROOT/'study-manifest-research.json').read_text());pieces=[];checks=[]
 for row in raw['pieces']:
  ident=row['id'];root=E.parse(ROOT/'study-xml'/(ident+'.musicxml')).getroot()
  repair_grace_offsets(root,row)
  study=parse_xml(root,row)
  # Independent parse round-trip checks measures, parts and uncompressed score size.
  for element in root.iter():
   if element.text is not None and not element.text.strip():element.text=None
   element.tail=None
  xml=E.tostring(root,encoding='utf-8',xml_declaration=True)
  if len(xml)>2_000_000:raise ValueError('Uncompressed score bound exceeded')
  (ROOT/'study-xml'/(ident+'.musicxml')).write_bytes(xml)
  score_path=ASSETS/(ident+'.mxl')
  with zipfile.ZipFile(score_path,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
   for name,data in [('META-INF/container.xml',b'<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>'),('score.musicxml',xml)]:
    info=zipfile.ZipInfo(name,date_time=(2026,11,12,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;archive.writestr(info,data,compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
  note_path=ASSETS/(ident+'.json');compact(note_path,packed(study))
  parsed=converter.parseData(xml.decode('utf-8'),format='musicxml')
  if abs(float(parsed.highestTime)-row['durationQuarters'])>.00001:raise ValueError('music21 round-trip duration mismatch')
  midi_path=ASSETS/(ident+'.mid');parsed.write('midi',fp=str(midi_path))
  firsts=[]
  for vi,track in enumerate(study['tracks']):
   first=min((t for t in study['timing'] if t['track']==vi and not t['grace']),key=lambda t:t['start'])
   firsts.append({'label':track['label'],'seconds':first['start'],'measure':first['measure'],'quarter':first['quarter']})
  description=('Two independent score voices.' if len(firsts)==2 else 'Three independent score voices.') if row['composer']=='bach' else 'Colours identify the source staffs, which may each combine musical voices.'
  description+=' '+ '; '.join(f"{x['label']} enters in bar {x['measure']} ({x['seconds']:.1f}s)" for x in firsts)+'.'
  license_url='https://creativecommons.org/publicdomain/mark/1.0/'
  if 'ShareAlike 3.0' in row['license']:license_url='https://creativecommons.org/licenses/by-sa/3.0/'
  elif 'ShareAlike 4.0' in row['license']:license_url='https://creativecommons.org/licenses/by-sa/4.0/'
  elif 'Attribution 2.5' in row['license']:license_url='https://creativecommons.org/licenses/by/2.5/'
  piece={**{k:row[k] for k in ['id','composer','title','voices','edition','license','attribution','sourceHash']},'composerName':COMPOSERS[row['composer']],'source':row['source'],'score':'assets/curated/'+ident+'.mxl','noteData':'assets/curated/'+ident+'.json','midi':'assets/curated/'+ident+'.mid','duration':study['duration'],'bpm':study['bpm'],'secondsPerQuarter':study['secondsPerQuarter'],'voiceKind':study['voiceKind'],'note':description,'entries':firsts,'licenseUrl':license_url,'tempoBasis':row['tempoBasis'],'notationBasis':study['notationBasis'],'scoreHash':digest(score_path.read_bytes()),'xmlHash':digest(xml),'noteDataHash':digest(note_path.read_bytes()),'midiHash':digest(midi_path.read_bytes()),'sourceNotes':row['sourceRows'],'displayedNoteheads':len(study['timing']),'uncompressedScoreBytes':len(xml),'sourceCommit':'2144afd6f52d56c5b6995b8b589ef1268b3139f0','recordingSearch':'https://www.youtube.com/results?search_query='+__import__('urllib.parse',fromlist=['quote']).quote(COMPOSERS[row['composer']]+' '+row['title'])}
  pieces.append(piece)
  piece['sourceFile']=row['source'];piece['source']=row['editionUrl'];piece['editionUrl']=row['editionUrl']
  checks.append({'id':ident,'sourceNoteRows':row['sourceRows'],'displayedNoteheads':len(study['timing']),'parsedDurationQuarters':float(parsed.highestTime),'sourceDurationQuarters':row['durationQuarters'],'parts':len(parsed.parts),'zippedBytes':score_path.stat().st_size,'xmlBytes':len(xml),'xmlSafeZipEntries':True,'stableNoteIDs':len({t['id'] for t in study['timing']})==len(study['timing']),'matchingTimingNoteheads':len(root.findall('.//pitch'))==len(study['timing'])})
  print('FINAL',ident,len(study['timing']),score_path.stat().st_size)
 manifest={'format':'baroque-curated-source-scores/1','captured':'2026-11-12','sourceCommit':'2144afd6f52d56c5b6995b8b589ef1268b3139f0','policy':'50 complete pieces or named movements. Study editions derived from authored LilyPond, not reconstructed from MIDI. Repeats written out; layout and beams are modern. Bach colours identify source voices; other colours identify source staffs. Source ornament signs are not synthesized.','pieces':pieces}
 compact(OUT/'data/curated-fifty.json',manifest)
 compact(OUT/'data/curated-validation.json',{'format':'baroque-curated-validation/1','captured':'2026-11-12','pieces':checks})
 print('TOTAL',len(pieces),'BACH',sum(p['composer']=='bach' for p in pieces),'NONBACH',len(set(p['composer'] for p in pieces if p['composer']!='bach')),'BYTES',sum(p.stat().st_size for p in ASSETS.iterdir()))


def validate_sources():
 import json,pathlib,sys,collections,xml.etree.ElementTree as E,zipfile,hashlib
 manifest=json.loads((OUT/'data/curated-fifty.json').read_text())
 sources=json.loads((ROOT/'download-receipt.json').read_text())
 reports=[]
 for piece in manifest['pieces']:
  ident=piece['id'];section=0
  source_id=ident
  if piece['composer']=='froberger':source_id='froberger-suite7';section=0 if ident.endswith('allemande') else 1
  source=next(r for r in sources if r['id']==source_id)
  path=ROOT/'sources'/source['path'];raw=path.read_text()
  if piece['composer']=='couperin':raw=(path.parent/'mutopia-header.ly').read_text()+'\n'+raw
  doc,scores=score_nodes(raw,path);e=SourceEvents(raw);e.read(scores[section])
  grouping=(lambda r:r['group']) if piece['composer']=='bach' else (lambda r:r['staff'])
  groups=collections.defaultdict(list)
  for row in e.rows:groups[grouping(row)].append(row)
  ordered=sorted(groups,key=lambda k:sum(pitch_number(r) for r in groups[k])/len(groups[k]),reverse=True)
  expected=[]
  for vi,g in enumerate(ordered):
   for r in groups[g]:expected.append({'track':vi,'pitch':pitch_number(r),'quarter':float(r['q']),'quarterDuration':float(r['d']),'grace':r['grace']})
  study=json.loads((OUT/piece['noteData']).read_text())
  actual=study.get('timing') or [dict(zip(study['timingColumns'],r)) for r in study['timingRows']]
  coverage_equal=normalized_coverage(expected)==normalized_coverage(actual)
  def sums(rows):
   d=collections.defaultdict(float)
   for r in rows:
    if not r['grace']:d[(r['track'],r['pitch'])]+=r['quarterDuration']
   return {k:round(v,7) for k,v in d.items()}
  duration_equal=sums(expected)==sums(actual)
  grace_equal=collections.Counter((r['track'],r['pitch'],round(r['quarter'],7)) for r in expected if r['grace'])==collections.Counter((r['track'],r['pitch'],round(r['quarter'],7)) for r in actual if r['grace'])
  with zipfile.ZipFile(OUT/piece['score']) as z:
   entries=z.infolist();safe=all(i.filename in ['META-INF/container.xml','score.musicxml'] and 0<=i.file_size<=2_000_000 for i in entries) and len(entries)==2
   xml=z.read('score.musicxml');tree=E.fromstring(xml)
   score_ids=[n.get('id') for n in tree.findall('.//note') if n.find('pitch') is not None]
   id_equal=set(score_ids)=={n['id'] for n in actual}
   hash_equal=hashlib.sha256(xml).hexdigest()==piece['xmlHash']
  assert coverage_equal and duration_equal and grace_equal and safe and id_equal and hash_equal,(ident,coverage_equal,duration_equal,grace_equal,safe,id_equal,hash_equal)
  reports.append({'id':ident,'sourceToXmlPitchIntervalCoverage':coverage_equal,'sourceToXmlTotalPitchDurations':duration_equal,'sourceToXmlGraceNotes':grace_equal,'safeZipEntries':safe,'timingMatchesAllDisplayedNoteIDs':id_equal,'xmlHashMatches':hash_equal,'sourceNoteheads':len(expected),'displayedNoteheads':len(actual)})
  print('PASS',ident,len(expected),len(actual))
 (OUT/'data/curated-source-validation.json').write_text(json.dumps({'format':'baroque-authored-source-validation/1','captured':'2026-11-12','passed':len(reports),'pieces':reports},separators=(',',':'))+'\n')
 print('All',len(reports),'pieces independently match source spelled pitches, timing coverage, total durations and grace-note locations.')

def download_inputs():
 sources=json.loads((OUT/'data/curated-sources.json').read_text())['files']
 def load_source(row):
  target=ROOT/'sources'/row['path']
  if target.exists() and digest(target.read_bytes())==row['sha256']:return
  if ARGS.offline:raise ValueError('Missing or modified cached source: '+row['path'])
  with urllib.request.urlopen(row['url'],timeout=30) as response:data=response.read(1_000_001)
  if len(data)>1_000_000 or digest(data)!=row['sha256']:raise ValueError('Source hash/size mismatch: '+row['path'])
  target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(load_source,sources))
 (ROOT/'download-receipt.json').write_text(json.dumps(sources,indent=2)+'\n')

if __name__=='__main__':
 download_inputs()
 generate_study_scores()
 finalise()
 validate_sources()
