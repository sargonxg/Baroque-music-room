# Source MIDI editions

This collection adds 296 local performances from 192 Mutopia publications. It includes the Goldberg Aria and all 30 variations, all six solo violin sonatas and partitas, the four concertos in Vivaldi’s *Four Seasons*, Royer’s 1746 *Premier livre* and Buxtehude’s seven *Membra Jesu nostri* cantatas. The 311,678 note events amount to 11 hours and 59 minutes at the published MIDI tempos.

The browser fetches one of 18 compressed families when a listener chooses a piece. Together they occupy 1,246,082 bytes. The largest is 151,241 bytes. The packs include both the playback sequence and the publisher’s original Standard MIDI File. Once loaded, the browser plays the piece from the local pack.

## Read a score

Every entry has a complete synchronized reading score and a link to the publisher’s engraving. A PDF archive link opens the publisher’s ZIP of score PDFs. Track colours follow the original MIDI divisions. An engraved contrapuntal voice, a keyboard staff and a MIDI track can represent different things. The app reserves voice labels for editions that establish them explicitly.

Note onsets, releases, velocity, meter changes and tempo changes retain the original MIDI values. The reading score infers glyph spelling, clefs, rests and its first bar from the timed pitches. Consult the publisher’s score for ornaments, exact engraving and pickups. The grand piano renders the original pitches of vocal and instrumental works, and the credit names the source instrumentation.

## Bach editions

- The opening Aria and the thirty Goldberg variations are separate selections. The returning Aria uses the same score.
- The local BWV 826 edition contains the Sinfonia and Allemande. BWV 827 and 830 follow the 1725 notebook versions in the Bach-Gesellschaft edition, with their own sequence of movements. The catalogue links to complete later keyboard-partita editions for all three works.
- BWV 910 has a local source MIDI. The six other complete keyboard toccatas have individual publisher PDFs and MIDI links on Tobis Notenarchiv. Those external editions have the publisher’s noncommercial terms. A separately transcribed section of a toccata is always identified by its movement.

## Rights and credits

[The source lock](sources.json) records each publication’s metadata URL and SHA-256, MIDI or MIDI archive URL and SHA-256, archive member, digital edition, source arranger where credited, contributor, original instrumentation, rights statement and licence URL. The generated catalogue carries the listening credit and movement hash on every entry. Preserve these credits with any redistribution.

The 112 public-domain MIDI selections use Mutopia’s public-domain designation. The remaining 184 editions retain their stated Creative Commons Attribution or Attribution-ShareAlike licences. The reading scores generated from these MIDI tracks are timed study renderings. The original downloadable MIDI is byte-identical to the credited source file. The project’s software licence applies to its code. [Mutopia](https://www.mutopiaproject.org/) · [Tobis Notenarchiv terms](https://tobis-notenarchiv.de/wp/en/terms-of-use/)

## Rebuild and verify

Run these commands from the repository root. The ordinary website build uses the committed static packs.

```sh
python3 -m venv .venv-editions
.venv-editions/bin/python -m pip install -r scripts/editions/requirements.txt
.venv-editions/bin/python scripts/editions/import.py --cache /tmp/baroque-source-cache
.venv-editions/bin/python scripts/editions/import.py --cache /tmp/baroque-source-cache --offline --check
node --test tests/edition-library.test.mjs
```

The importer checks each RDF and MIDI archive against its pinned digest before extracting the named movement. It rejects repeated musical sequences, preserves overlapping note events, and produces deterministic gzip output. The test opens every entry, follows its timing through the final bar, checks pitch and duration bounds, and hashes its downloaded MIDI against the original. It also exercises compressed and HTTP-decoded pack responses.

To add a selection, enter the exact published edition, licence, credit, source digests, stable movement ID and archive member in the lock, add a concise listening cue where appropriate, then rerun the importer and tests. Keep recordings and links to externally hosted scores outside the local performance count.
