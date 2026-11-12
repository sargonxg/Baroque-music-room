# Listening-room refinement record · November 12, 2026

This is an implementation audit against the initial listening-room release,
not a claim of 100 new visible controls. The work concentrates on score following,
local sound, source imagery and compact learning material. Each row names a
specific implemented code, data, accessibility or verification change.

The anti-slop skill and its full TELLS catalog were read before this pass. The
surface is now white/ink/copper; content leads, imagery is historical and sourced,
controls name their action, and extra explanation stays in native disclosures.
No testimonials, invented statistics, generated faces or promotional claims were
added. The 102/510/45 counts are unchanged source-dataset counts.

| # | Implemented refinement | Reviewable path / evidence |
|---|---|---|
| 1 | Staff notation for every one of the 45 full local movements. | `src/notation.mjs; src/app.mjs setupStudy` |
| 2 | The source-defined six-bar study also uses the shared playback staff view. | `src/app.mjs setupStudy; data/study.json` |
| 3 | The score appears before playback starts. | `src/app.mjs setupStudy → renderScoreAt(0)` |
| 4 | Seeking rebuilds or highlights the appropriate score page while paused. | `src/app.mjs frame; tests/notation.test.mjs` |
| 5 | Automatic page following advances as playback crosses a boundary. | `src/app.mjs renderScoreAt` |
| 6 | Previous/next pages allow reading independently of playback. | `src/index.html score-prev/score-next; src/app.mjs` |
| 7 | One-, two- and four-bar reading windows share the same renderer. | `src/index.html score-window; src/app.mjs renderScoreAt` |
| 8 | The follow checkbox restores the page containing the current position. | `src/app.mjs score-follow listener` |
| 9 | Notes retain exact source onset/duration attributes and tooltips. | `src/notation.mjs data-note-start/data-note-end` |
| 10 | Note groups have track identifiers for synchronized voice highlighting. | `src/notation.mjs data-score-track/data-track` |
| 11 | Clefs are selected from source pitch range, with an explicit override. | `src/notation.mjs layouts` |
| 12 | Five-line staves and bar lines remain present during rests. | `src/notation.mjs renderPlaybackScore` |
| 13 | Whole, half and filled noteheads use actual music-font outlines. | `src/glyphs.mjs; scripts/notation/extract-glyphs.mjs` |
| 14 | Stem direction follows the note position relative to the staff. | `src/notation.mjs stemDown` |
| 15 | Eighth through sixty-fourth flags use music-font outlines. | `src/notation.mjs rhythmicValue and GLYPH` |
| 16 | Dotted values have explicit notation dots. | `src/notation.mjs rhythm.dotted` |
| 17 | Sharp/flat spelling follows a source-key preference where available. | `src/notation.mjs noteSpelling; data/notation-metadata.json` |
| 18 | Ledger lines are drawn for notes outside the staff. | `src/notation.mjs ledger loops` |
| 19 | Inferred rests identify gaps in a source track. | `src/notation.mjs restGaps` |
| 20 | A note spanning a page is retained as held from the previous window. | `src/notation.mjs carried; tests/notation.test.mjs` |
| 21 | Staff margins expand to keep high and low pitches within the SVG. | `src/notation.mjs layouts; notation pitch-bound test` |
| 22 | Clicking a staff note seeks to its original onset. | `src/app.mjs score click listener` |
| 23 | Enter/Space activates a focused staff note. | `src/app.mjs score keydown listener` |
| 24 | Roving focus provides one note Tab stop per score. | `src/notation.mjs tabindex; notation Tab-stop test` |
| 25 | Arrow/Home/End navigation traverses score notes chronologically. | `src/notation.mjs moveScoreFocus; src/app.mjs` |
| 26 | The original source engraving is preserved in a comparison disclosure. | `src/index.html edition-preview; src/app.mjs source-score` |
| 27 | Source tracks and source-defined independent voices have distinct explanations. | `src/app.mjs study-description; docs/NOTATION-AND-AUDIO.md` |
| 28 | A visible caption explains inferred spelling, clefs, rests and rhythm. | `src/app.mjs notation-note` |
| 29 | Muted tracks dim their staff notes as well as the timing visualization. | `src/notation.mjs highlightPlaybackScore` |
| 30 | Staff geometry, labels and color values are bounded and XML-safe. | `src/notation.mjs validateInput/ESCAPE; injection test` |
| 31 | Harpsichord synthesis has a dedicated harmonic spectrum and pluck envelope. | `src/audio.mjs KEYBOARD_TIMBRES.harpsichord` |
| 32 | Clavichord synthesis uses a softer attack and different spectral rolloff. | `src/audio.mjs KEYBOARD_TIMBRES.clavichord` |
| 33 | Piano-study synthesis has a rounded attack and longer decay. | `src/audio.mjs KEYBOARD_TIMBRES.piano` |
| 34 | Small-organ synthesis sustains rather than decaying as a plucked key. | `src/audio.mjs KEYBOARD_TIMBRES.organ` |
| 35 | Source velocity controls amplitude instead of invented expressive markings. | `src/audio.mjs dynamics in note` |
| 36 | Register compensation reduces overly loud or brittle high notes. | `src/audio.mjs register in note` |
| 37 | Note release is separated from the sounding duration. | `src/audio.mjs holdEnd/release` |
| 38 | A seeded short impulse supplies optional local room sound. | `src/audio.mjs initialize` |
| 39 | Room amount is adjustable and bounded. | `src/audio.mjs setReverb; src/index.html reverb` |
| 40 | Pause silences the room return as well as scheduled notes. | `src/audio.mjs pause; play restores setReverb` |
| 41 | A mild stereo spread separates source tracks. | `src/audio.mjs createStereoPanner branch` |
| 42 | A415 and A440 tuning presets are available without changing event timing. | `src/audio.mjs setTuning; src/index.html tuning` |
| 43 | Compression limits peaks from overlapping polyphonic notes. | `src/audio.mjs compressor` |
| 44 | Per-track level sliders support balancing without muting. | `src/app.mjs track-levels; src/audio.mjs setVoiceLevel` |
| 45 | Solo controls isolate an individual source voice or track. | `src/app.mjs data-solo; src/audio.mjs setSolo` |
| 46 | All together clears solo and restores the track set. | `src/app.mjs all-voices; src/audio.mjs setSolo(null)` |
| 47 | A-B loop endpoints can be set at the current playback position. | `src/app.mjs loop-a/loop-b; src/audio.mjs setLoop` |
| 48 | Loop spans below 0.2 seconds and reversed bounds are rejected. | `src/audio.mjs setLoop; tests/audio.test.mjs` |
| 49 | Newly scheduled note durations are clipped at the loop endpoint. | `src/audio.mjs sourceDuration` |
| 50 | The note timeline shades the active A-B range. | `src/app.mjs renderRoll loop rectangle` |
| 51 | Stop resets the musical position independently of context disposal. | `src/audio.mjs stop` |
| 52 | Page exit disposes the local audio context. | `src/app.mjs pagehide; src/audio.mjs dispose` |
| 53 | Timbre, gain, tuning, rate and room inputs are bounded. | `src/audio.mjs bound and setters; audio control test` |
| 54 | Pending audio resume operations cannot restart a paused transport. | `src/audio.mjs generation; stale-resume test` |
| 55 | Held notes resume with their remaining duration after seeking. | `src/audio.mjs play; sustained-note test` |
| 56 | Tempo metadata is read directly from unchanged SMF bytes. | `scripts/notation/metadata.py; data/notation-metadata.json` |
| 57 | Source meter supports compound and cut-time values. | `scripts/notation/metadata.py meters/beatsPerBar` |
| 58 | Source key metadata provides a spelling preference. | `scripts/notation/metadata.py keys/preferFlats` |
| 59 | PPQ is preserved in the extracted notation metadata. | `scripts/notation/metadata.py division/ppq` |
| 60 | Source-based bar times account for the BWV 828 tempo change. | `scripts/notation/metadata.py seconds_at/barTimes` |
| 61 | All 46 MIDI selections have a checked notation metadata record. | `data/notation-metadata.json; tests/notation.test.mjs` |
| 62 | Twelve historical portrait files replace an imagery-free composer panel. | `assets/portraits/; data/portraits.json` |
| 63 | Portrait creators and dates link to primary Commons file records. | `src/app.mjs composer-portrait figcaption` |
| 64 | Qualified captions preserve caricature, posthumous and attribution limits. | `data/portraits.json; src/app.mjs` |
| 65 | Portraits retain their aspect ratio instead of being cropped into avatars. | `src/style.css composer-portrait img; portrait transformations` |
| 66 | Image failures hide the failed figure without inventing a substitute face. | `src/app.mjs composer image error listener` |
| 67 | Portrait original and optimized hashes retain a redistribution trail. | `data/portraits.json; data/provenance.json` |
| 68 | Twelve concise biographies are available behind Life and work. | `data/biographies.json; src/app.mjs composer-biography` |
| 69 | Each new biography retains its own source link. | `data/biographies.json source; composer-biography` |
| 70 | The suite/partita guide explains movement relationships and shared keys. | `data/education.json Forms you can hear` |
| 71 | The allemande guide gives a concrete listening task. | `data/education.json Allemande` |
| 72 | The courante/corrente guide distinguishes French and Italian practices. | `data/education.json Courante and corrente` |
| 73 | The sarabande guide explains triple metre and second-beat weight. | `data/education.json Sarabande` |
| 74 | The gigue guide connects compound metre with imitation. | `data/education.json Gigue` |
| 75 | The fugue guide explains recognizing a subject and later entries. | `data/education.json Fugue` |
| 76 | The prelude/fantasia guide directs attention to recurring figures and arrivals. | `data/education.json Prelude and fantasia` |
| 77 | The ritornello guide explains recurring material and contrasting episodes. | `data/education.json Ritornello` |
| 78 | The ground-bass/chaconne guide identifies repetition beneath variation. | `data/education.json Ground bass and chaconne` |
| 79 | The ornament guide distinguishes notation signs from their MIDI realization. | `data/education.json Ornament` |
| 80 | The Italian-tradition guide avoids treating style as nationality. | `data/education.json Italian traditions` |
| 81 | The French-tradition guide qualifies notes inégales and ornament performance. | `data/education.json French traditions` |
| 82 | The German-speaking guide describes interaction with other traditions. | `data/education.json German-speaking traditions` |
| 83 | The Iberian/British guide emphasizes comparing actual source pieces. | `data/education.json Iberian and British traditions` |
| 84 | The period guide explains overlapping early/middle/late classifications. | `data/education.json Early, middle and late` |
| 85 | The transition guide explicitly covers Bach’s sons and changing styles. | `data/education.json The transition after Baroque` |
| 86 | A four-step practice connects bass isolation, soloing, loops and recordings. | `data/education.json A short listening practice` |
| 87 | Each selection has a composer-and-title YouTube search rather than an embed. | `src/app.mjs recording-link/query` |
| 88 | The mobile Menu exposes all navigation links. | `src/index.html menu-toggle; src/app.mjs; src/style.css` |
| 89 | White paper replaces the generic cream application surface. | `src/style.css refinement tokens` |
| 90 | The main heading wraps naturally, with no forced break or italic accent word. | `src/index.html intro; src/style.css h1` |
| 91 | Body text and control metadata use stronger contrast and sentence case. | `src/style.css refinement tokens/eyebrow/controls` |
| 92 | Mobile directory and voice controls have larger touch areas. | `src/style.css composer-name/voice-toggle/solo` |
| 93 | Sheet music stays contained in a horizontal reading region on small screens. | `src/index.html score region; src/style.css score` |
| 94 | Score auto-scroll respects reduced-motion preference. | `src/app.mjs renderScoreAt; src/style.css reduced-motion` |
| 95 | Global keyboard shortcuts leave editable fields and focused controls alone. | `src/app.mjs document keydown guard` |
| 96 | Keyboard play, seek, reset and track-mute controls are documented in the UI. | `src/index.html shortcuts; src/app.mjs keydown` |
| 97 | Shared renderer and synthesis contracts are documented for reuse. | `docs/NOTATION-AND-AUDIO.md` |
| 98 | The glyph extraction script makes the small outline set reproducible. | `scripts/notation/extract-glyphs.mjs; assets/notation/ licenses` |
| 99 | Regression coverage renders every selection at the beginning, middle and end. | `tests/notation.test.mjs first test` |
| 100 | Regression coverage checks source-event completeness, held pages and Tab stops. | `tests/notation.test.mjs completeness/held/focus tests` |

