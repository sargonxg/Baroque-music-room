# Sources and rights

Application code and original editorial notes: Giulio Catanzariti, MIT license.
External assets are licensed separately below; the MIT license does not relicense
those assets. No streaming recordings, score PDFs or biography pages are mirrored.

## Catalog

- `data/composers.json`: 102 curated composer records, each with a biographical
  source and IMSLP catalog link. Facts and concise listening notes were retained
  from the owner's existing listening-room dataset (November 8, 2026 snapshot).
  A city's coordinates mark one associated working location, not a birthplace.
- `data/works.json`: 510 bibliographic selections from IMSLP / Petrucci Music
  Library, captured November 8, 2026. Each entry retains its score page, page ID,
  scoring evidence and source-capture hash. Work titles and bibliographic facts
  are supplied as structured data; no IMSLP score files or recordings are copied.
- Five starting points per composer are not a ranking of popularity or merit.
  Keyboard scoring is preferred when supported by source metadata; collections
  remain collections. Non-keyboard works keep their original scoring.
- Some composers, including Bach's sons, belong to the transition into the
  Classical period. The catalog marks their period explicitly. Modern origin
  and stylistic-affinity labels are not historical citizenship claims.

## Historical map (GPL-3.0)

`assets/map/europe-1700.svg` derives from A. Ourednik and contributors'
[historical-basemaps](https://github.com/aourednik/historical-basemaps).
The original compressed geographic source, generating script and full GNU GPLv3
license accompany the SVG in `assets/map/`. The map combines simplified historical
features around 1700; it is not authoritative border history. Its region colors
have no connection to the composer's musical style.

To regenerate the map, install `d3-geo@3` separately and follow the comments in
`assets/map/historical-map-build.mjs`. The generated map is retained under
GPL-3.0. The upstream title “Austrian Empire” is displayed as **Habsburg lands**: the
Austrian Empire was established in 1804, so that label is anachronistic for this
c.1700 map. The deliberately broad replacement does not assert precise borders
or uniform sovereignty. The original compressed source properties are retained
for audit; `historical-labels.mjs` applies the same correction during regeneration.
No geographic source geometry was changed. CSS also adjusts opacity and fonts.
Source files, the documented label correction and license remain beside the map.

## Music editions

Full attribution, edition licenses, source links, checksums and adaptation notes
are in `data/rights.json` (46 records: 45 complete source movements plus the
six-bar Bach study). The compositions are historical public-domain works, but a
digital edition has its own rights.

- Public-domain editions: Bach BWV 825 and 829; French Suite BWV 816;
  Handel's Aylesford Overture; Scarlatti K. 11; Purcell's *Fairest Isle* arrangement.
- CC BY-SA 4.0 editions: Bach BWV 828 (Urs Metzger), BWV 814 (Joel Mayes)
  and BWV 817 (Knute Snortum).
  Source MIDI is unchanged. Derived note arrays and score-page WebP previews
  remain CC BY-SA 4.0, with source links and attribution in the rights manifest.
- `partita-voices.svg`, `data/study.json`, `partita-study.mid` and the source-note
  positions in `data/partita-score-map.json`: adaptation of the first six bars of
  Carl Bolstad's public-domain BWV 825 edition (Mutopia-2006/08/21-474). Voice
  separation follows the source's TopVoice, MiddleVoice and BottomVoice. The
  last upper F is clipped at the excerpt boundary. Ornament signs are not
  expanded by the edition's MIDI. This source-aligned excerpt is 36 seconds at
  the edition tempo (quarter = 40).
- Full movements preserve source MIDI tracks. These may combine contrapuntal
  voices. The app labels them as source tracks and does not claim note-accurate
  following of the static opening-page score preview.
- `data/favorite-previews.json` contains the opening 30 seconds of 15 source
  movements, clipped at the excerpt boundary, with each source license retained.
  It is a curated listening selection, not a claim about recording popularity.

No licensed instrumental sample, synthesized voice, AI service or remote audio
recording is used. Browser WebAudio supplies a local keyboard approximation.

Relevant licenses:
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/),
[public-domain mark](https://creativecommons.org/publicdomain/mark/1.0/).
Check the rights applicable in your jurisdiction before republishing third-party
editions or making new adaptations.
