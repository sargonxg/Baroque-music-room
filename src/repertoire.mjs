/** Both source documents remain directly addressable. Discovery uses the authored score. */
export const alternateMovements = new Map([['scarlatti-k11','scarlatti11'],['handel-overture','handel-01-overture']]);
export const repertoireId = id => alternateMovements.get(id) || id;

/** A new performance is drawn only after every remaining selection had a turn. */
export function makeRepertoireShuffle(pieces, random = Math.random) {
  const byId = new Map(pieces.map(piece => [piece.id, piece]));
  let remaining = new Set(byId.keys());
  const pick = list => list[Math.floor(random() * list.length)];
  return {
    mark(id) { remaining.delete(id); },
    next(current) {
      if (!byId.size) return null;
      remaining.delete(current);
      if (!remaining.size) {
        remaining = new Set(byId.keys());
        if (remaining.size > 1) remaining.delete(current);
      }
      const byComposer = new Map();
      for (const id of remaining) {
        const {composer} = byId.get(id);
        if (!byComposer.has(composer)) byComposer.set(composer, []);
        byComposer.get(composer).push(id);
      }
      const currentComposer = byId.get(current)?.composer;
      if (byComposer.size > 1) byComposer.delete(currentComposer);
      const id = pick(pick([...byComposer.values()]));
      remaining.delete(id);
      return id;
    },
  };
}

export function repertoireFamily(piece) {
  if (piece.family) return piece.family;
  if (piece.collection && !['Curated complete selection','Selected miniature'].includes(piece.collection)) return piece.collection;
  const bwv = Number(piece.id.match(/^bwv(\d+)/)?.[1]);
  if (bwv >= 772 && bwv <= 786) return 'Two-part Inventions';
  if (bwv >= 787 && bwv <= 801) return 'Three-part Sinfonias';
  if (bwv >= 846 && bwv <= 893) return 'The Well-Tempered Clavier';
  if (bwv >= 924 && bwv <= 932) return 'Short preludes';
  return 'Keyboard pieces';
}

export function searchRepertoire(pieces, query = '', family = '', composer = '') {
  const folded = value => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const words = folded(query.trim()).split(/\s+/).filter(Boolean);
  return pieces.filter(piece => {
    if (family && repertoireFamily(piece) !== family || composer && piece.composer !== composer) return false;
    const entry = folded([piece.title,piece.composerName,repertoireFamily(piece),piece.id].join(' '));
    return words.every(word => entry.includes(word));
  });
}
