/** Only the chosen family is fetched. Keep the last two decoded packs. */
const editionFamilyCache = new Map();
const editionSourceMidi = new WeakMap();
const editionTrackColors = ['#b74131', '#246a74', '#825813', '#744f82', '#436f94', '#96425f'];

function editionTickClock(tempos, ppq) {
  const changes = [];
  let previousTick = 0, previousRate = 500000, seconds = 0;
  for (const [tick, microsecondsPerQuarter] of tempos) {
    seconds += (tick - previousTick) * previousRate / (ppq * 1e6);
    changes.push({tick, seconds, microsecondsPerQuarter});
    previousTick = tick;
    previousRate = microsecondsPerQuarter;
  }
  const at = tick => {
    let low = 0, high = changes.length;
    while (low + 1 < high) {
      const middle = (low + high) >>> 1;
      if (changes[middle].tick <= tick) low = middle;
      else high = middle;
    }
    const section = changes[low];
    return section.seconds + (tick - section.tick) * section.microsecondsPerQuarter / (ppq * 1e6);
  };
  return {at, changes};
}

function editionStudyFromEntry(piece, item) {
  const clock = editionTickClock(item.tempos, item.ppq);
  const duration = clock.at(item.endTick);
  const meters = item.meters.map(([tick, numerator, denominator]) => ({tick, numerator, denominator}));
  const keys = item.keys.map(([tick, sharps, minor]) => ({tick, sharps, minor}));
  const barTimes = [];
  for (let i = 0; i < meters.length; i++) {
    const m = meters[i], limit = meters[i + 1]?.tick ?? item.endTick;
    const ticksPerBar = item.ppq * m.numerator * 4 / m.denominator;
    for (let tick = m.tick; tick < limit; tick += ticksPerBar) {
      barTimes.push({bar: barTimes.length + 1, seconds: clock.at(tick)});
    }
  }
  const tracks = item.tracks.map((track, index) => {
    let tick = 0;
    const notes = track.notes.map(([delta, length, pitch, velocity]) => {
      tick += delta;
      const start = clock.at(tick);
      return [pitch, start, clock.at(tick + length) - start, velocity / 127];
    });
    // Old LilyPond versions sometimes write a generator credit as a track name.
    const name = track.label && !/^(?:creator|generated|track ?\d|gnu lilypond|control track)/i.test(track.label)
      ? track.label : '';
    return {id: 'track-' + (index + 1), label: 'Track ' + (index + 1) + (name ? ' · ' + name : ''),
      actualVoice: false, color: editionTrackColors[index % editionTrackColors.length], notes};
  });
  const meter = meters[0];
  const study = {id: piece.id, title: piece.title, duration, tracks,
    measureTimes: barTimes.map((bar, index) => ({number: bar.bar, start: bar.seconds,
      end: barTimes[index + 1]?.seconds ?? duration})),
    notationMetadata: {ppq: item.ppq, secondsPerBeat: clock.changes[0].microsecondsPerQuarter / 1e6,
      beatsPerBar: meter.numerator * 4 / meter.denominator, meter, meters, barTimes,
      tempos: clock.changes, keys, preferFlats: (keys[0]?.sharps ?? -1) < 0,
      inference: 'Beat grid from source MIDI tempo and meter. Pickups, spelling, rests and clefs are inferred.'}};
  editionSourceMidi.set(study, item.midi);
  return study;
}

export async function loadLibraryStudy(piece, {signal, base = globalThis.document?.baseURI} = {}) {
  const url = new URL(piece.pack, base).href;
  let pack = editionFamilyCache.get(url);
  if (!pack) {
    const response = await fetch(url, {signal, credentials:'same-origin'});
    if (!response.ok) throw new Error('This source edition could not be opened. Try it again.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > 8_000_000) throw new Error('Unexpected source edition size');
    // Static hosts can serve a .gz file verbatim or decompress via Content-Encoding.
    const data = bytes[0] === 31 && bytes[1] === 139
      ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
      : new TextDecoder().decode(bytes);
    pack = JSON.parse(data);
    if (pack.version !== 1 || !pack.items) throw new Error('Unsupported edition pack');
    signal?.throwIfAborted();
    if (editionFamilyCache.size === 2) editionFamilyCache.delete(editionFamilyCache.keys().next().value);
    editionFamilyCache.set(url, pack);
  }
  signal?.throwIfAborted();
  const item = pack.items[piece.id];
  if (!item) throw new Error('This movement is missing from its source edition.');
  return editionStudyFromEntry(piece, item);
}

/** Return the publisher's byte-identical original, including its tempo map. */
export function encodeLibraryMidi(study) {
  const original = editionSourceMidi.get(study);
  if (!original) throw new Error('The source MIDI has not been loaded.');
  return Uint8Array.from(atob(original), letter => letter.charCodeAt(0));
}
