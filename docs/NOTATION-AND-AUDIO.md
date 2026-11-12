# Shared playback notation and keyboard synthesis

## Staff renderer

Copy `src/notation.mjs` and `src/glyphs.mjs` together, with the notices in
`assets/notation/`. No runtime font fetch or third-party package is required.

```js
import {renderPlaybackScore, highlightPlaybackScore} from './notation.mjs';
const page = renderPlaybackScore(study, {
  position: 12,
  secondsPerBeat: 0.75,
  beatsPerBar: 4,
  windowSeconds: 6,
  width: 1040,
});
container.innerHTML = page.svg;
highlightPlaybackScore(container, 12, [true, false, true]);
```

`study` is `{duration, tracks:[{label,notes:[[midiPitch,startSeconds,durationSeconds,velocity],...]}]}`.
Source-track arrays remain unchanged. The renderer bounds notes, track count,
geometry and color input and escapes labels before constructing SVG.

It returns `{svg,notes,windowStart,windowEnd,inferred:true,caption}`. Call it when
loading, stopping, seeking or crossing a page boundary. Between boundaries,
`highlightPlaybackScore` updates the line and active/muted note groups. A note
crossing into a window remains drawn as held. A generated note's `data-seek`
attribute is its source onset in seconds; the application uses click and Enter/
Space to seek to it. The app's default automatic pages contain two bars; users
can choose one or four and pause following to read another page.

For the full app, spread the corresponding record from
`data/notation-metadata.json` into the options. It supplies meter, first tempo,
key preference and source-based `barTimes`, read from the original SMF. Bar times
account for the source tempo change in BWV 828. The original event timings remain
authoritative; glyph values, spelling, rests and clefs are inferred reading aids.
They do not reproduce the editor's beaming, ornaments, spelling or voice allocation.
A MIDI track may contain several musical voices. These limits appear in the UI.

Actual Bravura outlines for 23 clefs/noteheads/flags/rests/accidentals are rendered
with VexFlow 4.2.5 and retained as small path data. `scripts/notation/extract-glyphs.mjs`
reproduces the outlines from a separately installed VexFlow 4.2.5. The source-aligned
three-voice Bach engraving and original opening-page previews remain available
for comparison, with their independent edition rights and source links.

## Local keyboard transport

`src/audio.mjs` exports `KeyboardTransport` and `KEYBOARD_TIMBRES`.

```js
const player = new KeyboardTransport(onFrame, onEnd);
player.load(study);
player.setTimbre('harpsichord');
await player.play();
await player.seek(15);
player.setSolo(1);
player.setLoop(12, 20);
player.pause();
await player.dispose();
```

Existing controls are `play`, `pause`, `seek`, `setRate`, `setVolume`, `setVoice`.
The refinement adds `setVoiceLevel`, `setSolo(index|null)`, `setTimbre`, `setTuning`,
`setReverb`, `setLoop`, `clearLoop`, `stop` and `dispose`. The public `enabled`,
`position`, `playing` and `loop` state can drive UI controls. Settings are bounded.

Four timbres use distinct harmonic spectra and envelopes. The source velocity
controls amplitude. Register compensation reduces high-note harshness, optional
stereo spread separates tracks and a deterministic short impulse provides room
sound. Reverb is a local synthesized response, not a sampled concert hall.
A415/A440 presets change tuning in equal temperament; neither claims universal
historical authenticity. No licensed instrument sample or recording is included.

The 25ms scheduler looks ahead 180ms. Pause invalidates pending resume operations,
stops scheduled oscillators and clears track routes. Seeking into a held note
rearticulates its remaining duration. Loop endpoints clip newly scheduled notes;
changing speed preserves the musical position. `dispose` releases the context.
Browser audio still needs a user gesture. Test results cover lifecycle and data
bounds; they do not certify perceptual fidelity or replace audible-device testing.

## Static Content Security Policy

The public static build hashes its single executable script and page stylesheet.
`PLAYBACK_SCORE_STYLE`, exported from `src/notation.mjs`, is the one fixed runtime
SVG stylesheet and has a separate exact hash in `_headers`. Hosts that externalize
page JS/CSS should retain that runtime-style hash alongside `self`. Voice colors
use fixed classes, so inline style attributes are not required. The generated
policy disallows inline script/style attributes and never uses `unsafe-inline`.
