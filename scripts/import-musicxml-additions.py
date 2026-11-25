"""Rebuild the credited BWV 914 fugue from the pinned, original MusicXML. No network.

Install scripts/editions/requirements.txt for mido. Use --check to verify all
four committed outputs against this source without writing to the repository.
"""
import argparse
import hashlib
import io
import json
from collections import defaultdict
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

from mido import Message, MetaMessage, MidiFile, MidiTrack, bpm2tempo

ROOT = Path(__file__).resolve().parents[1]
PIECE = 'bwv914-fugue'
SOURCE_HASH = '42ebb0a1926c281fcb2da2597f01eba9a955a0f14261b494ea20c1bdcadf07c9'
SOURCE = 'https://musescore.com/user/6725176/scores/2698796'
DISTRIBUTOR = 'https://pianosoloist.app/songs/bach-toccata-e-minor-bwv914-fugue'
COLORS = ['#b74131', '#246a74']
LABELS = ['Upper staff', 'Lower staff']
COLUMNS = ['id', 'part', 'voice', 'track', 'quarter', 'start', 'duration',
           'quarterDuration', 'measure', 'beat', 'pitch', 'voiceColor', 'grace', 'ties']
LISTEN = ('The subject starts alone. At bar 5 a higher voice answers it a fifth above. '
          'At bar 10 the lower staff takes up the opening an octave below.')
BASIS = ('Samuel Ricke’s MusicXML engraving. Colours mark staves, including notes that cross '
         'between them. Playback joins ties. The printed mordents remain visible.')
TICKS = 8  # This edition retains a constant eight divisions to the quarter.


def digest(data):
    return hashlib.sha256(data).hexdigest()


def wire(obj):
    return (json.dumps(obj, separators=(',', ':'), ensure_ascii=False) + '\n').encode()


def score_events(root):
    rows, measures, tempos = [], [], {}
    absolute = 0
    for measure in root.findall('part/measure'):
        cursor = previous = extent = 0
        number = measure.attrib['number']
        for element in measure:
            duration = int(element.findtext('duration', '0'))
            if element.tag == 'attributes':
                assert int(element.findtext('divisions', str(TICKS))) == TICKS
            elif element.tag == 'direction':
                for sound in element.findall('sound[@tempo]'):
                    when = absolute + cursor + int(element.findtext('offset', '0'))
                    tempos[when] = float(sound.attrib['tempo'])
            elif element.tag in ('backup', 'forward'):
                cursor += -duration if element.tag == 'backup' else duration
                assert cursor >= 0
                extent = max(extent, cursor)
            elif element.tag == 'note':
                start = previous if element.find('chord') is not None else cursor
                if element.find('chord') is None:
                    previous = start
                    cursor += duration
                extent = max(extent, start + duration)
                pitch = element.find('pitch')
                if pitch is None:
                    continue
                staff = int(element.findtext('staff')) - 1
                ident = f'N{len(rows) + 1:05}'
                element.set('id', ident)
                element.set('color', COLORS[staff])
                semitone = dict(C=0, D=2, E=4, F=5, G=7, A=9, B=11)[pitch.findtext('step')]
                key = (1 + int(pitch.findtext('octave'))) * 12 + semitone + int(pitch.findtext('alter', '0'))
                rows.append(dict(id=ident, staff=staff, voice=element.findtext('voice'),
                                 tick=absolute + start, length=duration, pitch=key, bar=number,
                                 beat=1 + start / TICKS, ties=[t.attrib['type'] for t in element.findall('tie')]))
        assert extent == 4 * TICKS
        measures.append((number, absolute, absolute + extent))
        absolute += extent
    assert len(measures) == 72 and len(rows) == 1823
    assert root.find('.//repeat') is None and root.find('.//grace') is None
    return rows, measures, sorted(tempos.items())


def sounding_notes(rows):
    notes = []
    ties = defaultdict(list)
    for row in sorted(rows, key=lambda entry: entry['tick']):
        key = (row['staff'], row['pitch'])
        if 'stop' in row['ties']:
            # In bar 71 the arpeggiated chord is held into a second notation
            # voice. The ties explicitly sustain the keys across that gap.
            matches = [n for n in ties[key] if n['end'] <= row['tick']]
            assert len(matches) == 1, f'Ambiguous tie at {row["id"]}'
            note = matches[0]
            ties[key].remove(note)
        else:
            note = dict(row)
            notes.append(note)
        note['end'] = row['tick'] + row['length']
        if 'start' in row['ties']:
            ties[key].append(note)
    assert not any(ties.values()) and len(notes) == 1801
    return notes


def seconds(tick, tempos):
    total = 0.0
    for index, (start, bpm) in enumerate(tempos):
        if start >= tick:
            break
        end = min(tick, tempos[index + 1][0]) if index + 1 < len(tempos) else tick
        total += (end - start) * 60 / (TICKS * bpm)
    return round(total, 7)


def midi_file(notes, tempos, end_tick):
    midi = MidiFile(type=1, ticks_per_beat=TICKS)
    conductor = midi.add_track('Bach BWV 914 - Final fugue')
    conductor.append(MetaMessage('time_signature', numerator=4, denominator=4))
    conductor.append(MetaMessage('key_signature', key='Em'))
    previous = 0
    for tick, bpm in tempos:
        conductor.append(MetaMessage('set_tempo', tempo=bpm2tempo(bpm), time=tick - previous))
        previous = tick
    conductor.append(MetaMessage('end_of_track', time=end_tick - previous))
    for staff, label in enumerate(LABELS):
        track = MidiTrack()
        track.name = label
        midi.tracks.append(track)
        events = []
        for note in notes:
            if note['staff'] == staff:
                channel = int(note['voice']) - 1
                events.extend([(note['tick'], 1, channel, note['pitch']),
                               (note['end'], 0, channel, note['pitch'])])
        for channel in sorted({event[2] for event in events}):
            track.append(Message('program_change', channel=channel, program=0))
        previous = 0
        for tick, on, channel, pitch in sorted(events):
            track.append(Message('note_on' if on else 'note_off', channel=channel,
                                 note=pitch, velocity=88 if on else 0, time=tick - previous))
            previous = tick
    output = io.BytesIO()
    midi.save(file=output)
    return output.getvalue()


