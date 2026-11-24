/** Optional bibliography. Audio and score assets are handled by the study desk. */
export function connectWorkArchive(record) {
  const panel = document.getElementById('work-archive');
  const search = document.getElementById('work-search');
  const composer = document.getElementById('work-composer');
  const genre = document.getElementById('work-genre');
  const rows = document.getElementById('archive-works');
  const status = document.getElementById('archive-work-count');
  const previous = document.getElementById('archive-prev');
  const next = document.getElementById('archive-next');
  let data;
  let loading = false;
  let page = 0;
  const perPage = 16;

  const foldTitle = value => value.normalize('NFD').replace(/\p{Mark}/gu, '').toLocaleLowerCase();
  const link = (href, label) => {
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.textContent = label;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    return anchor;
  };

  function render() {
    if (!data) return;
    const terms = foldTitle(search.value).trim().split(/\s+/).filter(Boolean).slice(0,8);
    const matches = data.entries.filter(row =>
      (!composer.value || String(row[0]) === composer.value) &&
      (!genre.value || String(row[3]) === genre.value) &&
      terms.every(term => row[4].includes(term)));
    const start = page * perPage;
    const end = Math.min(start + perPage, matches.length);
    rows.replaceChildren();
    status.textContent = matches.length
      ? (start + 1).toLocaleString() + '–' + end.toLocaleString() + ' of ' + matches.length.toLocaleString()
      : 'No works match. Try another title, composer or genre.';
    previous.disabled = page === 0;
    next.disabled = end >= matches.length;
    for (const [authorIndex, title, subtitle, genreIndex] of matches.slice(start, end)) {
      const author = data.composers[authorIndex];
      const row = document.createElement('li');
      const heading = document.createElement('strong');
      heading.textContent = title;
      const meta = document.createElement('p');
      meta.textContent = [author, subtitle, data.genres[genreIndex]].filter(Boolean).join(' · ');
      const links = document.createElement('div');
      const query = encodeURIComponent(author + ' ' + title);
      links.append(link('https://imslp.org/index.php?title=Special%3ASearch&search=' + query, 'Find a score'),
        link('https://www.youtube.com/results?search_query=' + query, 'Find a recording'));
      row.append(heading, meta, links);
      rows.append(row);
    }
  }

  async function load() {
    if (!panel.open || data || loading || !record) return;
    loading = true;
    status.textContent = 'Opening the works catalogue…';
    try {
      if (!globalThis.DecompressionStream) throw new Error('Compressed catalogue unavailable.');
      const response = await fetch('data/archive/' + record.file, {credentials: 'same-origin'});
      if (!response.ok || !response.body) throw new Error('Catalogue unavailable.');
      const reader = response.body.pipeThrough(new DecompressionStream('gzip')).getReader();
      const decoder = new TextDecoder();
      let json = '';
      let bytes = 0;
      try {
        for (;;) {
          const {value,done} = await reader.read();
          if (done) break;
          bytes += value.length;
          if (bytes > record.expandedBytes) throw new Error('Catalogue size mismatch.');
          json += decoder.decode(value, {stream:true});
        }
      } finally { await reader.cancel(); }
      const archive = JSON.parse(json + decoder.decode());
      if (archive.format !== record.format || archive.entries.length !== record.entries) throw new Error('Catalogue mismatch.');
      for (const [index, name] of archive.composers.entries()) composer.add(new Option(name, index));
      for (const [index, name] of archive.genres.entries()) genre.add(new Option(name, index));
      for (const row of archive.entries) row.push(foldTitle(archive.composers[row[0]] + ' ' + row[1] + ' ' + row[2]));
      data = archive;
      render();
    } catch {
      status.textContent = 'The archive could not load. Reopen it to try again, or browse Open Opus.';
    } finally {
      loading = false;
    }
  }

  panel.addEventListener('toggle', load);
  const refilter = () => {page = 0; render();};
  search.addEventListener('input', refilter);
  composer.addEventListener('change', refilter);
  genre.addEventListener('change', refilter);
  previous.addEventListener('click', () => {page = Math.max(0, page - 1); render();});
  next.addEventListener('click', () => {page++; render();});
  function openFromLink() {
    if (location.hash === '#catalogue') panel.open = true;
  }
  window.addEventListener('hashchange', openFromLink);
  openFromLink();
  if (panel.open) void load();
}
