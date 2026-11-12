# Baroque · A listening atlas

Explore 102 composers on a historical European map, then listen to a complete
keyboard selection with its score. The curated desk has **50 pieces or named
movements: 30 Bach Inventions/Sinfonias and 20 selections across seven other
composers**. The catalog also keeps 510 linked works and 45 additional local
MIDI movements, including Bach's six Partitas.

## Run locally

Node.js 20 or later:

```sh
git clone https://github.com/sargonxg/Baroque-music-room.git
cd Baroque-music-room
npm ci
npm test
npm run dev
```

Open http://127.0.0.1:8000. `npm run build` creates `dist/` for any static host.
No account, API key, database, model service or recording subscription is needed.
Normal builds and playback are offline; external edition and recording links
require an internet connection. Serve over HTTP for separately loaded scores.

## Try a listening study

Choose a composer on the map or in the directory. Filter by origin, musical
tradition or period. At the listening desk, choose a complete piece, press
Listen, and follow its coloured source-derived score. Click a note to seek;
mute or solo a line, slow a passage or set an A–B loop. Try harpsichord or piano.
The exact-title YouTube search link opens recorded performances separately.

The 50 curated selections use complete MusicXML study editions from pinned
Mutopia authored sources. OpenSheetMusicDisplay 2.3.0 engraves the score locally
and loads only at the listening desk. The free renderer is used with this
project's own local Web Audio transport, not its sponsored audio service.

Bach colours identify two or three **source-defined independent voices**.
Other selections distinguish source staves, which may contain multiple voices.
The additional 45 MIDI movements keep explicitly labelled MIDI-derived notation;
source tracks are not silently promoted to musical voices. The six-bar BWV 825
study remains available as a separate short example.

Source spelling, meter, rests, pickups and written-out repeats are retained in
the curated study scores. Layout and automatic beaming are modern. Editorial
marks are not all reproduced; grace notes remain visible but are unsounded,
and ornament signs are not realised by synthesis. This is a keyboard study,
not a concert recording or a historically authentic instrument simulation.

## Data and reproducibility

- `data/curated-fifty.json`: 50 pieces, edition links, sources, rights and hashes.
- `assets/curated/`: complete compressed MusicXML, study MIDI and timed note data.
- `data/curated-source-validation.json`: independent authored-source coverage checks.
- `data/composers.json` and `data/works.json`: the 102-composer/510-work atlas.
- `data/catalogue.json`: the 45 earlier source-MIDI movements.

The new assets contain 31,293 source score noteheads. Compact timing rows retain
stable note IDs, quarter offsets, measure boundaries and voice attribution;
only the selected piece is expanded in the browser. All 150 generated assets
rebuild byte-for-byte from the pinned authored sources. An ordinary build makes
no source downloads. See [data/curated-README.md](data/curated-README.md) for the
optional Python importer's reproduction commands and exact limitations.

The c. 1700 territory map is schematic. A dot identifies one working city, not
a modern nationality or birthplace. Shared-city composers remain accessible
through the directory; transitional figures, including Bach's sons, are labelled.

## Deploy a static copy

```sh
npm ci
npm run build
```

Upload only `dist/`. The included Workers Static Assets configuration disables
workers.dev and version previews until you configure your own route. Whole-host
Cloudflare Access is separate from the app's security headers. Nothing here
provisions a database, activates a paid service or establishes a spending cap.

## Rights and checks

Original runtime code is MIT; the historical map retains GPL-3.0. The optional
Python importer is GPL-3.0-or-later. Each converted music asset retains its
edition's PD, CC BY or CC BY-SA terms and named typesetter credit. The retained
OSMD licence travels with its pinned local bundle. See ATTRIBUTION.md.

`npm test` checks all 50 source/score/MIDI hashes, safe compressed-score entries,
source-note coverage, timing bounds, catalog filters, audio lifecycle, looping,
source notation and the emitted CSP. Browser captures and score alignment are
recorded separately; structural tests do not certify audible fidelity.
