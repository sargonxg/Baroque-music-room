#!/usr/bin/env python3
"""Rebuild the pinned Mutopia listening editions. No network is used by the site."""
import argparse
import base64
from collections import defaultdict, deque
from concurrent.futures import ThreadPoolExecutor
import gzip
from hashlib import sha256
import io
import json
from pathlib import Path
import tempfile
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zipfile import ZipFile

import mido

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
FIFTHS = ('Cb Gb Db Ab Eb Bb F C G D A E B F# C#'.split(),
          'Abm Ebm Bbm Fm Cm Gm Dm Am Em Bm F#m C#m G#m D#m A#m'.split())


def digest(data):
    return sha256(data).hexdigest()


def read_source(url, expected, cache, offline):
    # Use the same cached object for all movements in a published score.
    path = cache / digest(url.encode())
    if path.is_file():
        data = path.read_bytes()
    elif offline:
        raise SystemExit(f'Missing cached edition {url}')
    else:
        request = Request(url, headers={'User-Agent': 'BaroqueMusicRoom/1.0 (edition verification)'})
        with urlopen(request, timeout=45) as response:
            data = response.read()
        if digest(data) != expected:
            raise ValueError(f'Upstream edition changed: {url}')
        with tempfile.NamedTemporaryFile(dir=cache, delete=False) as tmp:
            tmp.write(data)
        Path(tmp.name).replace(path)
    if digest(data) != expected:
        raise ValueError(f'Unexpected source hash for {url}')
    return data


def timed_notes(data):
    """Keep the publisher's source track divisions and MIDI resolution.

    A (channel,pitch) queue handles overlapping note-ons, including unisons
    split across source staves. Track chunks and tempo events are independent.
    """
    score = mido.MidiFile(file=io.BytesIO(data))
    if score.type > 1 or score.ticks_per_beat <= 0:
        raise ValueError('Requires a synchronous, pulses-per-quarter score')
    tempo, meter, keys = {0: 500000}, {0: [4, 4]}, {}
    tracks, end = [], 0
    for track in score.tracks:
        tick, active, notes = 0, defaultdict(deque), []
        name = ''
        for msg in track:
            tick += msg.time
            if msg.type == 'set_tempo':
                tempo[tick] = msg.tempo
            elif msg.type == 'time_signature':
                meter[tick] = [msg.numerator, msg.denominator]
            elif msg.type == 'key_signature':
                minor = msg.key.endswith('m')
                keys[tick] = [FIFTHS[minor].index(msg.key) - 7, minor]
            elif msg.type == 'track_name' and not name:
                name = msg.name.strip().strip(':')[:80]
            elif msg.type == 'note_on' and msg.velocity:
                active[msg.channel, msg.note].append((tick, msg.velocity))
            elif msg.type in ('note_on', 'note_off') and active[msg.channel, msg.note]:
                start, velocity = active[msg.channel, msg.note].popleft()
                if tick > start:
                    notes.append((start, tick-start, msg.note, velocity))
        # The raw publisher's MIDI download stays byte-for-byte identical.
        # In the playback view close any notes without an explicit note-off
        # at end-of-track, following the SMF player's all-notes-off behavior.
        for (_, pitch), queue in active.items():
            notes.extend((start, tick-start, pitch, velocity)
                         for start, velocity in queue if tick > start)
        end = max(end, tick)
        if notes:
            last, compact = 0, []
            for start, length, pitch, velocity in sorted(notes):
                compact.append([start-last, length, pitch, velocity])
                last = start
            tracks.append({'label': name, 'notes': compact})
    if not tracks or not all(len(track['notes']) <= 20000 for track in tracks) or len(tracks) > 32:
        raise ValueError('Missing or unsupported MIDI note tracks')
    return {'midi': base64.b64encode(data).decode(), 'ppq': score.ticks_per_beat,
            'endTick': end, 'tempos': sorted(tempo.items()),
            'meters': [[t, *m] for t, m in sorted(meter.items())],
            'keys': [[t, *k] for t, k in sorted(keys.items())], 'tracks': tracks}


