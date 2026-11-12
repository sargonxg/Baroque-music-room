# Fifty authored-source listening studies

The curated desk contains 50 complete pieces or individual movements:

| Composer | Selections |
| --- | ---: |
| J. S. Bach | 30: the 15 Inventions and 15 Sinfonias |
| François Couperin | 4 preludes from *L’Art de toucher le clavecin* |
| George Frideric Handel | 4 Aylesford keyboard pieces |
| Domenico Scarlatti | 3 sonatas |
| Jean-Philippe Rameau | 3 keyboard pieces |
| Dieterich Buxtehude | 3 organ chorale settings |
| Johann Jakob Froberger | 2 movements from Suite VII |
| Johann Pachelbel | 1 Magnificat fugue |

These are source-derived **study editions**, not facsimiles or MIDI-inferred
notation. Authored LilyPond scores are pinned to Mutopia commit
`2144afd6f52d56c5b6995b8b589ef1268b3139f0`; every downloaded input keeps its
SHA-256 in `curated-sources.json`. Spelled pitches, rational durations, rests,
source voice structure, keys, meter, pickups and repeat order come from those
sources. Repeats are written out. The layout and automatic beaming are modern;
source editorial marks are not all reproduced.

For the Bach studies, colours distinguish the source’s two or three independent
voices. For other selections, colours distinguish staffs, each of which can
contain more than one voice. Staff and hand are not used as synonyms. MusicXML
retains its internal voice groups. A keyboard rendering of an organ composition
is a listening study, not a historically authentic performance.

Every selection has compressed MusicXML (`.mxl`), a generated study MIDI, and
JSON playback data. The MIDI and local synthesis follow the complete study
score. Grace notes remain visible but are not sounded; trills, turns and other
ornament signs are not realized. Source numeric tempo is retained where given;
otherwise the record explicitly identifies an editorial study tempo. No concert
recordings or instrument sample banks are distributed.

## Playback and score matching

`tracks` retain the existing `{id,label,color,actualVoice,notes}` interface.
Each note is `[midiPitch,startSeconds,durationSeconds,velocity]`. Tied segments
are joined for playback, while every displayed MusicXML notehead has a stable ID.

The compact timing format is `timingFormat: "columns/1"` with a fixed
`timingColumns` list and `timingRows`. Expand rows with the listed columns, using
only this exact whitelist:

```text
id, part, voice, track, quarter, start, duration, quarterDuration,
measure, beat, pitch, voiceColor, grace, ties
```

`quarter` is the absolute quarter-note offset. `measureTimes` provide quarter
and second boundaries, including pickups. `tempoMap` supports source numeric
tempo changes. The matching `id` is on the MusicXML `<note>` element; displayed
tie continuations and unsounded grace notes remain in the timing table.

The MXL container has exactly two safe entries: `META-INF/container.xml` and
`score.musicxml`. Its uncompressed score is bounded to 2 MB. The manifest pins
the compressed XML, uncompressed XML, JSON and MIDI hashes separately.

## Verify and reproduce

Ordinary builds are offline and use the committed assets. Verify integrity:

```sh
node scripts/import-curated-check.mjs
```

To rebuild the editions from their pinned authored sources, use Python 3.12:

```sh
python -m venv .venv-curated
.venv-curated/bin/pip install -r scripts/import-curated-requirements.txt
.venv-curated/bin/python scripts/import-curated.py
```

Windows uses `.venv-curated\Scripts\python` instead. The importer’s default
cache is in the system temporary directory, outside the published assets. Pass
`--cache /your/cache` to choose one and `--offline` to prohibit downloads once
the 53 small, hash-checked inputs are cached. It does not invoke LilyPond or
evaluate Scheme source. No network, Python, model service or API key is needed
by a visitor or an ordinary static build.

The source check independently compares the authored AST with the final XML:
pitched interval coverage, summed pitch durations and grace-note positions.
XML parsing round-trips preserve every part’s duration. ZIP, ID, hash and playback
bounds are checked separately. These structural checks do not certify audible
instrument fidelity or replace musical proofreading.

## Edition rights

The 39 public-domain editions retain their source declarations. Four editions
use CC BY-SA 3.0, three use CC BY-SA 4.0, and four Couperin preludes use CC BY 2.5.
Converted scores, study MIDIs and per-piece note data retain those respective
edition terms and named typesetter credits. Read the manifest’s `license`,
`licenseUrl`, `attribution`, `editionUrl` and pinned `sourceFile` for each piece.
Composition age does not remove an edition’s attribution/share-alike terms.

The optional Python importer uses python-ly and music21. It is supplied under
GPL-3.0-or-later (the full license is in `assets/map/historical-license.txt`);
runtime application licensing is unchanged. No converter or
source cache is included in the deployed browser assets.
