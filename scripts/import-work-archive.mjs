import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';

const dumpPath = process.argv[2];
assert(dumpPath, 'Pass a saved copy of https://api.openopus.org/work/dump.json');
const source = await readFile(dumpPath);
const dump = JSON.parse(source);
const groups = [];
const genres = [];
const entries = [];
for (const composer of dump.composers.filter(composer => composer.epoch === 'Baroque')) {
  const composerIndex = groups.length;
  groups.push(composer.complete_name);
  const keys = new Set();
  for (const work of composer.works) {
    const title = work.title.trim();
    const subtitle = work.subtitle?.trim() || '';
    const key = (title + '\0' + subtitle).normalize('NFC').toLocaleLowerCase('en');
    if (!title || keys.has(key)) continue;
    keys.add(key);
    const genre = work.genre || 'Other';
    if (!genres.includes(genre)) genres.push(genre);
    entries.push([composerIndex, title, subtitle, genres.indexOf(genre)]);
  }
}
assert(entries.length >= 5000, 'Open Opus archive should preserve the actual Baroque catalogue');
const archive = {format: 'open-opus-baroque-archive/1', composers: groups, genres, entries};
const bytes = Buffer.from(JSON.stringify(archive));
const packed = gzipSync(bytes, {level: 9});
const file = 'open-opus-baroque.json.gz';
await mkdir('data/archive', {recursive: true});
await writeFile('data/archive/' + file, packed);
const hash = value => createHash('sha256').update(value).digest('hex');
await writeFile('data/archive/manifest.json', JSON.stringify({
  format: archive.format, file, entries: entries.length, composers: groups.length, source: 'https://api.openopus.org/work/dump.json',
  licence: 'Public domain (Open Opus)', project: 'https://www.openopus.org/', checkedOn: '2026-11-24',
  sourceSha256: hash(source), sha256: hash(packed), bytes: packed.length, expandedBytes: bytes.length,
  derivation: 'Baroque epoch only. Composer, title, subtitle and genre from the source. Exact duplicate titles and subtitles within a composer are removed.',
}, null, 2) + '\n');
console.log(JSON.stringify({entries: entries.length, composers: groups.length, bytes: packed.length}));