def json_bytes(obj):
    return json.dumps(obj, separators=(',', ':'), ensure_ascii=False).encode('utf8')


def render(lock, source_bytes):
    groups, pieces, signatures = defaultdict(dict), [], set()
    for item in lock['pieces']:
        edition = lock['editions'][item['publication']]
        raw = source_bytes[edition['midiUrl']]
        if item.get('member'):
            with ZipFile(io.BytesIO(raw)) as archive:
                raw = archive.read(item['member'])
        if digest(raw) != item['sha256']:
            raise ValueError(f"Movement changed: {item['id']}")
        study = timed_notes(raw)
        # Include the musical sequence. Some publishers' identically sounding
        # alternate MIDI files differ only in automatically generated dates.
        signature = digest(json_bytes([sorted((t['notes'] for t in study['tracks'])),
                                       study['ppq'], study['tempos']]))
        if signature in signatures:
            raise ValueError(f"Duplicate musical selection: {item['id']}")
        signatures.add(signature)
        groups[item['group']][item['id']] = study
        family = lock['groups'][item['group']]
        record = {k: item[k] for k in ('id','title','note') if k in item}
        record.update(composer=edition['composer'], composerName=edition['composerName'],
                      family=family, source=edition['page'], scoreUrl=edition['scoreUrl'],
                      edition=edition['edition'], attribution=edition['attribution'],
                      license=edition['license'], licenseUrl=edition['licenseUrl'],
                      instrumentation=edition['instrumentation'],
                      voiceKind='Source MIDI tracks', trackCount=len(study['tracks']),
                      noteCount=sum(len(t['notes']) for t in study['tracks']),
                      seconds=round(mido.MidiFile(file=io.BytesIO(raw)).length, 3),
                      sha256=item['sha256'], pack=f"assets/editions/{item['group']}.json.gz")
        record['recordingSearch'] = 'https://www.youtube.com/results?' + urlencode(
            {'search_query': f"{edition['composerName']} {item['title']} recording"})
        pieces.append(record)
    files = {}
    for key, value in groups.items():
        buffer = io.BytesIO()
        with gzip.GzipFile(fileobj=buffer, mode='wb', compresslevel=9, mtime=0) as packed:
            packed.write(json_bytes({'version': 1, 'items': value}))
        files[f'assets/editions/{key}.json.gz'] = buffer.getvalue()
    files['data/edition-library.json'] = json_bytes({
        'version': 1, 'pieces': pieces, 'references': lock['references'],
        'composers': lock['composers'], 'guides': lock['guides']}) + b'\n'
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, default=Path.home()/'.cache/baroque-editions')
    parser.add_argument('--offline', action='store_true', help='Require every source in the cache')
    parser.add_argument('--check', action='store_true', help='Verify the repository files byte for byte')
    args = parser.parse_args()
    args.cache.mkdir(exist_ok=True, parents=True)
    lock = json.loads((HERE/'sources.json').read_text())
    urls = {edition[field+'Url']:edition[field+'Sha256'] for edition in lock['editions'].values()
            for field in ('midi','rdf')}
    with ThreadPoolExecutor(max_workers=5) as workers:
        data = dict(zip(urls, workers.map(
            lambda u: read_source(u, urls[u], args.cache, args.offline), urls)))
    for path, raw in render(lock, data).items():
        dest = ROOT/path
        if args.check:
            if not dest.is_file() or dest.read_bytes() != raw:
                raise SystemExit(f'Generated file differs: {path}')
        else:
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(raw)
    print(f"{len(lock['pieces'])} selections; {len(lock['editions'])} source publications; "
          f"{len(lock['groups'])} family packs; {len(lock['references'])} linked scores.")


if __name__ == '__main__':
    main()