def archive(xml):
    container = (b'<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">'
                 b'<rootfiles><rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/>'
                 b'</rootfiles></container>')
    output = io.BytesIO()
    with ZipFile(output, 'w') as score:
        for name, data in [('META-INF/container.xml', container), ('score.musicxml', xml)]:
            score.writestr(ZipInfo(name, (2025, 1, 14, 0, 0, 0)), data, ZIP_DEFLATED, 9)
    return output.getvalue()


def build():
    raw = (ROOT / 'scripts/source-scores' / f'{PIECE}.mxl').read_bytes()
    assert digest(raw) == SOURCE_HASH, 'Unexpected source edition'
    with ZipFile(io.BytesIO(raw)) as original:
        root = ET.fromstring(original.read('score.xml'))
    assert len(root.findall('part')) == 1 and root.findtext('identification/source') == 'https://musescore.com/score/2698796'
    rows, bars, tempos = score_events(root)
    notes = sounding_notes(rows)
    voices = [dict(id=f'V{i + 1}', label=label, color=COLORS[i], actualVoice=False, sourceGroup=f'staff{i + 1}')
              for i, label in enumerate(LABELS)]
    tracks = [{**voice, 'notes': [], 'description': 'Printed staff. It can carry several contrapuntal voices.'} for voice in voices]
    for note in notes:
        start = seconds(note['tick'], tempos)
        tracks[note['staff']]['notes'].append([note['pitch'], start, round(seconds(note['end'], tempos) - start, 7), round(88/127, 5)])
    timing = []
    for row in rows:
        track = row['staff']
        start = seconds(row['tick'], tempos)
        timing.append([row['id'], voices[track]['id'], row['voice'], track, row['tick'] / TICKS, start,
                       round(seconds(row['tick'] + row['length'], tempos) - start, 7), row['length'] / TICKS,
                       row['bar'], row['beat'], row['pitch'], COLORS[track], False, row['ties']])
    measures = [dict(number=bar, quarter=start/TICKS, quarterEnd=end/TICKS,
                     start=seconds(start, tempos), end=seconds(end, tempos)) for bar, start, end in bars]
    duration = seconds(bars[-1][2], tempos)
    study = dict(duration=duration, tracks=tracks, measureTimes=measures, secondsPerQuarter=60/tempos[0][1],
                 bpm=tempos[0][1], tempoMap=[dict(quarter=t/TICKS, seconds=seconds(t, tempos), bpm=b) for t, b in tempos],
                 notationBasis=BASIS, voiceKind='source-staff', timingFormat='columns/1', timingColumns=COLUMNS,
                 timingRows=timing)
    # Keep original spellings, beams, directions and articulations. Whitespace is layout-free.
    for element in root.iter():
        if element.text is not None and not element.text.strip():
            element.text = None
        element.tail = None
    xml = ET.tostring(root, encoding='utf-8', xml_declaration=True)
    score, data, midi = archive(xml), wire(study), midi_file(notes, tempos, bars[-1][2])
    prefix = f'assets/curated/{PIECE}'
    piece = dict(id=PIECE, composer='bach', composerName='Johann Sebastian Bach',
                 title='Toccata in E minor · Final fugue · BWV 914', family='Keyboard toccatas',
                 voices=voices, voiceKind='source-staff', edition='Samuel Ricke’s keyboard engraving',
                 attribution='Samuel Ricke', license='Public Domain', licenseUrl='https://creativecommons.org/publicdomain/mark/1.0/',
                 source=SOURCE, editionUrl=SOURCE, sourceFile='https://pianosoloist.app/library/bach-toccata-e-minor-bwv914-fugue.mxl',
                 sourceHash=SOURCE_HASH, distributionPage=DISTRIBUTOR, editionCredit='MusicXML from Piano Soloist / PDMX.',
                 note=LISTEN, listeningNote=LISTEN, notationBasis=BASIS, tempoBasis='Source tempo marks at bars 1 and 72.',
                 score=prefix+'.mxl', noteData=prefix+'.json', midi=prefix+'.mid', duration=duration,
                 bpm=study['bpm'], secondsPerQuarter=study['secondsPerQuarter'], displayedNoteheads=len(rows),
                 sourceNotes=len(rows), scoreHash=digest(score), xmlHash=digest(xml), noteDataHash=digest(data),
                 midiHash=digest(midi), uncompressedScoreBytes=len(xml),
                 recordingSearch='https://www.youtube.com/results?search_query=Bach+Toccata+in+E+minor+BWV+914+final+fugue')
    manifest = dict(format='baroque-curated-source-scores/1', pieces=[piece])
    return {piece['score']: score, piece['noteData']: data, piece['midi']: midi, 'data/musicxml-additions.json': wire(manifest)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    for filename, data in build().items():
        path = ROOT / filename
        if args.check:
            if path.read_bytes() != data:
                raise SystemExit(f'Rebuild {filename}')
        else:
            path.write_bytes(data)
        print(filename, len(data), digest(data))
