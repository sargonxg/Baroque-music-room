import test from 'node:test';
import assert from 'node:assert/strict';
import { alternateMovements, makeRepertoireShuffle, repertoireFamily, repertoireId, searchRepertoire } from '../src/repertoire.mjs';

const shelf = [
  {id:'bwv772', composer:'bach', composerName:'Johann Sebastian Bach', title:'Invention in C major', collection:'Curated complete selection'},
  {id:'bwv787', composer:'bach', composerName:'Johann Sebastian Bach', title:'Sinfonia I', collection:'Curated complete selection'},
  {id:'la-poule', composer:'rameau', composerName:'Jean-Philippe Rameau', title:'La Poule', family:'Pièces de clavecin'},
  {id:'les-tendres-plaintes', composer:'rameau', composerName:'Jean-Philippe Rameau', title:'Les tendres plaintes', family:'Pièces de clavecin'},
];

test('shuffle changes composer where the remaining pool allows it and exhausts all selections', () => {
  const bag = makeRepertoireShuffle(shelf, () => 0);
  let current = shelf[0].id;
  const listened = new Set([current]);
  for (let count = 1; count < shelf.length; count++) {
    const next = bag.next(current);
    assert.ok(!listened.has(next));
    assert.notEqual(shelf.find(p => p.id === next).composer, shelf.find(p => p.id === current).composer);
    listened.add(next);
    current = next;
  }
  assert.notEqual(bag.next(current), current);
  assert.equal(listened.size, shelf.length);
});

test('a manual selection counts as heard and a one-item or empty shelf is safe', () => {
  const bag = makeRepertoireShuffle(shelf, () => 0);
  bag.mark('la-poule');
  assert.equal(bag.next('bwv772'), 'les-tendres-plaintes');
  assert.equal(makeRepertoireShuffle([]).next(''), null);
  assert.equal(makeRepertoireShuffle([shelf[0]]).next('bwv772'), 'bwv772');
});

test('search matches accents, catalogue numbers, family and composer independently', () => {
  assert.deepEqual(searchRepertoire(shelf,'pieces poule').map(p => p.id), ['la-poule']);
  assert.equal(searchRepertoire(shelf,'Bwv772','Two-part Inventions','bach').length,1);
  assert.equal(searchRepertoire(shelf,'major','','rameau').length,0);
  assert.equal(searchRepertoire(shelf,'','Pièces de clavecin').length,2);
  assert.equal(repertoireFamily(shelf[1]), 'Three-part Sinfonias');
});

test('archived edition links lead to the same discovery identity as the complete authored score', () => {
  assert.equal(repertoireId('scarlatti-k11'), 'scarlatti11');
  assert.equal(repertoireId('handel-overture'), 'handel-01-overture');
  assert.equal(repertoireId('bwv772'), 'bwv772');
  assert.equal(alternateMovements.size, 2);
});