## Verification and remaining limits

- Local tests cover catalog/source preservation, transport lifecycle and all 46
  playback notation selections. The current run contains 23 passing tests.
- Source MIDI, source engraving previews and historical-map geometry remain
  unchanged. New derived notation and metadata have explicit provenance.
- **Unresolved:** complete critical-edition score transcription for all 45
  movements is not claimed. Playback notation infers spelling, clefs, rests and
  rhythmic symbols. It preserves source timing; the source edition is linked.
- **Unresolved:** a source MIDI track can contain several contrapuntal voices.
  Only the six-bar Bach study has the checked source-defined three-voice split.
- **Unresolved:** perceptual instrument quality needs audible testing on real
  speakers/headphones and mobile browsers. Unit tests validate scheduling and
  lifecycle, not whether a harpsichord approximation sounds like a recording.
- **Unresolved:** manual screen-reader testing and full device/browser regression
  remain separate from the parent’s Cloudflare-rendered desktop/mobile captures.
- Portraits exist for 12 composers. The other composers retain factual text and
  linked sources; the app does not fabricate a likeness or claim every record has
  a newly researched biography.
- Recording links are exact-title searches. No recording is certified, mirrored,
  ranked or embedded. The user chooses an external performance.
- No new API, model service, paid subscription or hosted resource was activated.
  Publication and final screenshots belong to the owning parent task.
