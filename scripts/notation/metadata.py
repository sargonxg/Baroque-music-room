"""Read meter/key/tempo metadata from the original SMF bytes, without rewriting them."""
from pathlib import Path
import json

def vlq(data, offset):
    value=0
    for _ in range(4):
        byte=data[offset];offset+=1;value=(value<<7)|(byte&127)
        if byte<128:return value,offset
    raise ValueError('Invalid MIDI variable-length quantity')

def metadata(data):
    if data[:4]!=b'MThd' or len(data)<14:raise ValueError('Not an SMF file')
    header_length=int.from_bytes(data[4:8],'big');division=int.from_bytes(data[12:14],'big')
    if division&0x8000 or not division:raise ValueError('Unsupported SMPTE division')
    offset=8+header_length;tempos=[];meters=[];keys=[];last_tick=0
    while offset<len(data):
        if data[offset:offset+4]!=b'MTrk':raise ValueError('Missing MIDI track')
        length=int.from_bytes(data[offset+4:offset+8],'big');track=data[offset+8:offset+8+length];offset+=8+length
        cursor=0;tick=0;running=None
        while cursor<len(track):
            delta,cursor=vlq(track,cursor);tick+=delta;status=track[cursor]
            if status<128:
                if running is None:raise ValueError('Missing MIDI running status')
                status=running
            else:
                cursor+=1
                if status<240:running=status
            if status==255:
                kind=track[cursor];cursor+=1;size,cursor=vlq(track,cursor);body=track[cursor:cursor+size];cursor+=size
                if kind==81 and size==3:tempos.append({'tick':tick,'microsecondsPerQuarter':int.from_bytes(body,'big')})
                elif kind==88 and size>=2:meters.append({'tick':tick,'numerator':body[0],'denominator':2**body[1]})
                elif kind==89 and size>=2:keys.append({'tick':tick,'sharps':int.from_bytes(body[:1],'big',signed=True),'minor':body[1]==1})
            elif status in (240,247):size,cursor=vlq(track,cursor);cursor+=size
            elif status<240:cursor+=1 if status&240 in (192,208) else 2
            else:raise ValueError('Unsupported system message')
        last_tick=max(last_tick,tick)
    def unique(items):
        return list({tuple(x.values()):x for x in sorted(items,key=lambda x:x['tick'])}.values())
    tempos=unique(tempos) or [{'tick':0,'microsecondsPerQuarter':500000}]
    meters=unique(meters) or [{'tick':0,'numerator':4,'denominator':4}]
    keys=unique(keys)
    meter=meters[0];quarter=tempos[0]['microsecondsPerQuarter']/1000000
    def seconds_at(tick):
        total=0;previous=0;micros=500000
        for tempo in tempos:
            if tempo['tick']>tick:break
            total+=(tempo['tick']-previous)/division*micros/1000000
            previous=tempo['tick'];micros=tempo['microsecondsPerQuarter']
        return total+(tick-previous)/division*micros/1000000
    for tempo in tempos:tempo['seconds']=round(seconds_at(tempo['tick']),8)
    bars=[];bar_number=1
    for index,m in enumerate(meters):
        stop=meters[index+1]['tick'] if index+1<len(meters) else last_tick
        quantum=division*m['numerator']*4/m['denominator'];tick=m['tick']
        while tick<=stop:
            if not bars or abs(bars[-1]['seconds']-seconds_at(tick))>.000001:
                bars.append({'bar':bar_number,'seconds':round(seconds_at(tick),8)});bar_number+=1
            tick+=quantum
    return {'ppq':division,'secondsPerBeat':quarter,'beatsPerBar':meter['numerator']*4/meter['denominator'],'meter':meter,'barTimes':bars,'tempos':tempos,'meters':meters,'keys':keys,'preferFlats':keys[0]['sharps']<0 if keys else True,'inference':'Meter/key/tempo are read from source SMF metadata. Glyph spelling, clef, rests and rhythmic symbols in the playback view are inferred. Tempo changes can make its bar grid approximate; the note timing remains the source timing.'}

def build():
    records={}
    for path in sorted(Path('assets/music').glob('*.mid')):records[path.stem]=metadata(path.read_bytes())
    Path('data/notation-metadata.json').write_text(json.dumps({'format':'source-smf-notation-metadata/1','records':records},indent=2)+'\n')
    print(f'Extracted source meter/key/tempo metadata for {len(records)} local MIDI selections.')

if __name__=='__main__':build()
