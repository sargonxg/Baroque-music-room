import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {after, before, test} from 'node:test';
import {gunzipSync} from 'node:zlib';
import {loadLibraryStudy, encodeLibraryMidi} from '../src/edition-library.mjs';
import {validateStudy} from '../src/engine.mjs';
import {renderPlaybackScore} from '../src/notation.mjs';

const root = new URL('../', import.meta.url);
const catalogue = JSON.parse(await readFile(new URL('data/edition-library.json', root)));
const lock = JSON.parse(await readFile(new URL('scripts/editions/sources.json', root)));
const packs = new Set(catalogue.pieces.map(piece => piece.pack));
const base = 'https://room.example/';
const nativeFetch = globalThis.fetch;
before(() => {
  globalThis.fetch = async (url, {signal} = {}) => {
    signal?.throwIfAborted();
    const resource = new URL(url);
    const path = resource.pathname.slice(1);
    if (resource.origin + '/' !== base || !packs.has(path)) return new Response(null, {status:404});
    const bytes = await readFile(new URL(path, root));
    return new Response(resource.searchParams.has('plain') ? gunzipSync(bytes) : bytes);
  };
});
after(() => { globalThis.fetch = nativeFetch; });

test('each new selection has a distinct verified MIDI and a licensed edition with a score', async () => {
  const ids = new Set(), hashes = new Set(), authors = new Set();
  const original = ['curated-fifty', 'curated-supplement', 'catalogue'];
  for (const file of original) {
    const data = JSON.parse(await readFile(new URL('data/' + file + '.json', root)));
    for (const piece of data.pieces ?? [...data.works.flatMap(work => work.movements), ...data.miniatures]) ids.add(piece.id);
  }
  const records = new Map(lock.pieces.map(item => [item.id,item]));
  for (const piece of catalogue.pieces) {
    assert.ok(!ids.has(piece.id), piece.id); ids.add(piece.id);
    assert.ok(!hashes.has(piece.sha256), piece.id); hashes.add(piece.sha256);
    authors.add(piece.composer);
    const entry = records.get(piece.id), edition = lock.editions[entry.publication];
    assert.equal(piece.source, edition.page);
    assert.equal(piece.license, edition.license);
    assert.equal(piece.sha256, entry.sha256);
    assert.match(piece.pack, /^assets\/editions\/[a-z0-9-]+\.json\.gz$/);
    assert.ok(piece.attribution && piece.edition && piece.instrumentation && piece.noteCount > 0);
    assert.ok([piece.scoreUrl,piece.source,piece.licenseUrl,piece.recordingSearch].every(url => new URL(url).protocol === 'https:'));
  }
  assert.ok(hashes.size >= 200);
  assert.ok(authors.size >= 10);
  assert.equal(catalogue.pieces.filter(piece => piece.family === 'Goldberg Variations').length, 31);
  assert.equal(catalogue.pieces.filter(piece => piece.family === 'The Four Seasons').length, 12);
  assert.equal(catalogue.pieces.filter(piece => piece.composer === 'royer').length, 14);
  const toccatas = [...catalogue.pieces, ...catalogue.references].filter(piece => piece.family === 'Keyboard toccatas');
  assert.deepEqual(toccatas.map(piece => +piece.title.match(/BWV (\d+)/)[1]).sort(), [910,911,912,913,914,915,916]);
  assert.ok(catalogue.references.every(piece => !piece.pack && !ids.has(piece.id)));
});

test('every complete selection opens, follows the source clock and downloads the original SMF', async () => {
  for (const piece of catalogue.pieces) {
    const study = await loadLibraryStudy(piece, {base});
    assert.equal(validateStudy(study), study);
    assert.equal(study.tracks.length, piece.trackCount, piece.id);
    assert.ok(Math.abs(study.duration - piece.seconds) < .001, piece.id);
    assert.equal(study.tracks.reduce((total, track) => total + track.notes.length, 0), piece.noteCount, piece.id);
    assert.equal(study.notationMetadata.barTimes[0].seconds, 0);
    assert.equal(study.measureTimes.at(-1).end, study.duration);
    for (const track of study.tracks) {
      assert.equal(track.actualVoice, false);
      assert.match(track.label, /^Track \d+/);
      assert.ok(track.notes.every((note, i) => note[3] > 0 && note[3] <= 1 &&
        (!i || note[1] >= track.notes[i-1][1]) && note[1] + note[2] <= study.duration + 0.000001), piece.id);
    }
    const raw = encodeLibraryMidi(study);
    assert.equal(new TextDecoder().decode(raw.subarray(0,4)), 'MThd');
    assert.equal(createHash('sha256').update(raw).digest('hex'), piece.sha256, piece.id);
    const bar = study.notationMetadata.barTimes.at(-1);
    const view = renderPlaybackScore(study, {...study.notationMetadata, position:bar.seconds, width:500});
    assert.ok(view.svg.includes('<svg'), piece.id);
  }
});

test('also accepts static hosts with transport decompression and cancels cached requests', async () => {
  const piece = catalogue.pieces[0];
  const single = {...piece, pack:piece.pack + '?plain=1'};
  const result = await loadLibraryStudy(single, {base});
  assert.equal(result.id, piece.id);
  const signal = AbortSignal.abort();
  await assert.rejects(loadLibraryStudy(single, {base, signal}), {name:'AbortError'});
  await assert.rejects(loadLibraryStudy({...single, id: 'missing-movement'}, {base}), /missing/);
});
