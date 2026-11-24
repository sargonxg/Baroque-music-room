#!/usr/bin/env python3
"""Build the stereo piano bank from Holm's CC BY 3.0 recordings with FFmpeg."""

import argparse
from array import array
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
import json
from math import log10
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
from urllib.parse import quote
from urllib.request import Request, urlopen


REVISION = '3382bf9496bba2486f5ab0de55a264d1dfc38404'
REPOSITORY = 'sfzinstruments/SalamanderGrandPiano'
SAMPLES_URL = f'https://raw.githubusercontent.com/{REPOSITORY}/{REVISION}/Samples/'
OUTPUT = Path(__file__).resolve().parents[1] / 'assets/instruments/piano'
ROOTS = range(21, 109, 3)
VELOCITIES = {'soft': 6, 'medium': 10}
RATE = 44100
NOTE_NAMES = ('C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B')


def ffmpeg(*args):
    return subprocess.check_output(['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', *map(str, args)])


def capture_peak(source):
    values = array('f')
    values.frombytes(ffmpeg('-i', source, '-t', '1.25', '-ar', RATE, '-ac', 2, '-f', 'f32le', '-'))
    peak = max(map(abs, values))
    threshold = max(.0007, peak * .015)
    first = next(index for index, value in enumerate(values) if abs(value) >= threshold)
    # Keep two milliseconds of the room before the recorded attack.
    return peak, max(0, first // 2 / RATE - .002)


def sample_length(root):
    if root <= 48:
        return 9.5
    if root <= 75:
        return 7.8
    if root <= 90:
        return 6.6
    return 5.1


def import_key(root, source_dir, destination, fetch):
    note = NOTE_NAMES[root % 12] + str(root // 12 - 1)
    layers = {}
    for layer, velocity in VELOCITIES.items():
        original = source_dir / f'{note}v{velocity}.flac'
        url = SAMPLES_URL + quote(original.name)
        if not original.exists() and fetch:
            request = Request(url, headers={'User-Agent': 'BaroqueMusicRoom-source-import/1.0'})
            with urlopen(request, timeout=30) as response:
                data = response.read(8_000_001)
            if not data.startswith(b'fLaC') or len(data) > 8_000_000:
                raise ValueError(f'Unexpected source format or size for {original.name}')
            original.write_bytes(data)
        peak, onset = capture_peak(original)
        layers[layer] = (original, url, peak, onset)

    # Use one gain for both recordings of a key, retaining their relative touch.
    gain = min(12, 20 * log10(.70 / max(layer[2] for layer in layers.values())))
    take = sample_length(root)
    records = []
    for layer, (original, url, _, onset) in layers.items():
        filename = f'{root}-soft.mp3' if layer == 'soft' else f'{root}.mp3'
        output = destination / filename
        filters = f'highpass=f=17,volume={gain:.4f}dB,afade=t=out:st={take - .48:.2f}:d=0.48'
        ffmpeg('-ss', f'{onset:.6f}', '-i', original, '-t', take, '-af', filters,
               '-map_metadata', '-1', '-ac', 2, '-ar', RATE, '-c:a', 'libmp3lame', '-q:a', 2, output)
        data = output.read_bytes()
        if not 5_000 <= len(data) <= 280_000:
            raise ValueError(f'Unexpected output size for {filename}: {len(data)} bytes')
        records.append({'midiRoot': root, 'note': note, 'layer': layer, 'recordedVelocity': VELOCITIES[layer],
                        'file': filename, 'bytes': len(data), 'sha256': sha256(data).hexdigest(),
                        'upstream': url, 'upstreamSha256': sha256(original.read_bytes()).hexdigest(),
                        'attackTrimSeconds': round(onset, 6), 'maxDurationSeconds': take})
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source_dir', type=Path, help='Directory of upstream FLAC samples')
    parser.add_argument('--fetch', action='store_true', help='Download missing samples from the pinned source')
    args = parser.parse_args()
    args.source_dir.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix='piano-', dir=OUTPUT.parent) as temporary:
        destination = Path(temporary)
        with ThreadPoolExecutor(max_workers=8) as pool:
            samples = [row for rows in pool.map(lambda root: import_key(root, args.source_dir, destination, args.fetch), ROOTS)
                       for row in rows]
        provenance = {
            'source': 'Salamander Grand Piano v3, Alexander Holm',
            'original': 'https://archive.org/details/SalamanderGrandPianoV3',
            'distribution': f'https://github.com/{REPOSITORY}/tree/{REVISION}',
            'license': 'https://creativecommons.org/licenses/by/3.0/',
            'sampleRate': RATE,
            'channels': 2,
            'adaptation': 'Two stereo recordings per root, every minor third from A0 through C8. '
                          'Trimmed leading silence, calibrated the two takes with one gain per key, and applied '
                          'subsonic filtering and a tail fade before VBR MP3 encoding. Original score timings are retained.',
            'samples': samples,
        }
        for row in samples:
            (destination / row['file']).replace(OUTPUT / row['file'])
        (OUTPUT / 'provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
    print(f'{len(samples)} stereo samples, {sum(row["bytes"] for row in samples):,} bytes')


if __name__ == '__main__':
    main()
